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

/** The server's own id contract; anything else is not something we will paste into a URL. */
const ARTIFACT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseArtifactCreated(value: unknown): ArtifactCreated {
  const id = typeof value === "object" && value !== null ? (value as { id?: unknown }).id : undefined;
  // Validated, not just typed: an id like "../login" would survive URL normalization as a path
  // segment and the CLI would report a confident link to somewhere the artifact is not.
  if (typeof id !== "string" || !ARTIFACT_ID_PATTERN.test(id)) {
    throw new Error("The agent-render instance returned an invalid create response.");
  }
  return { id };
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

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(responseText);
  } catch {
    // A 2xx with a non-JSON body (proxy error page, misconfigured server) should give the same
    // clear message as a malformed JSON body, not a raw SyntaxError.
    throw new Error("The agent-render instance returned an invalid create response.");
  }

  const created = parseArtifactCreated(parsedBody);
  return instanceUrl(baseUrl, created.id);
}
