export type StoredPayloadBootstrap = {
  id: string;
  payload: string;
  expiresAt: string;
};

declare global {
  interface Window {
    __AGENT_RENDER_STORED_PAYLOAD__?: StoredPayloadBootstrap;
  }
}

/**
 * Reads the self-hosted bootstrap payload injected into the exported viewer page.
 */
export function getStoredPayloadBootstrap(): StoredPayloadBootstrap | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.__AGENT_RENDER_STORED_PAYLOAD__ ?? null;
}
