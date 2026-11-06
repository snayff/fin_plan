/**
 * Base application error class
 */
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Authentication error
 */
export class AuthenticationError extends AppError {
  constructor(message: string = "Authentication failed") {
    super(message, 401, "AUTH_ERROR");
  }
}

/**
 * Authorization error
 */
export class AuthorizationError extends AppError {
  constructor(message: string = "Access denied") {
    super(message, 403, "FORBIDDEN");
  }
}

/**
 * Not found error
 */
export class NotFoundError extends AppError {
  constructor(message: string = "Resource not found") {
    super(message, 404, "NOT_FOUND");
  }
}

/**
 * Validation error
 */
export class ValidationError extends AppError {
  constructor(
    message: string = "Validation failed",
    public errors?: unknown[]
  ) {
    super(message, 400, "VALIDATION_ERROR");
  }
}

/**
 * Conflict error (e.g., duplicate email)
 */
export class ConflictError extends AppError {
  constructor(message: string = "Resource already exists") {
    super(message, 409, "CONFLICT");
  }
}

/**
 * Rate limit error
 */
export class RateLimitError extends AppError {
  constructor(message: string = "Too many requests") {
    super(message, 429, "RATE_LIMIT");
  }
}

/**
 * Narrow an unknown thrown value to a Prisma error carrying the given code
 * (e.g. "P2002" for a unique-constraint violation) without resorting to `any`.
 */
export function isPrismaErrorWithCode(err: unknown, code: string): boolean {
  return (
    err !== null &&
    typeof err === "object" &&
    "code" in err &&
    (err as { code?: unknown }).code === code
  );
}

/** True when the thrown value is a Prisma P2002 unique-constraint violation. */
export function isUniqueConstraintError(err: unknown): boolean {
  return isPrismaErrorWithCode(err, "P2002");
}
