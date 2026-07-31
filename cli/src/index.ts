import { runCli } from "./cli";

runCli(process.argv.slice(2)).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`agent-render: ${message}\n`);
  process.exitCode = 1;
});
