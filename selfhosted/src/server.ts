import express from "express";
import path from "node:path";
import fs from "node:fs";
import {
  initDb,
  createArtifact,
  getArtifact,
  getArtifactRaw,
  refreshArtifactTtl,
  updateArtifact,
  deleteArtifact,
  cleanupExpired,
} from "./db.js";

const PORT = parseInt(process.env.PORT ?? "3001", 10);
const STATIC_DIR = path.resolve(process.env.STATIC_DIR ?? path.join(import.meta.dirname, "../../out"));
const BASE_URL = process.env.BASE_URL ?? `http://localhost:${PORT}`;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Maximum payload size: 1 MB
const MAX_PAYLOAD_SIZE = 1_000_000;

// --- Initialize database ---
initDb();

// --- Load the static index.html template ---
const indexHtmlPath = path.join(STATIC_DIR, "index.html");
if (!fs.existsSync(indexHtmlPath)) {
  console.error(
    `Static index.html not found at ${indexHtmlPath}.\n` +
    `Build the main app first: cd .. && npm run build\n` +
    `Or set STATIC_DIR to point to the built output directory.`
  );
  process.exit(1);
}
const indexHtmlTemplate = fs.readFileSync(indexHtmlPath, "utf-8");

/**
 * Injects the artifact payload into the static index.html template.
 * Uses a JSON script tag for safe embedding without XSS risk.
 */
function renderViewerPage(payload: string, artifactId: string): string {
  const safePayload = JSON.stringify(payload)
    .replace(/<\//g, "<\\/")
    .replace(/<!--/g, "<\\!--");

  const injectedScript = `<script id="__agent-render-data">window.__AGENT_RENDER_ENVELOPE__=${safePayload};window.__AGENT_RENDER_ARTIFACT_ID__=${JSON.stringify(artifactId)};</script>`;

  return indexHtmlTemplate.replace("</head>", `${injectedScript}\n</head>`);
}

// --- Express app ---
const app = express();
app.use(express.json({ limit: "1mb" }));

// --- API routes ---

/** POST /api/artifacts - Create a new artifact. */
app.post("/api/artifacts", (req, res) => {
  const { payload } = req.body;

  if (!payload) {
    res.status(400).json({ error: "Missing 'payload' field." });
    return;
  }

  // Accept payload as string (JSON envelope) or object (will be serialized)
  const payloadStr = typeof payload === "string" ? payload : JSON.stringify(payload);

  if (payloadStr.length > MAX_PAYLOAD_SIZE) {
    res.status(413).json({ error: `Payload exceeds maximum size of ${MAX_PAYLOAD_SIZE} characters.` });
    return;
  }

  // Validate that the payload is valid JSON
  try {
    const parsed = JSON.parse(payloadStr);
    if (!parsed || typeof parsed !== "object" || parsed.v !== 1 || !Array.isArray(parsed.artifacts)) {
      res.status(400).json({ error: "Payload must be a valid agent-render envelope (v: 1, artifacts array required)." });
      return;
    }
  } catch {
    res.status(400).json({ error: "Payload must be valid JSON." });
    return;
  }

  const row = createArtifact(payloadStr);
  res.status(201).json({
    id: row.id,
    url: `${BASE_URL}/${row.id}`,
    created_at: row.created_at,
    expires_at: row.expires_at,
  });
});

/** GET /api/artifacts/:id - Retrieve an artifact's metadata and payload. */
app.get("/api/artifacts/:id", (req, res) => {
  const { id } = req.params;

  if (!UUID_PATTERN.test(id)) {
    res.status(400).json({ error: "Invalid artifact id format." });
    return;
  }

  const row = getArtifactRaw(id);
  if (!row) {
    res.status(404).json({ error: "Artifact not found or expired." });
    return;
  }

  // Refresh TTL on successful authenticated access
  refreshArtifactTtl(id);

  res.json({
    id: row.id,
    payload: row.payload,
    url: `${BASE_URL}/${row.id}`,
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_viewed_at: row.last_viewed_at,
    expires_at: row.expires_at,
  });
});

/** PUT /api/artifacts/:id - Update an artifact's payload. */
app.put("/api/artifacts/:id", (req, res) => {
  const { id } = req.params;
  const { payload } = req.body;

  if (!UUID_PATTERN.test(id)) {
    res.status(400).json({ error: "Invalid artifact id format." });
    return;
  }

  if (!payload) {
    res.status(400).json({ error: "Missing 'payload' field." });
    return;
  }

  const payloadStr = typeof payload === "string" ? payload : JSON.stringify(payload);

  if (payloadStr.length > MAX_PAYLOAD_SIZE) {
    res.status(413).json({ error: `Payload exceeds maximum size of ${MAX_PAYLOAD_SIZE} characters.` });
    return;
  }

  try {
    const parsed = JSON.parse(payloadStr);
    if (!parsed || typeof parsed !== "object" || parsed.v !== 1 || !Array.isArray(parsed.artifacts)) {
      res.status(400).json({ error: "Payload must be a valid agent-render envelope (v: 1, artifacts array required)." });
      return;
    }
  } catch {
    res.status(400).json({ error: "Payload must be valid JSON." });
    return;
  }

  const row = updateArtifact(id, payloadStr);
  if (!row) {
    res.status(404).json({ error: "Artifact not found or expired." });
    return;
  }

  res.json({
    id: row.id,
    url: `${BASE_URL}/${row.id}`,
    updated_at: row.updated_at,
    expires_at: row.expires_at,
  });
});

/** DELETE /api/artifacts/:id - Delete an artifact. */
app.delete("/api/artifacts/:id", (req, res) => {
  const { id } = req.params;

  if (!UUID_PATTERN.test(id)) {
    res.status(400).json({ error: "Invalid artifact id format." });
    return;
  }

  const deleted = deleteArtifact(id);
  if (!deleted) {
    res.status(404).json({ error: "Artifact not found." });
    return;
  }

  res.status(204).end();
});

/** POST /api/cleanup - Remove expired artifacts. */
app.post("/api/cleanup", (_req, res) => {
  const count = cleanupExpired();
  res.json({ deleted: count });
});

// --- Viewer route: /:uuid renders the artifact through the existing viewer ---

app.get("/:id", (req, res, next) => {
  const { id } = req.params;

  // Only handle UUID-shaped paths; let other paths fall through to static serving
  if (!UUID_PATTERN.test(id)) {
    next();
    return;
  }

  const row = getArtifact(id);
  if (!row) {
    res.status(404).type("html").send(
      "<!DOCTYPE html><html><head><title>Not Found</title></head>" +
      "<body style=\"font-family:system-ui;max-width:40rem;margin:4rem auto;text-align:center\">" +
      "<h1>Artifact not found</h1>" +
      "<p>This artifact has expired, been deleted, or never existed.</p>" +
      "<p><a href=\"/\">Go to agent-render</a></p>" +
      "</body></html>"
    );
    return;
  }

  res.type("html").send(renderViewerPage(row.payload, id));
});

// --- Static file serving ---
app.use(express.static(STATIC_DIR));

// --- Start server ---
app.listen(PORT, () => {
  console.log(`agent-render self-hosted server running at ${BASE_URL}`);
  console.log(`Static files: ${STATIC_DIR}`);
  console.log(`Database: ${process.env.DB_PATH ?? "./data/agent-render.db"}`);
});

export { app };
