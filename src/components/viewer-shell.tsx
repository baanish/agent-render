"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  MAX_DECODED_PAYLOAD_LENGTH,
  MAX_FRAGMENT_LENGTH,
  type ArtifactPayload,
  type ParsedPayload,
  type PayloadEnvelope,
} from "@/lib/payload/schema";
import { getHashPreview } from "@/components/viewer/hash-preview";
import { numberFormatter } from "@/lib/format";
import { withBasePath } from "@/lib/site/base-path";

const iconPath = withBasePath("/icon.svg");
const securityPath = withBasePath("/security/");
const urlExplainerPath = withBasePath("/url-explainer/");
const iconImageStyle: CSSProperties = {
  backgroundImage: `url(${iconPath})`,
  backgroundPosition: "center",
  backgroundRepeat: "no-repeat",
  backgroundSize: "contain",
};

// Intentionally a local copy of getVisibleFragmentLength (src/lib/payload/fragment.ts).
// Importing that helper statically would pull the fragment/codec module (lz-string, fflate)
// into the homepage initial chunk; the shell loads it dynamically instead, and the
// check:build-budgets gate enforces the resulting size. Keep this local rather than deduping.
function getVisibleHashLength(hash: string): number {
  const fragmentBody = hash.startsWith("#") ? hash.slice(1) : hash;
  try {
    return decodeURIComponent(fragmentBody).length;
  } catch {
    return fragmentBody.length;
  }
}

const githubPath = "https://github.com/baanish/agent-render";
const payloadDocsPath = `${githubPath}/blob/main/docs/payload-format.md`;
const openClawPath = "https://openclaw.ai";

const ThemeToggle = dynamic(
  () =>
    import("@/components/theme-toggle").then((module) => module.ThemeToggle),
  {
    ssr: false,
    loading: () => (
      <span
        aria-hidden="true"
        className="shell-key theme-key"
      >
        Theme
      </span>
    ),
  },
);
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
    // Self-hosted UUID mode: the server injects the payload string into the page.
    // When present, use it as the initial hash source instead of the URL fragment
    // so the existing decode → render pipeline works without changes.
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

    // Still register the hashchange listener even when an injected payload was
    // consumed so that subsequent navigation (sample links, back/forward, manual
    // URL edits) continues to work.
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
      className="app-shell min-h-screen"
      data-testid="viewer-shell"
      data-viewer-state={viewerState}
      data-active-kind={activeArtifact?.kind ?? "none"}
      data-active-artifact-id={activeArtifact?.id ?? "none"}
      data-renderer-ready={rendererReady ? "true" : "false"}
    >
      <header className="nav-bar shell-header print-hide-on-markdown sticky top-0 z-30">
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            handleGoHome();
          }}
          className="shell-home-link"
          aria-label="Go to homepage"
        >
          <span className="shell-mark">
            <span
              aria-hidden="true"
              className="shell-mark-image"
              style={iconImageStyle}
            />
          </span>
          <h1 className="shell-wordmark">
            agent-render
          </h1>
        </a>

        <nav className="shell-nav">
          <a href={securityPath} className="nav-text-link nav-key">
            Security
          </a>
          <ThemeToggle />
        </nav>
      </header>

      <div className="shell-body">
        {activeArtifact && envelope ? (
          <ArtifactStage
            activeArtifact={activeArtifact}
            envelope={envelope}
            fragmentLength={fragmentLength}
            hash={hash}
            onArtifactSelect={handleArtifactSelect}
            onRendererReady={markRendererReady}
            rendererReadyKey={rendererReadyKey}
          />
        ) : (
          <section className="empty-state-layout">
            {hash && !parsed.ok && parsed.code !== "empty" ? (
              <section className="home-inspector-section fault-placard" role="alert">
                <header className="instrument-heading">
                  <div>
                    <h2>Invalid fragment</h2>
                    <p>{parsed.message}</p>
                  </div>
                </header>
                <div className="fault-hash-readout">
                  <span>HASH</span>
                  <code>{getHashPreview(hash)}</code>
                </div>
              </section>
            ) : null}

            <div className="home-workbench">
              <LinkCreator onPreviewHash={setFragmentHash} />
              <SampleLinks activeHash={hash} />
            </div>

            <section className="home-inspector-section home-operating-limits">
              <header className="instrument-heading">
                <h2>Operating limits</h2>
              </header>

              <dl className="limits-table">
                <div>
                  <dt>TRANSPORT</dt>
                  <dd>URL fragment only</dd>
                </div>
                <div>
                  <dt>FRAGMENT</dt>
                  <dd>{numberFormatter.format(MAX_FRAGMENT_LENGTH)} chars max</dd>
                </div>
                <div>
                  <dt>DECODED</dt>
                  <dd>{numberFormatter.format(MAX_DECODED_PAYLOAD_LENGTH)} chars max</dd>
                </div>
                <div>
                  <dt>FORMATS</dt>
                  <dd>MD · CODE · DIFF · CSV · JSON</dd>
                </div>
              </dl>

              <div className="limits-callouts">
                <p className="qrh-callout is-note">
                  <span>NOTE</span>
                  Artifact content lives in the URL fragment, so the static host does not receive artifact content on the initial page request.
                </p>
                <p className="qrh-callout is-warning">
                  <span>WARN</span>
                  Fragment links can still appear in browser history, screenshots, copied messages, extensions, and other places the browser exposes.
                </p>
              </div>
            </section>
          </section>
        )}

        <footer className="site-footer print-hide-on-markdown">
          <div className="footer-chassis">
            <div className="footer-identity">
              <span className="footer-wordmark">agent-render</span>
              <span className="footer-tagline">zero-retention at the static host boundary</span>
            </div>
            <nav className="footer-links">
              <a href={securityPath}>Safety / Security page</a>
              <a href={urlExplainerPath}>URL explainer</a>
              <a href={githubPath} target="_blank" rel="noreferrer">GitHub</a>
              <a href={payloadDocsPath} target="_blank" rel="noreferrer">Payload format docs</a>
              <a href={openClawPath} target="_blank" rel="noreferrer">OpenClaw</a>
            </nav>
          </div>
          <div className="footer-spec-strip">
            <span>open source · self-hostable · no database</span>
          </div>
        </footer>
      </div>
    </main>
  );
}
