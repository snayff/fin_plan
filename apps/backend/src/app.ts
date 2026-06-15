import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import csrf from "@fastify/csrf-protection";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { config } from "./config/env";
import { verifyAccessToken } from "./utils/jwt";
import { authRoutes } from "./routes/auth.routes";
import { householdRoutes } from "./routes/households";
import { inviteRoutes } from "./routes/invite";
import { waterfallRoutes } from "./routes/waterfall.routes";
import { plannerRoutes } from "./routes/planner.routes";
import { settingsRoutes } from "./routes/settings.routes";
import { snapshotRoutes } from "./routes/snapshots.routes";
import { reviewRoutes } from "./routes/review-session.routes";
import { auditLogRoutes } from "./routes/audit-log.routes";
import { assetsRoutes } from "./routes/assets.routes";
import { forecastRoutes } from "./routes/forecast.routes";
import { giftsRoutes } from "./routes/gifts.routes";
import { cashflowRoutes } from "./routes/cashflow.routes";
import { searchRoutes } from "./routes/search.routes.js";
import { securityActivityRoutes } from "./routes/security-activity.routes.js";
import { errorHandler } from "./middleware/errorHandler";
import { prisma } from "./config/database";
import { startRetentionJob } from "./services/retention.service";
import { startRevocationCleanup } from "./utils/tokenBlacklist";

export async function buildApp(opts?: { logger?: boolean | object }): Promise<FastifyInstance> {
  const server = Fastify({
    logger: opts?.logger ?? false,
  });

  // Register global error handler
  server.setErrorHandler(errorHandler);

  // Register plugins
  await server.register(cors, {
    origin: config.CORS_ORIGIN.split(","),
    credentials: true,
  });

  await server.register(cookie, {
    secret: config.COOKIE_SECRET,
    parseOptions: {
      httpOnly: true,
      secure: config.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
    },
  });

  await server.register(csrf, {
    cookieOpts: {
      httpOnly: false, // Must be false so frontend can read it
      secure: config.NODE_ENV === "production",
      sameSite: "strict",
      path: "/", // Scope cookie to all paths (cookieOpts fully replaces defaults)
    },
    sessionPlugin: "@fastify/cookie",
  });

  await server.register(helmet, {
    contentSecurityPolicy: config.NODE_ENV === "production",
  });

  // Rate limiting is opt-out via RATE_LIMIT_ENABLED. It stays on in production (and any
  // env that doesn't set the flag). It is disabled in dev/E2E because the whole browser
  // suite reaches the backend through the Vite proxy from a single source IP, which would
  // otherwise exhaust the per-IP auth caps (register 10/h, login 5/15m) and fail the suite.
  if (config.RATE_LIMIT_ENABLED) {
    await server.register(rateLimit, {
      max: config.RATE_LIMIT_MAX,
      timeWindow: config.RATE_LIMIT_TIME_WINDOW,
      allowList: (req: { url: string }) => req.url === "/health",
      // Rate-limit per authenticated user so household members on the same IP don't share a bucket
      keyGenerator: (req: FastifyRequest) => {
        try {
          const auth = req.headers.authorization;
          if (auth?.startsWith("Bearer ")) {
            const payload = verifyAccessToken(auth.slice(7));
            if (payload.userId) return `user:${payload.userId}`;
          }
        } catch {
          // Fall through to IP-based limiting for unauthenticated requests
        }
        return req.ip;
      },
    });
  }

  // Health check endpoint
  server.get("/health", async () => {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  });

  // API routes
  server.register(authRoutes, { prefix: "/api/auth" });
  server.register(householdRoutes, { prefix: "/api" });
  server.register(inviteRoutes, { prefix: "/api/auth" });
  server.register(waterfallRoutes, { prefix: "/api/waterfall" });
  server.register(plannerRoutes, { prefix: "/api/planner" });
  server.register(settingsRoutes, { prefix: "/api/settings" });
  server.register(snapshotRoutes, { prefix: "/api/snapshots" });
  server.register(reviewRoutes, { prefix: "/api/review-session" });
  server.register(auditLogRoutes, { prefix: "/api" });
  server.register(assetsRoutes, { prefix: "/api/assets" });
  server.register(forecastRoutes, { prefix: "/api/forecast" });
  server.register(giftsRoutes, { prefix: "/api/gifts" });
  server.register(cashflowRoutes, { prefix: "/api/cashflow" });
  server.register(searchRoutes, { prefix: "/api/search" });
  server.register(securityActivityRoutes, { prefix: "/api" });

  startRetentionJob(prisma);
  startRevocationCleanup();

  return server;
}
