/**
 * Builds unique labels for a list of entries that can share the same base text.
 * Collisions gain a ` (n)` suffix, and `reserved` labels cannot be claimed.
 */
export function getUniqueLabels(
  entries: readonly { id: string; base: string }[],
  reserved?: ReadonlySet<string>,
): Map<string, string> {
  const used = new Set(reserved ?? []);
  const labels = new Map<string, string>();

  for (const entry of entries) {
    const base = entry.base.trim() || "untitled";
    let label = base;
    let suffix = 2;
    while (used.has(label)) {
      label = `${base} (${suffix})`;
      suffix += 1;
    }
    used.add(label);
    labels.set(entry.id, label);
  }

  return labels;
}
