/**
 * Truncate a long URL-fragment hash for display, keeping a readable head and tail. Returns a
 * placeholder when there is no hash yet. Shared by the viewer shell and the artifact stage.
 */
export function getHashPreview(hash: string): string {
  if (!hash) {
    return "#d<base64url-encoded-json>";
  }

  if (hash.length <= 220) {
    return hash;
  }

  return `${hash.slice(0, 160)}...${hash.slice(-44)}`;
}
