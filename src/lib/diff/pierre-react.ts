"use client";

// Re-export pierre react primitives so the deferred diff-renderer chunk can stay
// stable across Next webpack dev/prod graphs (avoids "./331.js" chunk id drift).
export { PatchDiff, MultiFileDiff } from "@pierre/diffs/react";
