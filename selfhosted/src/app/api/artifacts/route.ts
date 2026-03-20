import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { createArtifact } from "@self/lib/artifacts";

/** POST /api/artifacts — create a new artifact from a JSON payload envelope. */
export async function POST(request: NextRequest) {
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

    const id = uuidv4();
    const payload = JSON.stringify(body);
    const row = createArtifact(id, payload);

    return NextResponse.json(
      {
        id: row.id,
        created_at: row.created_at,
        expires_at: row.expires_at,
      },
      { status: 201 },
    );
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
}
