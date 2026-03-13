export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export const MAX_TREE_DEPTH = 64;
export const MAX_TREE_NODES = 5000;

export function exceedsTreeLimits(value: JsonValue, maxDepth: number, maxNodes: number): boolean {
  const stack: Array<{ value: JsonValue; depth: number }> = [{ value, depth: 0 }];
  let visitedNodes = 0;

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    visitedNodes += 1;
    if (visitedNodes > maxNodes || current.depth > maxDepth) {
      return true;
    }

    if (current.value === null || typeof current.value !== "object") {
      continue;
    }

    const entries = Array.isArray(current.value) ? current.value : Object.values(current.value);
    for (const entry of entries) {
      stack.push({ value: entry, depth: current.depth + 1 });
    }
  }

  return false;
}
