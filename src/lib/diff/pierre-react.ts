"use client";

// Registers the shared "agent-render" Shiki theme for every Pierre surface.
import "./pierre-theme";

// Re-export pierre react primitives so the deferred diff-renderer chunk stays
// stable across Next webpack dev/prod graphs (a direct deep import from the
// dynamic chunk produced "__webpack_modules__[moduleId] is not a function"
// chunk-id drift in a prior attempt). Also the single seam unit tests mock.
export { PatchDiff, MultiFileDiff, type FileDiffProps } from "@pierre/diffs/react";
