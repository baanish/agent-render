"use client";

import { useMemo, useRef } from "react";
import { FileTree, useFileTree } from "@pierre/trees/react";

const TREE_ROW_HEIGHT = 24;
const TREE_MIN_ROWS = 4;
const TREE_MAX_ROWS = 12;
const TREE_SEARCH_THRESHOLD = 8;

type FileTreeNavProps = {
  paths: readonly string[];
  selectedPath?: string;
  onSelectPath: (path: string) => void;
  ariaLabel?: string;
};

/**
 * Renders a list of paths as a compact, keyboard-navigable file tree.
 *
 * `paths` contains leaf entries only; directory rows are synthesized by the tree and are filtered
 * out of selection events, so `onSelectPath` always receives a real listed path. `useFileTree`
 * builds its model once per mount (later option changes are ignored), so callers must remount via
 * `key` when the path set changes. Load this module through `next/dynamic`: it carries the
 * @pierre/trees runtime, which should stay out of surfaces that never show a tree.
 */
export function FileTreeNav({ paths, selectedPath, onSelectPath, ariaLabel = "Files" }: FileTreeNavProps) {
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
    <nav className="patch-file-tree-nav" aria-label={ariaLabel}>
      <FileTree
        className="patch-file-tree"
        model={model}
        style={{ height: `${rowCount * TREE_ROW_HEIGHT}px` }}
      />
    </nav>
  );
}
