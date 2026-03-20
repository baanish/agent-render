import { notFound } from "next/navigation";
import { SelfHostedViewerShell } from "@shared/components/selfhosted-viewer-shell";
import { getArtifact } from "@self/lib/artifacts";
import type { PayloadEnvelope } from "@shared/lib/payload/schema";

/** Server-rendered page for viewing a stored artifact by UUID. */
export default async function ArtifactPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!isValidUuid(id)) {
    notFound();
  }

  const row = getArtifact(id);

  if (!row) {
    notFound();
  }

  let envelope: PayloadEnvelope;
  try {
    envelope = JSON.parse(row.payload) as PayloadEnvelope;
  } catch {
    notFound();
  }

  return <SelfHostedViewerShell envelope={envelope} artifactId={id} />;
}

function isValidUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}
