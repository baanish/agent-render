import { mkdir, access, writeFile } from "node:fs/promises";
import { constants } from "node:fs";

const files = [
  [".next/types/app/layout.ts", "export {};\n"],
  [".next/types/app/page.ts", "export {};\n"],
  [".next/types/cache-life.d.ts", "export {};\n"],
];

for (const [filePath, contents] of files) {
  try {
    await access(filePath, constants.F_OK);
  } catch {
    const directory = filePath.slice(0, filePath.lastIndexOf("/"));
    await mkdir(directory, { recursive: true });
    await writeFile(filePath, contents, "utf8");
  }
}
