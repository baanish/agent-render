/**
 * Bounded FNV-1a identity key for a payload string. Renderer remount keys use
 * this so artifact changes get a fresh lifecycle without React keys retaining
 * full decoded contents.
 */
export function getContentKey(value: string | undefined): string {
  if (value === undefined) {
    return "u";
  }

  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `${value.length}:${(hash >>> 0).toString(36)}`;
}
