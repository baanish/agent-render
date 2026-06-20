import type { LucideIcon } from "lucide-react";
import { FileCode2, FileDiff, FileJson2, FileSpreadsheet, FileText } from "lucide-react";

import type { ArtifactKind } from "@/lib/payload/schema";

/** Canonical icon for each artifact kind, shared by the creation UI and the viewer. */
export const kindIcons: Record<ArtifactKind, LucideIcon> = {
  markdown: FileText,
  code: FileCode2,
  diff: FileDiff,
  csv: FileSpreadsheet,
  json: FileJson2,
};
