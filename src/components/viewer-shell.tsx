"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChassisRail } from "@/components/shell/chassis-rail";
import { InstrumentFooter } from "@/components/shell/instrument-footer";
import { InstrumentHeader } from "@/components/shell/instrument-header";
import { getHashPreview } from "@/components/viewer/hash-preview";
import {
  type ArtifactPayload,
  type ParsedPayload,
  type PayloadEnvelope,
} from "@/lib/payload/schema";

const LinkCreator = dynamic(
  () =>
    import("@/components/home/link-creator").then(
      (module) => module.LinkCreator,
    ),
  {
    ssr: false,
  },
);
const SampleLinks = dynamic(
  () =>
    import("@/components/home/sample-links").then(
      (module) => module.SampleLinks,
    ),
  {
    ssr: false,
  },
);
const ArtifactStage = dynamic(
  () =>
    import("@/components/viewer/artifact-stage").then(
      (module) => module.ArtifactStage,
    ),
  {
    ssr: false,
  },
);

type FragmentModule = typeof import("@/lib/payload/fragment");

let fragmentModulePromise: Promise<FragmentModule> | null = null;

function loadFragmentModule() {
  fragmentModulePromise ??= import("@/lib/payload/fragment").catch((error) => {
    fragmentModulePromise = null;
    throw error;
  });
  return fragmentModulePromise;
}

function getVisibleHashLength(hash: string): number {
  const fragmentBody = hash.startsWith("#") ? hash.slice(1) : hash;
  try {
    return decodeURIComponent(fragmentBody).length;
  } catch {
    return fragmentBody.length;
  }
}

function getActiveArtifact(envelope: PayloadEnvelope): ArtifactPayload {
  for (const artifact of envelope.artifacts) {
    if (artifact.id === envelope.activeArtifactId) {
      return artifact;
    }
  }

  return envelope.artifacts[0];
}

function getArtifactById(envelope: PayloadEnvelope, artifactId: string | null): ArtifactPayload {
  if (!artifactId) {
    return getActiveArtifact(envelope);
  }

  for (const artifact of envelope.artifacts) {
    if (artifact.id === artifactId) {
      return artifact;
    }
  }

  return getActiveArtifact(envelope);
}

function getEmptyParsedPayload(): ParsedPayload {
  return {
    ok: false,
    code: "empty",
    message: "Add a fragment payload to start rendering artifacts.",
  };
}

function getOperatingState(parsed: ParsedPayload) {
  if (parsed.ok) {
    return {
      state: "ready" as const,
      label: "READY",
      message: "",
    };
  }

  if (parsed.code === "empty") {
    return {
      state: "standby" as const,
      label: "STANDBY",
      message: parsed.message,
    };
  }

  return {
    state: "fail" as const,
    label: "FAIL",
    message: parsed.message,
  };
}

/**
 * Render the main viewer shell for decoding and displaying artifact fragments from the URL hash.
 *
 * Manages fragment decoding and browser hash synchronization before handing decoded artifacts to
 * the deferred artifact stage.
 *
 * @returns The root React element for the viewer shell UI
 */
