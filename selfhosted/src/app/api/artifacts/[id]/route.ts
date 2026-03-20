import { NextRequest, NextResponse } from "next/server";
import { getArtifact, deleteArtifact, updateArtifact } from "@self/lib/artifacts";

/** GET /api/artifacts/:id — retrieve a stored artifact, refreshing its TTL on success. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!isValidUuid(id)) {
    return NextResponse.json({ error: "Invalid artifact ID format." }, { status: 400 });
  }

  const row = getArtifact(id);

  if (!row) {
    return NextResponse.json({ error: "Artifact not found or expired." }, { status: 404 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(row.payload);
  } catch {
    return NextResponse.json({ error: "Stored payload is corrupted." }, { status: 500 });
  }

  return NextResponse.json({
    id: row.id,
    payload,
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_viewed_at: row.last_viewed_at,
    expires_at: row.expires_at,
  });
}

/** DELETE /api/artifacts/:id — remove a stored artifact. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!isValidUuid(id)) {
    return NextResponse.json({ error: "Invalid artifact ID format." }, { status: 400 });
  }

  const deleted = deleteArtifact(id);

  if (!deleted) {
    return NextResponse.json({ error: "Artifact not found." }, { status: 404 });
  }

  return NextResponse.json({ deleted: true });
}

/** PUT /api/artifacts/:id — update an existing artifact's payload. */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!isValidUuid(id)) {
    return NextResponse.json({ error: "Invalid artifact ID format." }, { status: 400 });
  }

  try {
    const body = await request.json();

    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
    }

    if (body.v !== 1) {
      return NextResponse.json({ error: 'Payload must have "v": 1.' }, { status: 400 });
    }

    if (!Array.isArray(body.artifacts) || body.artifacts.length === 0) {
      return NextResponse.json({ error: "Payload must include at least one artifact." }, { status: 400 });
    }

    const payload = JSON.stringify(body);
    const row = updateArtifact(id, payload);

    if (!row) {
      return NextResponse.json({ error: "Artifact not found." }, { status: 404 });
    }

    return NextResponse.json({
      id: row.id,
      updated_at: row.updated_at,
      expires_at: row.expires_at,
    });
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
}

/** Validate a string looks like a UUID v4. */
function isValidUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}
