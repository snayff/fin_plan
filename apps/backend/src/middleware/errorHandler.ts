import type { FastifyError, FastifyRequest, FastifyReply } from "fastify";
import { AppError } from "../utils/errors";
import { ZodError } from "zod";

/**
 * Extract user-friendly message from Prisma validation error
 */
function parsePrismaValidationError(message: string): string {
  // Extract field name from "Argument `fieldName` is missing" or similar
  const missingFieldMatch = message.match(/Argument `(\w+)` is missing/);
  if (missingFieldMatch) {
    const fieldName = missingFieldMatch[1];
    return `Required field '${fieldName}' is missing. Please check your input and try again.`;
  }

  // Extract invalid value message
  const invalidValueMatch = message.match(/Argument `(\w+)`.*?invalid/i);
  if (invalidValueMatch) {
    const fieldName = invalidValueMatch[1];
    return `Invalid value provided for '${fieldName}'. Please check your input and try again.`;
  }

  // Generic Prisma error
  return "Invalid data provided. Please check your input and try again.";
}

/** Shape of a Prisma known request error, narrowed without casting to any. */
interface PrismaKnownRequestError {
  code?: string;
  meta?: Record<string, unknown>;
}

function asPrismaKnownRequestError(error: unknown): PrismaKnownRequestError {
  if (error !== null && typeof error === "object") {
    const { code, meta } = error as { code?: unknown; meta?: unknown };
    return {
      code: typeof code === "string" ? code : undefined,
      meta:
        meta !== null && typeof meta === "object" ? (meta as Record<string, unknown>) : undefined,
    };
  }
  return {};
}

/**
 * Global error handler.
 *
 * Client responses carry only user-facing messages; raw validation issues,
 * constraint metadata, and ORM internals stay in the server logs.
 */
export async function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
) {
  // Log error for debugging
  request.log.error(error);

  // Handle AppError instances
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      error: {
        message: error.message,
        code: error.code,
        statusCode: error.statusCode,
      },
    });
  }

  // Handle Zod validation errors
  if (error instanceof ZodError) {
    // Format Zod errors into a more readable format. Only the field path and
    // message reach the client — raw issue objects stay in server logs.
    const fieldErrors = error.errors.map((err) => ({
      field: err.path.join("."),
      message: err.message,
    }));
    const formattedErrors = fieldErrors.map((e) => `${e.field}: ${e.message}`);

    // Create a user-friendly message
    const userMessage =
      formattedErrors.length === 1
        ? formattedErrors[0]
        : `Validation failed:\n${formattedErrors.map((e, i) => `${i + 1}. ${e}`).join("\n")}`;

    return reply.status(400).send({
      error: {
        message: userMessage,
        code: "VALIDATION_ERROR",
        statusCode: 400,
        details: fieldErrors,
      },
    });
  }

  // Handle Fastify validation errors (schema failures). Only messages reach
  // the client; the raw validation objects stay in server logs.
  if (error.validation) {
    return reply.status(400).send({
      error: {
        message: error.message || "Validation failed",
        code: "VALIDATION_ERROR",
        statusCode: 400,
      },
    });
  }

  // Handle Prisma validation errors (e.g., missing required fields)
  // Only catch if it's specifically a Prisma invocation error with argument issues
  if (
    error.message &&
    error.message.includes("Invalid `") &&
    (error.message.includes("invocation") || error.message.includes("Argument"))
  ) {
    const userMessage = parsePrismaValidationError(error.message);
    return reply.status(400).send({
      error: {
        message: userMessage,
        code: "VALIDATION_ERROR",
        statusCode: 400,
      },
    });
  }

  // Handle Prisma known request errors (unique constraint, foreign key, etc.)
  if (error.name === "PrismaClientKnownRequestError") {
    const prismaError = asPrismaKnownRequestError(error);
    let message = "Database operation failed";

    // P2002: Unique constraint violation. The violated columns are logged
    // server-side (request.log.error above) but never sent to the client.
    if (prismaError.code === "P2002") {
      message = "A record with these details already exists";
    }
    // P2025: Record not found
    else if (prismaError.code === "P2025") {
      message = "The requested record was not found";
    }
    // P2003: Foreign key constraint violation
    else if (prismaError.code === "P2003") {
      message = "Invalid reference to related record";
    }

    return reply.status(400).send({
      error: {
        message,
        code: "DATABASE_ERROR",
        statusCode: 400,
      },
    });
  }

  // Handle Prisma initialization errors
  if (error.name === "PrismaClientInitializationError") {
    return reply.status(500).send({
      error: {
        message: "Database connection failed. Please try again later.",
        code: "DATABASE_CONNECTION_ERROR",
        statusCode: 500,
      },
    });
  }

  // Handle errors that carry their own HTTP status code (e.g. rate-limit 429)
  if (error.statusCode && error.statusCode < 500) {
    return reply.status(error.statusCode).send({
      error: {
        message: error.message,
        code: error.code || "HTTP_ERROR",
        statusCode: error.statusCode,
      },
    });
  }

  // Default internal server error
  return reply.status(500).send({
    error: {
      message: process.env.NODE_ENV === "production" ? "Internal server error" : error.message,
      code: "INTERNAL_ERROR",
      statusCode: 500,
    },
  });
}
