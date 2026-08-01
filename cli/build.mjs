import { build } from "esbuild";
import { chmod, copyFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

await rm("dist", { recursive: true, force: true });

await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  sourcemap: true,
  banner: { js: "#!/usr/bin/env node" },
  loader: { ".wasm": "file" },
  alias: {
    "@": fileURLToPath(new URL("../src", import.meta.url)),
    "brotli-wasm": fileURLToPath(new URL("../node_modules/brotli-wasm/index.node.js", import.meta.url)),
  },
});

await copyFile(
  fileURLToPath(new URL("../node_modules/brotli-wasm/pkg.node/brotli_wasm_bg.wasm", import.meta.url)),
  "dist/brotli_wasm_bg.wasm",
);
await chmod("dist/index.cjs", 0o755);
