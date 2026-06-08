import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");

export default async function globalSetup() {
  // Reset the database before the suite runs.
  // Assumes the docker-compose stack is already up.
  try {
    execSync(
      `docker compose -f "${path.join(repoRoot, "docker-compose.dev.yml")}" exec -T backend bun run db:reset-e2e`,
      { stdio: "inherit", cwd: repoRoot }
    );
  } catch (err) {
    throw new Error(
      `E2E global setup failed — is the stack running? Try 'bun run start' first.\n${err}`
    );
  }
}
