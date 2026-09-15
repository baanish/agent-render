"use client";

// Registers the shared "agent-render" Shiki theme for every Pierre surface.
import "./pierre-theme";

// Same import-seam reasoning as pierre-react.ts, but for the editing surface:
// CodeView/EditProvider plus the Editor runtime stay in the deferred
// artifact-body-editor chunk so the diff viewer never pays for edit machinery.
export {
  CodeView,
  EditProvider,
  type CodeViewHandle,
  type CodeViewItem,
} from "@pierre/diffs/react";
export { Editor } from "@pierre/diffs/edit";
