import chokidar from "chokidar";
import { mapSourceToTestFiles } from "./test-runner-helpers";

interface WatchOptions {
  testFiles: string[];
  filterPattern: string | undefined;
  runFiles: (files: string[]) => Promise<number>;
}

const DEBOUNCE_MS = 150;

export async function startWatchMode({
  testFiles,
  filterPattern,
  runFiles,
}: WatchOptions): Promise<void> {
  console.log(
    `\n👀  watching src/**/*.ts${filterPattern ? ` (filter: ${filterPattern})` : ""} — press Ctrl+C to exit\n`
  );

  // Initial run.
  const initial = filterPattern ? testFiles.filter((f) => f.includes(filterPattern)) : testFiles;
  await runFiles(initial);

  let pending = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;

  const schedule = (changedPath: string) => {
    pending.add(changedPath);
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      if (running) return;
      running = true;
      const batch = Array.from(pending);
      pending.clear();

      const affected = new Set<string>();
      for (const p of batch) {
        for (const t of mapSourceToTestFiles(p, testFiles, filterPattern)) {
          affected.add(t);
        }
      }

      if (affected.size === 0) {
        console.log(`\n(no matching tests for: ${batch.join(", ")})\n`);
      } else {
        console.log(`\n— rerun (${Array.from(affected).join(", ")}) —\n`);
        await runFiles(Array.from(affected).sort());
      }
      running = false;
      console.log(`\n👀  watching… (Ctrl+C to exit)\n`);
    }, DEBOUNCE_MS);
  };

  const watcher = chokidar.watch(["src/**/*.ts"], {
    ignored: ["**/node_modules/**", "**/*.d.ts"],
    ignoreInitial: true,
  });

  watcher.on("change", schedule);
  watcher.on("add", schedule);

  // Keep process alive until interrupted.
  await new Promise<void>((resolve) => {
    process.on("SIGINT", () => {
      watcher.close().then(() => {
        console.log("\nwatch mode stopped.");
        resolve();
      });
    });
  });
}
