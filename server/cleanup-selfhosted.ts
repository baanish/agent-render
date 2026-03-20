import path from "node:path";
import { SelfHostedArtifactStore } from "../src/lib/selfhosted/store.ts";

const dbPath = path.resolve(process.cwd(), process.env.AGENT_RENDER_DB_PATH ?? ".data/agent-render-selfhosted.sqlite");
const store = new SelfHostedArtifactStore({ dbPath });
const deleted = store.cleanupExpired();
store.close();
console.log(`Removed ${deleted} expired self-hosted artifact${deleted === 1 ? "" : "s"}.`);
