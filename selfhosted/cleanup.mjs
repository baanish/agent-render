import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { openArtifactStore } from "./artifact-db.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const databasePath = process.env.DATABASE_PATH || path.join(repoRoot, "data", "artifacts.sqlite");

const store = openArtifactStore(databasePath);
const removed = store.purgeExpired();
console.log(`Purged ${removed} expired artifact(s).`);
store.db.close();
