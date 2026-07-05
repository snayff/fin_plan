import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prismaClientSingleton = () => {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });
};

declare global {
  var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>;
}

export const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();

if (process.env.NODE_ENV !== "production") {
  globalThis.prismaGlobal = prisma;
}

// Fallback pool drain. NOTE: `beforeExit` does NOT fire after an explicit
// `process.exit()`, so this is only a best-effort safety net for a natural
// event-loop drain. The primary, reliable disconnect lives in the signal
// handler in server.ts (see createShutdownHandler).
process.on("beforeExit", async () => {
  await prisma.$disconnect();
});
