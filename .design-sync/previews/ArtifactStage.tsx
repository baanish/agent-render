import { ArtifactStage, sampleEnvelopes } from "agent-render";

// The five-artifact "arx showcase" envelope, presented as an arx4-coded fragment
// the way the viewer shell would after decoding a real shared link.
const showcase = { ...sampleEnvelopes[4], codec: "arx4" as const };

const decodedTone = {
  label: "Decoded",
  color: "var(--success)",
  message: "Fragment decoded successfully.",
};

const hash = "#e𐊀㮕ヅ𐤈⽂₣ᚔ𝍖ᛞ㹨ヸ⽇㮖𐤉₪ᚕ𝍗ᛟ㹩𐊕ヅ⽂㮕𐤈₣ᚔ𝍖ᛞ㹨𐊀ヸ";
const noop = () => {};

function pickArtifact(id: string) {
  const artifact = showcase.artifacts.find((candidate) => candidate.id === id);
  if (!artifact) throw new Error(`missing showcase artifact: ${id}`);
  return artifact;
}

/** Markdown artifact active: toolbar, five-tab selector, rendered release notes, metadata grid. */
export const MarkdownActive = () => {
  const active = pickArtifact("release-notes");
  return (
    <ArtifactStage
      activeArtifact={active}
      envelope={showcase}
      fragmentLength={1982}
      hash={hash}
      onArtifactSelect={noop}
      onRendererReady={noop}
      rendererReadyKey={active.id}
      statusTone={decodedTone}
    />
  );
};

/** Diff artifact active: same bundle switched to the migration patch with the diff renderer. */
export const DiffActive = () => {
  const active = pickArtifact("migration-diff");
  return (
    <ArtifactStage
      activeArtifact={active}
      envelope={{ ...showcase, activeArtifactId: active.id }}
      fragmentLength={2044}
      hash={hash}
      onArtifactSelect={noop}
      onRendererReady={noop}
      rendererReadyKey={active.id}
      statusTone={decodedTone}
    />
  );
};
