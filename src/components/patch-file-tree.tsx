"use client";

import { useMemo, useRef } from "react";
import { FileTree, useFileTree } from "@pierre/trees/react";

const TREE_ROW_HEIGHT = 24;
const TREE_MIN_ROWS = 4;
const TREE_MAX_ROWS = 12;
const TREE_SEARCH_THRESHOLD = 8;

type PatchFileTreeProps = {
  paths: readonly string[];
  selectedPath?: string;
  onSelectPath: (path: string) => void;
};

/**
 * Renders the file paths of a multi-file patch as a compact, keyboard-navigable tree.
 *
 * `paths` contains file-level display paths only; directory rows are synthesized by the tree and
 * are filtered out of selection events, so `onSelectPath` always receives a real file path.
 * `useFileTree` builds its model once per mount (later option changes are ignored), so callers
 * must remount via `key` when the path set changes. Load this module through `next/dynamic`:
 * it carries the @pierre/trees runtime, which only multi-file patch surfaces should pay for.
 */
export function PatchFileTree({ paths, selectedPath, onSelectPath }: PatchFileTreeProps) {
  const onSelectRef = useRef(onSelectPath);
  onSelectRef.current = onSelectPath;
  const filePathSet = useMemo(() => new Set(paths), [paths]);
  const { model } = useFileTree({
    density: "compact",
    flattenEmptyDirectories: true,
    initialExpansion: "open",
    initialSelectedPaths: selectedPath ? [selectedPath] : [],
    onSelectionChange(selectedPaths) {
      const path = selectedPaths.at(-1);
      if (path && filePathSet.has(path)) {
        onSelectRef.current(path);
      }
    },
    paths,
    search: paths.length >= TREE_SEARCH_THRESHOLD,
  });
  const rowCount = Math.min(
    TREE_MAX_ROWS,
    Math.max(TREE_MIN_ROWS, paths.length + (paths.length >= TREE_SEARCH_THRESHOLD ? 2 : 1)),
  );

  return (
    <nav className="patch-file-tree-nav" aria-label="Changed files">
      <FileTree
        className="patch-file-tree"
        model={model}
        style={{ height: `${rowCount * TREE_ROW_HEIGHT}px` }}
      />
    </nav>
  );
}
