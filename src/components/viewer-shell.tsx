"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MAX_FRAGMENT_LENGTH,
  type ArtifactPayload,
  type ParsedPayload,
  type PayloadEnvelope,
} from "@/lib/payload/schema";
import { withBasePath } from "@/lib/site/base-path";

const securityPath = withBasePath("/security/");

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

const ecosystemLinks = [
  {
    href: "https://github.com/baanish/agent-render",
    kicker: "Source",
    title: "GitHub",
    description: "Source code, issues, releases, and self-hosting notes.",
  },
  {
    href: "https://github.com/baanish/agent-render/blob/main/docs/payload-format.md",
    kicker: "Protocol",
    title: "Payload format docs",
    description: "Fragment key, codecs, envelope fields, and size limits.",
  },
  {
    href: "https://github.com/baanish/agent-render/blob/main/docs/architecture.md#security-posture",
    kicker: "Safety",
    title: "Safety and security page",
    description: "The current security posture and zero-retention boundaries.",
  },
  {
    href: "https://openclaw.ai",
    kicker: "Ecosystem",
    title: "OpenClaw",
    description: "The agent ecosystem this viewer was built to support.",
  },
] as const;

const ThemeToggle = dynamic(
  () =>
    import("@/components/theme-toggle").then((module) => module.ThemeToggle),
  {
    ssr: false,
    loading: () => (
      <span
        aria-hidden="true"
        className="mono-pill shell-pill min-w-[8.5rem] justify-center"
      >
        Theme
      </span>
    ),
  },
);
const BenchHero = dynamic(
  () =>
    import("@/components/home/bench-hero").then((module) => module.BenchHero),
  {
    ssr: false,
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
const InspectorPanel = dynamic(
  () =>
    import("@/components/viewer/inspector-panel").then(
      (module) => module.InspectorPanel,
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

function getStatusTone(parsed: ParsedPayload) {
  if (parsed.ok) {
    return {
      label: "Ready",
      color: "var(--success)",
      message: "",
    };
  }

  if (parsed.code === "empty") {
    return {
      label: "Empty",
      color: "var(--accent-secondary)",
      message: parsed.message,
    };
  }

  return {
    label: "Error",
    color: "var(--danger)",
    message: parsed.message,
  };
}

/**
 * Render the main viewer shell for decoding and displaying artifact fragments from the URL hash.
 *
 * Empty state is a 12-column instrument rig: creator form on the left bench, samples and the
 * fragment inspector on the right. Decoded state hands the full width to the artifact stage.
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

  const budgetRatio = Math.min(fragmentLength / MAX_FRAGMENT_LENGTH, 1);
  const hasFragment = hash.length > 1;
  const parsedOk = parsed.ok;
  const showInspector =
    hasFragment && !activeArtifact && (parsedOk || parsed.code !== "empty");
  const hasFragmentError = hasFragment && !parsedOk && parsed.code !== "empty";
  const statusTone = getStatusTone(parsed);
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
      <header className="nav-bar print-hide-on-markdown sticky top-0 z-30 flex h-12 items-center justify-between px-4 sm:px-8 lg:px-12">
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            handleGoHome();
          }}
          className="-m-1 flex items-center gap-2.5 rounded-[var(--radius-sm)] p-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-2"
          aria-label="Go to homepage"
        >
          <span aria-hidden="true" className="bench-lamp" />
          <span className="nav-wordmark">agent-render</span>
        </a>

        <div className="flex items-center gap-2 sm:gap-3">
          <a href={securityPath} className="nav-text-link">
            Security
          </a>
          <ThemeToggle />
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 pb-12 pt-6 sm:gap-10 sm:px-8 sm:pb-16 sm:pt-8 lg:px-12">
        {activeArtifact && envelope ? (
          <ArtifactStage
            activeArtifact={activeArtifact}
            envelope={envelope}
            fragmentLength={fragmentLength}
            hash={hash}
            onArtifactSelect={handleArtifactSelect}
            onRendererReady={markRendererReady}
            rendererReadyKey={rendererReadyKey}
            statusTone={statusTone}
          />
        ) : (
          <section className="empty-state-layout">
            <h2 className="sr-only">Zero-retention artifact viewer</h2>

            {hasFragmentError ? (
              <InspectorPanel
                budgetRatio={budgetRatio}
                codec={null}
                artifactCount={null}
                fragmentLength={fragmentLength}
                hash={hash}
                parsed={parsed}
                statusTone={statusTone}
              />
            ) : null}

            <BenchHero />

            <div className="bench-rig">
              <div className="bench-col-creator">
                <LinkCreator onPreviewHash={setFragmentHash} />
              </div>
              <div className="bench-col-side">
                <SampleLinks activeHash={hash} />

                {showInspector && !hasFragmentError ? (
                  <InspectorPanel
                    budgetRatio={budgetRatio}
                    codec={parsed.ok ? parsed.envelope.codec : null}
                    artifactCount={
                      parsed.ok ? parsed.envelope.artifacts.length : null
                    }
                    fragmentLength={fragmentLength}
                    hash={hash}
                    parsed={parsed}
                    statusTone={statusTone}
                  />
                ) : null}
              </div>
            </div>

            <section className="bench-section">
              <div className="bench-section-head">
                <span className="bench-board-label">REFERENCE</span>
              </div>
              <div className="bench-links">
                {ecosystemLinks.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    target="_blank"
                    rel="noreferrer"
                    className="bench-links-row bench-cell"
                  >
                    <span className="bench-links-kicker">{link.kicker}</span>
                    <span className="bench-links-title">{link.title}</span>
                    <p className="bench-links-desc">{link.description}</p>
                  </a>
                ))}
              </div>
              <div className="print-hide-on-markdown">
                <p className="bench-hero-truth">
                  Artifact content lives in the URL fragment, so in static mode
                  the static host does not receive artifact content on the page
                  request.
                </p>
                <p className="bench-hero-warning">
                  Fragment links can still appear in browser history,
                  screenshots, copied messages, extensions, and other places
                  you share or run your browser.
                </p>
              </div>
            </section>
          </section>
        )}

        <footer className="site-footer print-hide-on-markdown">
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
            <span className="site-footer-wordmark">agent-render</span>
            <span className="text-[0.72rem] text-[color:var(--text-soft)]">MIT · open source</span>
          </div>
          <nav className="site-footer-nav" aria-label="Site">
            <a href="https://github.com/baanish/agent-render" className="site-footer-link" rel="noreferrer">
              GitHub
            </a>
            <a href="https://github.com/baanish/agent-render/blob/main/docs/payload-format.md" className="site-footer-link" rel="noreferrer">
              Payload format
            </a>
            <a href={securityPath} className="site-footer-link">
              Security
            </a>
          </nav>
        </footer>
      </div>
    </main>
  );
}
