"use client";

// Registers the shared "agent-render" Shiki theme for read-only Pierre surfaces.
import "./pierre-theme";

/**
 * Re-exports pierre react primitives so the deferred diff-renderer chunk stays
 * stable across Next webpack dev/prod graphs (a direct deep import from the
 * dynamic chunk produced "__webpack_modules__[moduleId] is not a function"
 * chunk-id drift in a prior attempt). Also the single seam unit tests mock.
 */
export {
  FileDiff,
  MultiFileDiff,
  File,
  type FileDiffProps,
  type FileOptions,
} from "@pierre/diffs/react";
export {
  parsePatchFiles,
  setLanguageOverride,
  type FileDiffMetadata,
} from "@pierre/diffs";
