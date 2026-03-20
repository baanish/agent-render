import { initDb, cleanupExpired, closeDb } from "./db.js";

/** Standalone cleanup script that removes expired artifacts and exits. */
initDb();
const deleted = cleanupExpired();
console.log(`Cleaned up ${deleted} expired artifact${deleted === 1 ? "" : "s"}.`);
closeDb();