export function ViewerShell() {
  const [hash, setHash] = useState("");
  const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null);
  const [rendererReady, setRendererReady] = useState(true);
  const rendererReadyKeyRef = useRef("");
  const artifactSelectionRequestRef = useRef(0);
  /** True when the current hash originated from a server-injected payload (self-hosted UUID mode). */
  const injectedPayloadRef = useRef(false);

  useEffect(() => {
    const injected = (window as unknown as Record<string, unknown>)
      .__AGENT_RENDER_PAYLOAD__;
    if (typeof injected === "string" && injected.length > 0) {
      delete (window as unknown as Record<string, unknown>)
        .__AGENT_RENDER_PAYLOAD__;
      injectedPayloadRef.current = true;
      setHash(`#${injected}`);
    }

    const syncHash = () => {
      injectedPayloadRef.current = false;
      setHash(window.location.hash);
    };

    if (typeof injected !== "string" || injected.length === 0) {
      syncHash();
    }
    window.addEventListener("hashchange", syncHash);

    return () => {
      window.removeEventListener("hashchange", syncHash);
    };
  }, []);

  const [parsed, setParsed] = useState<ParsedPayload>(() =>
    getEmptyParsedPayload(),
  );

  useEffect(() => {
    let cancelled = false;

    if (!hash) {
      setParsed(getEmptyParsedPayload());
      return () => {
        cancelled = true;
      };
    }

    const options = injectedPayloadRef.current
      ? { skipFragmentBudget: true }
      : undefined;
    loadFragmentModule()
      .then(({ decodeFragmentAsync }) => decodeFragmentAsync(hash, options))
      .then((result) => {
        if (!cancelled) setParsed(result);
      })
      .catch(() => {
        if (!cancelled) {
          setParsed({
            ok: false,
            code: "invalid-format",
            message: "The fragment payload could not be decoded by this browser session.",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [hash]);

  const fragmentLength = getVisibleHashLength(hash);
  const envelope = parsed.ok ? parsed.envelope : null;
  const activeArtifact = useMemo(
    () => (envelope ? getArtifactById(envelope, activeArtifactId) : null),
    [activeArtifactId, envelope],
  );
  const rendererReadyKey = activeArtifact ? `${hash}:${activeArtifact.id}` : "";

  useEffect(() => {
    setActiveArtifactId(parsed.ok ? parsed.envelope.activeArtifactId ?? null : null);
  }, [parsed]);

  useEffect(() => {
    const title = activeArtifact?.title?.trim() || envelope?.title?.trim();
    document.title = title ? `${title} — agent-render` : "agent-render";
  }, [envelope, activeArtifact]);

  const operating = getOperatingState(parsed);
  const viewerState =
    activeArtifact && envelope
      ? "artifact"
      : parsed.ok
        ? "decoded-no-artifact"
        : parsed.code === "empty"
          ? "empty"
          : "error";

  useEffect(() => {
    rendererReadyKeyRef.current = rendererReadyKey;

    if (!activeArtifact) {
      setRendererReady(true);
      return;
    }

    setRendererReady(false);
  }, [activeArtifact, rendererReadyKey]);

  const markRendererReady = useCallback((readyKey: string) => {
    if (rendererReadyKeyRef.current === readyKey) {
      setRendererReady(true);
    }
  }, []);

  const setFragmentHash = useCallback((nextHash: string) => {
    injectedPayloadRef.current = false;

    if (window.location.hash === nextHash) {
      return;
    }

    window.history.replaceState(null, "", nextHash);
    setHash(nextHash);
  }, []);

  const handleGoHome = useCallback(() => {
    const url = window.location.pathname + (window.location.search || "");
    injectedPayloadRef.current = false;
    window.history.replaceState(null, "", url);
    setHash("");
  }, []);

  const handleArtifactSelect = useCallback(
    (artifactId: string) => {
      if (!envelope || activeArtifact?.id === artifactId) {
        return;
      }

      setActiveArtifactId(artifactId);
      const requestId = artifactSelectionRequestRef.current + 1;
      artifactSelectionRequestRef.current = requestId;

      loadFragmentModule()
        .then(({ encodeEnvelopeAsync }) =>
          encodeEnvelopeAsync(
            { ...envelope, activeArtifactId: artifactId },
            { codec: envelope.codec },
          ),
        )
        .then((encoded) => {
          if (artifactSelectionRequestRef.current !== requestId) {
            return;
          }

          setFragmentHash(`#${encoded}`);
        })
        .catch(() => {
          if (artifactSelectionRequestRef.current === requestId) {
            artifactSelectionRequestRef.current += 1;
          }
        });
    },
    [activeArtifact, envelope, setFragmentHash],
  );

  return (
    <main
      className="app-shell"
      data-testid="viewer-shell"
      data-viewer-state={viewerState}
      data-active-kind={activeArtifact?.kind ?? "none"}
      data-active-artifact-id={activeArtifact?.id ?? "none"}
      data-renderer-ready={rendererReady ? "true" : "false"}
    >
      <div className="chassis-top print-hide-on-markdown">
        <InstrumentHeader onGoHome={handleGoHome} />
        <ChassisRail
          state={operating.state}
          statusLabel={operating.label}
          fragmentLength={fragmentLength}
          codec={parsed.ok ? parsed.envelope.codec : "—"}
          artifactCount={parsed.ok ? parsed.envelope.artifacts.length : 0}
        />
      </div>

      <div className="instrument-body">
        {activeArtifact && envelope ? (
          <ArtifactStage
            activeArtifact={activeArtifact}
            envelope={envelope}
            fragmentLength={fragmentLength}
            hash={hash}
            onArtifactSelect={handleArtifactSelect}
            onRendererReady={markRendererReady}
            rendererReadyKey={rendererReadyKey}
            statusTone={{
              label: operating.label,
              message: operating.message,
            }}
          />
        ) : (
          <section className="empty-state-layout">
            {viewerState === "error" ? (
              <section className="fail-panel" role="alert">
                <h1 className="fail-panel-title">FAIL</h1>
                <p>{operating.message}</p>
                <button type="button" className="artifact-action" onClick={handleGoHome}>
                  Clear fragment
                </button>
              </section>
            ) : null}

            {viewerState === "error" ? (
              <h2 className="procedure-title">Create a link</h2>
            ) : (
              <h1 className="procedure-title">Create a link</h1>
            )}
            <LinkCreator onPreviewHash={setFragmentHash} />

            <SampleLinks activeHash={hash} />

            <section className="home-inspector-section print-hide-on-markdown">
              <h2 className="procedure-title">Transport</h2>
              <div className="artifact-hash-preview">
                <p className="field-label">Hash</p>
                <pre className="artifact-hash-preview-code">{getHashPreview(hash)}</pre>
              </div>
            </section>
          </section>
        )}
      </div>

      <InstrumentFooter />
    </main>
  );
}
