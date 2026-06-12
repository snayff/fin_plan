import { z } from "zod";

// Example/weak values rejected in production for every secret below.
const WEAK_SECRETS = [
  "your-super-secret",
  "change-this",
  "change-me",
  "example",
  "test",
  "development",
  "password",
  "secret",
];

const isWeakSecret = (val: string): boolean =>
  WEAK_SECRETS.some((weak) => val.toLowerCase().includes(weak));

/** A required secret (min 32 chars) that must not be a weak/example value in production. */
const strongSecret = (name: string) =>
  z
    .string()
    .min(32)
    .refine((val) => process.env.NODE_ENV !== "production" || !isWeakSecret(val), {
      message: `${name} must be a strong random string in production. Generate with: openssl rand -base64 64`,
    });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.string().default("3001").transform(Number),

  // Database
  DATABASE_URL: z.string().url(),

  // JWT
  JWT_SECRET: strongSecret("JWT_SECRET"),
  JWT_REFRESH_SECRET: strongSecret("JWT_REFRESH_SECRET"),
  JWT_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),

  // Cookie Security
  COOKIE_SECRET: strongSecret("COOKIE_SECRET"),

  // CSRF Protection
  CSRF_SECRET: z
    .string()
    .min(32)
    .optional()
    .refine(
      (val) => {
        if (process.env.NODE_ENV === "production") {
          return val !== undefined && val.length >= 32 && !isWeakSecret(val);
        }
        return true;
      },
      {
        message:
          "CSRF_SECRET is required in production (min 32 chars) and must be a strong random string. Generate with: openssl rand -base64 64",
      }
    ),

  // CORS
  CORS_ORIGIN: z.string().default("http://localhost:3000"),

  // Rate Limiting
  // Enabled by default so production (and any env that doesn't opt out) is protected.
  // Set RATE_LIMIT_ENABLED=false in dev/E2E, where the whole browser suite shares one
  // source IP through the Vite proxy and would otherwise exhaust the per-IP auth caps.
  RATE_LIMIT_ENABLED: z
    .string()
    .default("true")
    .transform((v) => v !== "false"),
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
