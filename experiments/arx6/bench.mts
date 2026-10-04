/** Quick current-checkout versus frozen prototype comparison; use compare.mjs for exact refs. */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const inputPath = process.argv[2];
if (!inputPath) throw new Error("Usage: node --import tsx experiments/arx6/bench.mts corpus.json");
const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, "../..");
const temporary = mkdtempSync(path.join(os.tmpdir(), "arx6-comparison-"));
const outputPath = path.join(temporary, "report.json");
try {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(directory, "compare.mjs"),
      "--corpus", path.resolve(inputPath), "--variant", `current=${root}`, "--prototype", "--out", outputPath],
    { stdio: ["ignore", "ignore", "inherit"] });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve() : reject(new Error(`Benchmark exited ${code}`)));
  });
  process.stdout.write(readFileSync(outputPath, "utf8"));
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
