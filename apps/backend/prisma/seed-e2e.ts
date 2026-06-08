// Minimal baseline state for E2E. Per-test users are created via API.
import { prisma } from "../src/config/database";

if (process.env.NODE_ENV === "production") {
  console.error("seed-e2e refused: NODE_ENV=production");
  process.exit(1);
}

async function main() {
  console.log("seed-e2e complete (baseline state; all user data wiped by reset-e2e-db.ts)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
