import { mkdirSync } from "node:fs";
import path from "node:path";
import { createSelfHostedServer } from "./selfhosted-app.ts";

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";
const dbPath = path.resolve(process.cwd(), process.env.AGENT_RENDER_DB_PATH ?? ".data/agent-render-selfhosted.sqlite");
const publicOrigin = process.env.AGENT_RENDER_PUBLIC_ORIGIN;

mkdirSync(path.dirname(dbPath), { recursive: true });

const { server, store } = createSelfHostedServer({ dbPath, publicOrigin });

server.listen(port, host, () => {
  console.log(`agent-render self-hosted mode listening on http://${host}:${port}`);
  console.log(`SQLite database: ${dbPath}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => {
      store.close();
      process.exit(0);
    });
  });
}
