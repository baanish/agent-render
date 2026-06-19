import { rm } from "node:fs/promises";

for (const directory of [".next", "out"]) {
  await rm(directory, { recursive: true, force: true });
}
