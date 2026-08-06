// Browser shim: Next injects process.env at build time; the ds bundle runs raw,
// so give module-init reads of process.env.NEXT_PUBLIC_* an empty env instead
// of a ReferenceError. Must stay the first import in ds-entry.ts.
const g = globalThis as Record<string, unknown>;
if (!("process" in g)) g.process = { env: {} };
