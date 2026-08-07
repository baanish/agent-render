"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  MAX_FRAGMENT_LENGTH,
  type ArtifactPayload,
  type ParsedPayload,
  type PayloadEnvelope,
} from "@/lib/payload/schema";
import { getHashPreview } from "@/components/viewer/hash-preview";
import { FragmentDetailsDisclosure } from "@/components/viewer/fragment-details-disclosure";
import { numberFormatter } from "@/lib/format";
import { withBasePath } from "@/lib/site/base-path";

const securityPath = withBasePath("/security/");
const urlExplainerPath = withBasePath("/url-explainer/");
const sampleAnimationStyle: CSSProperties = { animationDelay: "120ms" };
const inspectorAnimationStyle: CSSProperties = { animationDelay: "180ms" };

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

const footerNavLinks = [
  { href: securityPath, label: "Security", external: false, srPrefix: "" },
  { href: urlExplainerPath, label: "URL explainer", external: false, srPrefix: "" },
  {
    href: "https://github.com/baanish/agent-render",
    label: "GitHub",
    external: true,
    srPrefix: "",
  },
  {
    href: "https://github.com/baanish/agent-render/blob/main/docs/payload-format.md",
    label: "Payload format docs",
    external: true,
    srPrefix: "",
  },
  {
    // srPrefix keeps the /safety.*security page/i accessible-name contract from the old bento card.
    href: "https://github.com/baanish/agent-render/blob/main/docs/architecture.md#security-posture",
    label: "Security page",
    external: true,
    srPrefix: "Safety ",
  },
  { href: "https://openclaw.ai", label: "OpenClaw", external: true, srPrefix: "" },
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

function getStatusTone(parsed: ParsedPayload) {
  if (parsed.ok) {
    return {
      label: "READY",
      color: "var(--success)",
      message: "Fragment decoded client-side. No copy retained.",
    };
  }

  if (parsed.code === "empty") {
    return {
      label: "EMPTY",
      color: "var(--accent-secondary)",
      message: parsed.message,
    };
  }

  return {
    label: "FAULT",
    color: "var(--danger)",
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
      className="app-shell flex min-h-screen flex-col"
      data-testid="viewer-shell"
      data-viewer-state={viewerState}
      data-active-kind={activeArtifact?.kind ?? "none"}
      data-active-artifact-id={activeArtifact?.id ?? "none"}
      data-renderer-ready={rendererReady ? "true" : "false"}
    >
      <header className="ar-site-header print-hide-on-markdown sticky top-0 z-30 border-b border-[color:var(--border-strong)] bg-[color:var(--surface-strong)]">
        <div className="mx-auto flex w-full max-w-[1280px] items-center gap-3 px-5 py-[9px]">
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              handleGoHome();
            }}
            className="ar-wordmark font-mono text-sm font-semibold lowercase tracking-[-0.01em] text-[color:var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]"
            aria-label="Go to homepage"
          >
            agent-render
          </a>
          <span className="section-kicker hidden sm:inline">
            Share AI output as one link
          </span>
          <span aria-hidden="true" className="flex-1" />
          <a
            href={securityPath}
            className="nav-text-link font-mono text-[0.62rem] font-semibold uppercase tracking-[0.14em]"
          >
            Security
          </a>
          <ThemeToggle />
        </div>
      </header>

      <div className="ar-page-pad mx-auto flex w-full max-w-[1280px] flex-1 flex-col gap-6 px-5 pb-10 pt-3.5">
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
        ) : viewerState === "error" ? (
          <section className="ar-fault-layout flex flex-col gap-3">
            <div
              className="ar-fault-placard flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-[2px] border border-[color:var(--danger)] px-4 py-3"
              role="alert"
            >
              <span
                aria-hidden="true"
                className="ar-fault-led h-[7px] w-[7px] shrink-0 self-center rounded-full bg-[color:var(--danger)]"
              />
              <span className="font-mono text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-[color:var(--danger)]">
                Decode fault
              </span>
              <p className="text-sm leading-6 text-[color:var(--text-primary)]">
                {statusTone.message}
              </p>
            </div>
            <FragmentDetailsDisclosure
              codec="unknown"
              fragmentLength={numberFormatter.format(fragmentLength)}
              hashPreview={getHashPreview(hash)}
              maxLength={numberFormatter.format(MAX_FRAGMENT_LENGTH)}
              statusLabel={statusTone.label}
            />
          </section>
        ) : (
          <section className="empty-state-layout">
            <div className="sr-only">
              <h1>Zero-retention artifact viewer for AI outputs.</h1>
              <p>
                Artifact content lives in the URL fragment, so in static mode
                the static host does not receive artifact content on the page
                request.
              </p>
              <p>
                Fragment links can still appear in browser history, screenshots,
                copied messages, extensions, and other places you share or run
                your browser.
              </p>
            </div>

            {/* ── First viewport: link creator + samples sidebar ── */}
            <div className="ar-two-col">
              <LinkCreator onPreviewHash={setFragmentHash} />
              <aside className="ar-samples-col">
                <SampleLinks
                  activeHash={hash}
                  animationStyle={sampleAnimationStyle}
                />
              </aside>
            </div>

            <section
              className="home-inspector-section fade-up print-hide-on-markdown"
              style={inspectorAnimationStyle}
            >
              <div className="section-header">
                <div>
                  <p className="section-kicker">Fragment inspector</p>
                  <h3 className="font-display mt-2 text-lg font-bold tracking-[-0.02em]">
                    Current URL state
                  </h3>
                </div>
                <span
                  className="mono-pill"
                  style={{
                    borderColor: statusTone.color,
                    color: statusTone.color,
                  }}
                >
                  {statusTone.label}
                </span>
              </div>
              <p className="mt-4 text-sm leading-7 text-[color:var(--text-muted)] sm:text-base sm:leading-8">
                {statusTone.message}
              </p>

              <div className="bento-grid mt-6 sm:mt-8">
                <div className="bento-card px-5 py-5 sm:px-6 sm:py-6">
                  <p className="metric-label">Fragment budget</p>
                  <p className="metric-value">
                    {numberFormatter.format(fragmentLength)} /{" "}
                    {numberFormatter.format(MAX_FRAGMENT_LENGTH)}
                  </p>
                  <div className="budget-track mt-4">
                    <div
                      className="budget-fill"
                      style={{ width: `${budgetRatio * 100}%` }}
                    />
                  </div>
                </div>
                <div className="bento-card px-5 py-5 sm:px-6 sm:py-6">
                  <p className="metric-label">Codec</p>
                  <p className="metric-value">
                    {parsed.ok ? parsed.envelope.codec : "plain"}
                  </p>
                </div>
                <div className="bento-card px-5 py-5 sm:px-6 sm:py-6">
                  <p className="metric-label">Artifacts</p>
                  <p className="metric-value">
                    {parsed.ok
                      ? numberFormatter.format(parsed.envelope.artifacts.length)
                      : "0"}
                  </p>
                </div>
                <div className="bento-card bento-wide px-5 py-5 sm:px-6 sm:py-6">
                  <p className="metric-label">Hash preview</p>
                  <pre className="font-mono mt-3 overflow-x-auto whitespace-pre-wrap break-all text-xs leading-6 text-[color:var(--text-muted)] sm:text-sm">
                    {getHashPreview(hash)}
                  </pre>
                </div>
              </div>
            </section>
          </section>
        )}

      </div>

      <footer className="ar-site-footer print-hide-on-markdown mt-auto bg-[#14110d]">
        <div className="mx-auto flex w-full max-w-[1280px] flex-wrap items-start justify-between gap-x-8 gap-y-4 px-5 py-6">
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="font-mono text-sm font-semibold lowercase text-[#dcd5c5]">
              agent-render
            </span>
            <span className="font-mono text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-[#6e6656]">
              Zero retention · the link is the payload. No database, no
              uploads.
            </span>
          </div>
          <nav
            aria-label="Footer"
            className="flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[0.62rem] font-semibold uppercase tracking-[0.12em]"
          >
            {footerNavLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                target={link.external ? "_blank" : undefined}
                rel={link.external ? "noreferrer" : undefined}
                className="text-[#b8ae9c] hover:text-[#dcd5c5]"
              >
                {link.srPrefix ? (
                  <span className="sr-only">{link.srPrefix}</span>
                ) : null}
                {link.label}
              </a>
            ))}
          </nav>
        </div>
        <div className="ar-footer-strip border-t border-[#cfc6b41f]">
          <p className="mx-auto w-full max-w-[1280px] px-5 py-3 font-mono text-[0.58rem] font-semibold uppercase tracking-[0.16em] text-[#6e6656]">
            Open source · self-hostable · no database
          </p>
        </div>
      </footer>
    </main>
  );
}
