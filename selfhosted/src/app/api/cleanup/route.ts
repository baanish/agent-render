import { NextResponse } from "next/server";
import { cleanupExpired } from "@self/lib/artifacts";

/** POST /api/cleanup — remove all expired artifacts from the database. */
export async function POST() {
  const deleted = cleanupExpired();
  return NextResponse.json({ deleted });
}
