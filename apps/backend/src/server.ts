import type { FastifyInstance } from "fastify";
import { buildApp } from "./app";
import { config } from "./config/env";
import { prisma } from "./config/database";

/** Minimal Prisma surface the shutdown path depends on (kept narrow for testability). */
type Disconnectable = { $disconnect: () => Promise<void> };

/** How long graceful shutdown may take before we force-exit. */
const SHUTDOWN_DEADLINE_MS = 10_000;

interface ShutdownDeps {
  server: FastifyInstance;
  prisma: Disconnectable;
  deadlineMs?: number;
  exit?: (code?: number) => void;
}

/**
 * Build the graceful-shutdown routine (RES-4).
 *
 * `beforeExit` does NOT fire after an explicit `process.exit`, so Prisma's own
 * `beforeExit` hook can't be relied on to drain the pool. We therefore close the
 * HTTP server and disconnect Prisma explicitly here, and arm a deadline timer so a
 * hung close still forces the process down instead of wedging the container.
 */
export function createShutdownHandler({
  server,
  prisma,
  deadlineMs = SHUTDOWN_DEADLINE_MS,
  exit = process.exit,
}: ShutdownDeps): (reason: string) => Promise<void> {
  let shuttingDown = false;

  return async function shutdown(reason: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;

    server.log.info(`Received ${reason}, shutting down gracefully...`);

    // Force-exit if graceful shutdown hangs past the deadline.
    const deadline = setTimeout(() => {
      server.log.error(`Graceful shutdown exceeded ${deadlineMs}ms, forcing exit`);
      exit(1);
    }, deadlineMs);
    // Don't let the timer keep the event loop alive on its own.
    if (typeof (deadline as { unref?: () => void }).unref === "function") {
      (deadline as { unref: () => void }).unref();
    }

    try {
      await server.close();
      await prisma.$disconnect();
      clearTimeout(deadline);
      server.log.info("Shutdown complete");
      exit(0);
    } catch (err) {
      clearTimeout(deadline);
      server.log.error(err, "Error during graceful shutdown");
      exit(1);
    }
  };
}

interface ProcessHandlerDeps {
  server: FastifyInstance;
  prisma: Disconnectable;
  exit?: (code?: number) => void;
}

/**
 * Wire OS signal handlers (RES-4) and a process-level safety net (RES-6).
 *
 * `unhandledRejection` is logged structurally but left non-fatal. `uncaughtException`
 * leaves the process in an undefined state, so we log it and shut down gracefully
 * before exiting non-zero. (No third-party error tracker here — that's a later wave.)
 */
export function registerProcessHandlers({
  server,
  prisma,
  exit = process.exit,
}: ProcessHandlerDeps): void {
  const shutdown = createShutdownHandler({ server, prisma, exit });

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      void shutdown(signal);
    });
  }

  process.on("unhandledRejection", (reason) => {
    server.log.error({ reason }, "Unhandled promise rejection");
  });

  process.on("uncaughtException", (err) => {
    server.log.fatal(err, "Uncaught exception, shutting down");
    void shutdown("uncaughtException").then(() => {
      // shutdown() calls exit(0); ensure a non-zero code for an uncaught fault.
      exit(1);
    });
  });
}

async function start(): Promise<void> {
  const server = await buildApp({
    logger: {
      level: config.NODE_ENV === "production" ? "info" : "debug",
    },
  });

  try {
    await server.listen({
      port: config.PORT,
      host: "0.0.0.0",
    });

    server.log.info(`Server listening on http://localhost:${config.PORT}`);
    server.log.info(`Environment: ${config.NODE_ENV}`);
    server.log.info(`CORS Origin: ${config.CORS_ORIGIN}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }

  registerProcessHandlers({ server, prisma });
}

// Skip auto-start when the module is imported by unit tests.
if (process.env.FINPLAN_SKIP_AUTOSTART !== "true") {
  void start();
}
