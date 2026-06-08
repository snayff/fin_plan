import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.string().default("3001").transform(Number),

  // Database
  DATABASE_URL: z.string().url(),

  // JWT
  JWT_SECRET: z
    .string()
    .min(32)
    .refine(
      (val) => {
        if (process.env.NODE_ENV === "production") {
          // Reject example/weak secrets in production
          const weakSecrets = [
            "your-super-secret",
            "change-this",
            "example",
            "test",
            "development",
            "password",
            "secret",
          ];
          return !weakSecrets.some((weak) => val.toLowerCase().includes(weak));
        }
        return true;
      },
      {
        message:
          "JWT_SECRET must be a strong random string in production. Generate with: openssl rand -base64 64",
      }
    ),
  JWT_REFRESH_SECRET: z
    .string()
    .min(32)
    .refine(
      (val) => {
        if (process.env.NODE_ENV === "production") {
          // Reject example/weak secrets in production
          const weakSecrets = [
            "your-super-secret",
            "change-this",
            "example",
            "test",
            "development",
            "password",
            "secret",
          ];
          return !weakSecrets.some((weak) => val.toLowerCase().includes(weak));
        }
        return true;
      },
      {
        message:
          "JWT_REFRESH_SECRET must be a strong random string in production. Generate with: openssl rand -base64 64",
      }
    ),
  JWT_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),

  // Cookie Security
  COOKIE_SECRET: z.string().min(32),

  // CSRF Protection
  CSRF_SECRET: z
    .string()
    .min(32)
    .optional()
    .refine(
      (val) => {
        if (process.env.NODE_ENV === "production") {
          return val !== undefined && val.length >= 32;
        }
        return true;
      },
      {
        message:
          "CSRF_SECRET is required in production (min 32 chars). Generate with: openssl rand -base64 64",
      }
    ),

  // CORS
  CORS_ORIGIN: z.string().default("http://localhost:3000"),

  // Rate Limiting
  RATE_LIMIT_MAX: z.string().default("500").transform(Number),
  RATE_LIMIT_TIME_WINDOW: z.string().default("15m"),

  // Email (SMTP)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().default("587").transform(Number),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  FROM_EMAIL: z.string().email().default("noreply@finplan.app"),
  APP_URL: z.string().url().default("http://localhost:3000"),
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.errors.map((err) => err.path.join(".")).join(", ");
      throw new Error(`Missing or invalid environment variables: ${missingVars}`, { cause: error });
    }
    throw error;
  }
}

export const config = validateEnv();
