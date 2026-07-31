import type { PayloadEnvelope } from "../../src/lib/payload/schema";
import { encodePayloadEnvelope } from "./encoding";

type ArtifactCreated = {
  id: string;
};

function instanceUrl(baseUrl: string, suffix: string): string {
  const base = new URL(baseUrl);
  base.search = "";
  base.hash = "";
  const rootPath = base.pathname.replace(/\/+$/, "");
  base.pathname = `${rootPath}/${suffix.replace(/^\/+/, "")}`;
  return base.toString();
}

function parseArtifactCreated(value: unknown): ArtifactCreated {
  if (typeof value !== "object" || value === null || typeof (value as { id?: unknown }).id !== "string") {
    throw new Error("The agent-render instance returned an invalid create response.");
  }
  return { id: (value as { id: string }).id };
}

/** Creates an artifact on a configured self-hosted instance and returns its UUID viewer URL. */
export async function createInstanceArtifact(
  envelope: PayloadEnvelope,
  baseUrl: string,
  token?: string,
): Promise<string> {
  const encoded = await encodePayloadEnvelope(envelope);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(instanceUrl(baseUrl, "api/artifacts"), {
    method: "POST",
    headers,
    body: JSON.stringify({ payload: encoded.fragmentBody }),
  });

  const responseText = await response.text();
  if (!response.ok) {
    let detail = responseText;
    try {
      const parsed: unknown = JSON.parse(responseText);
      if (typeof parsed === "object" && parsed !== null && typeof (parsed as { error?: unknown }).error === "string") {
        detail = (parsed as { error: string }).error;
      }
    } catch {
      // Keep the response body as the diagnostic.
    }
    throw new Error(`Instance create failed (${response.status}): ${detail || response.statusText}`);
  }

  const created = parseArtifactCreated(JSON.parse(responseText) as unknown);
  return instanceUrl(baseUrl, created.id);
}
