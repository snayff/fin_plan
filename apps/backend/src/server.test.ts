import { describe, it, expect, mock, beforeEach } from "bun:test";

// Importing server.ts must NOT start a listening server during tests.
process.env.FINPLAN_SKIP_AUTOSTART = "true";

const { createShutdownHandler, registerProcessHandlers } = await import("./server");

function makeServer() {
  return {
    log: { info: mock(() => {}), error: mock(() => {}), fatal: mock(() => {}) },
    close: mock(async () => {}),
  };
}

function makePrisma() {
  return { $disconnect: mock(async () => {}) };
}

describe("createShutdownHandler (RES-4)", () => {
  it("closes the server and disconnects prisma, in that order, then exits 0", async () => {
    const server = makeServer();
    const prisma = makePrisma();
    const exit = mock((_code?: number) => {});
    const order: string[] = [];
    server.close.mockImplementation(async () => {
      order.push("close");
    });
    prisma.$disconnect.mockImplementation(async () => {
      order.push("disconnect");
    });

    const shutdown = createShutdownHandler({
      server: server as any,
      prisma: prisma as any,
      deadlineMs: 5000,
      exit: exit as any,
    });
    await shutdown("SIGTERM");

    expect(server.close).toHaveBeenCalledTimes(1);
    expect(prisma.$disconnect).toHaveBeenCalledTimes(1);
    expect(order).toEqual(["close", "disconnect"]);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("forces exit(1) via the deadline timer if graceful close hangs", async () => {
    const server = makeServer();
    const prisma = makePrisma();
    const exit = mock((_code?: number) => {});
    // server.close never resolves -> graceful path hangs
    server.close.mockImplementation(() => new Promise<void>(() => {}));

    const shutdown = createShutdownHandler({
      server: server as any,
      prisma: prisma as any,
      deadlineMs: 20,
      exit: exit as any,
    });
    void shutdown("SIGINT");

    await new Promise((r) => setTimeout(r, 60));
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("still exits (non-zero) if disconnect throws", async () => {
    const server = makeServer();
    const prisma = makePrisma();
    const exit = mock((_code?: number) => {});
    prisma.$disconnect.mockImplementation(async () => {
      throw new Error("pool drain failed");
    });

    const shutdown = createShutdownHandler({
      server: server as any,
      prisma: prisma as any,
      deadlineMs: 5000,
      exit: exit as any,
    });
    await shutdown("SIGTERM");

    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(1);
  });
});

describe("registerProcessHandlers (RES-6)", () => {
  let added: Record<string, Array<(...args: any[]) => unknown>>;
  let originalOn: typeof process.on;

  beforeEach(() => {
    added = {};
    originalOn = process.on.bind(process);
    (process as any).on = (event: string, listener: (...args: any[]) => unknown) => {
      (added[event] ??= []).push(listener);
      return process;
    };
  });

  function restore() {
    (process as any).on = originalOn;
  }

  it("registers SIGINT, SIGTERM, unhandledRejection and uncaughtException", () => {
    const server = makeServer();
    const prisma = makePrisma();
    registerProcessHandlers({
      server: server as any,
      prisma: prisma as any,
      exit: mock(() => {}) as any,
    });
    restore();

    expect(Object.keys(added).sort()).toEqual(
      ["SIGINT", "SIGTERM", "uncaughtException", "unhandledRejection"].sort()
    );
  });

  it("uncaughtException handler logs and triggers a graceful shutdown", async () => {
    const server = makeServer();
    const prisma = makePrisma();
    const exit = mock((_code?: number) => {});
    registerProcessHandlers({
      server: server as any,
      prisma: prisma as any,
      exit: exit as any,
    });
    restore();

    const handler = added["uncaughtException"]![0]!;
    await handler(new Error("boom"));

    expect(server.log.fatal).toHaveBeenCalledTimes(1);
    // Graceful shutdown path invoked: server closed + prisma disconnected
    expect(server.close).toHaveBeenCalledTimes(1);
    expect(prisma.$disconnect).toHaveBeenCalledTimes(1);
  });

  it("unhandledRejection handler logs via the structured logger", () => {
    const server = makeServer();
    const prisma = makePrisma();
    registerProcessHandlers({
      server: server as any,
      prisma: prisma as any,
      exit: mock(() => {}) as any,
    });
    restore();

    const handler = added["unhandledRejection"]![0]!;
    handler(new Error("dangling"));
    expect(server.log.error).toHaveBeenCalledTimes(1);
  });
});
