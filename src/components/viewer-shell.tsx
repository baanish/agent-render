"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  MAX_FRAGMENT_LENGTH,
  PAYLOAD_FRAGMENT_KEY,
  artifactKinds,
  type ArtifactPayload,
  type ParsedPayload,
  type PayloadEnvelope,
} from "@/lib/payload/schema";
import { withBasePath } from "@/lib/site/base-path";

const numberFormatter = new Intl.NumberFormat("en-US");

const iconPath = withBasePath("/icon.svg");
const securityPath = withBasePath("/security/");
const urlExplainerPath = withBasePath("/url-explainer/");
const iconImageStyle: CSSProperties = {
  backgroundImage: `url(${iconPath})`,
  backgroundPosition: "center",
  backgroundRepeat: "no-repeat",
  backgroundSize: "contain",
};
const heroAnimationStyle: CSSProperties = { animationDelay: "80ms" };
const bentoAnimationStyle: CSSProperties = { animationDelay: "120ms" };
const sampleAnimationStyle: CSSProperties = { animationDelay: "180ms" };
const inspectorAnimationStyle: CSSProperties = { animationDelay: "220ms" };
const initializeAnimationStyle: CSSProperties = { animationDelay: "260ms" };

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
    title: "Security page",
    description: "The current security posture and zero-retention boundaries.",
  },
  {
    href: "https://openclaw.ai",
    kicker: "Ecosystem",
    title: "OpenClaw",
    description: "The agent ecosystem this viewer was built to support.",
  },
] as const;

const emptyStateSteps = [
  "Pick a sample fragment below.",
  "The payload decodes client-side from the URL hash.",
  "The renderer displays the artifact without contacting a server.",
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

function getHashPreview(hash: string): string {
  if (!hash) {
    return `#${PAYLOAD_FRAGMENT_KEY}=v1.plain.<base64url-encoded-json>`;
  }

  if (hash.length <= 220) {
    return hash;
  }

  return `${hash.slice(0, 160)}...${hash.slice(-44)}`;
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
      label: "Decoded",
      color: "var(--success)",
      message: "Fragment decoded successfully.",
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
      className="app-shell min-h-screen"
      data-testid="viewer-shell"
      data-viewer-state={viewerState}
      data-active-kind={activeArtifact?.kind ?? "none"}
      data-active-artifact-id={activeArtifact?.id ?? "none"}
      data-renderer-ready={rendererReady ? "true" : "false"}
    >
      <header className="nav-bar print-hide-on-markdown fade-up sticky top-0 z-30 flex items-center justify-between px-4 py-3 sm:px-8 sm:py-4 lg:px-12">
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            handleGoHome();
          }}
          className="flex items-center gap-2.5 sm:gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-2 rounded-[var(--radius-lg)] -m-1 p-1"
          aria-label="Go to homepage"
        >
          <div className="grid h-8 w-8 place-items-center rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface-strong)] sm:h-9 sm:w-9">
            <span
              aria-hidden="true"
              className="h-4.5 w-4.5 sm:h-5 sm:w-5"
              style={iconImageStyle}
            />
          </div>
          <h1 className="font-display text-lg font-semibold tracking-[-0.03em] sm:text-xl">
            Agent Render
          </h1>
        </a>

        <div className="flex items-center gap-2 sm:gap-3">
          <a href={securityPath} className="nav-text-link">
            Security
          </a>
          <ThemeToggle />
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 pb-12 pt-6 sm:gap-16 sm:px-8 sm:pb-24 sm:pt-12 lg:gap-20 lg:px-12 lg:pt-16">
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
            {/* ── Editorial hero ── */}
            <section
              className="home-hero-section fade-up"
              style={heroAnimationStyle}
            >
              <p className="section-kicker">Artifact viewer</p>
              <h2 className="font-display mt-4 max-w-4xl text-[2.5rem] font-bold leading-[0.92] tracking-[-0.04em] sm:mt-6 sm:text-6xl sm:leading-[0.92] lg:text-[4.5rem]">
                Zero-retention artifact viewer for AI outputs.
              </h2>
              <p className="mt-5 max-w-2xl text-base leading-[1.7] text-[color:var(--text-muted)] sm:mt-8 sm:text-lg sm:leading-8">
                Artifact content lives in the URL fragment, so in static mode
                the static host does not receive artifact content on the page
                request.
              </p>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-[color:var(--text-muted)] sm:text-base sm:leading-8">
                Fragment links can still appear in browser history, screenshots,
                copied messages, extensions, and other places you share or run
                your browser.
              </p>
              <div className="mt-6 flex flex-wrap gap-2 sm:mt-10 sm:gap-3">
                <span className="mono-pill">static export</span>
                <span className="mono-pill">5 renderers</span>
                <span className="mono-pill">zero retention</span>
              </div>
            </section>

            {/* ── Bento feature grid ── */}
            <section
              className="bento-grid fade-up"
              style={bentoAnimationStyle}
            >
              <div className="bento-card bento-wide px-5 py-6 sm:px-8 sm:py-8">
                <p className="section-kicker">Protocol shape</p>
                <p className="font-mono mt-4 text-base leading-8 text-[color:var(--text-muted)] sm:text-lg">
                  #{PAYLOAD_FRAGMENT_KEY}=v1.&lt;codec&gt;.&lt;payload&gt;
                </p>
                <a
                  href={urlExplainerPath}
                  className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[color:var(--accent)]"
                >
                  Why does this URL look weird?
                </a>
              </div>
              <div className="bento-card px-5 py-6 sm:px-8 sm:py-8">
                <p className="section-kicker">Static boundary</p>
                <p className="mt-4 text-sm leading-7 text-[color:var(--text-muted)] sm:text-base sm:leading-8">
                  The browser decodes markdown, code, diffs, CSV, and JSON
                  locally from the fragment after the shell loads.
                </p>
              </div>
              {ecosystemLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  className="bento-card bento-link px-5 py-6 sm:px-8 sm:py-8"
                >
                  <span className="hero-link-eyebrow">{link.kicker}</span>
                  <span className="hero-link-title">{link.title}</span>
                  <p className="mt-2 text-sm leading-7 text-[color:var(--text-muted)]">
                    {link.description}
                  </p>
                </a>
              ))}
              <div className="bento-card px-5 py-6 sm:px-8 sm:py-8">
                <span className="hero-link-eyebrow">Try it</span>
                <span className="mt-3 block text-base font-semibold leading-6">
                  Load a sample below
                </span>
                <p className="mt-2 text-sm leading-7 text-[color:var(--text-muted)]">
                  Click any sample to populate the viewer from the URL hash.
                </p>
              </div>
            </section>

            {/* ── Link creator ── */}
            <LinkCreator onPreviewHash={setFragmentHash} />

            {/* ── Samples + Inspector — full-bleed sections ── */}
            <SampleLinks
              activeHash={hash}
              animationStyle={sampleAnimationStyle}
            />

            <section
              className="home-inspector-section fade-up print-hide-on-markdown"
              style={inspectorAnimationStyle}
            >
              <div className="section-header">
                <div>
                  <p className="section-kicker">Fragment inspector</p>
                  <h3 className="font-display mt-3 text-2xl font-bold tracking-[-0.03em] sm:mt-4 sm:text-4xl">
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

            {/* ── Initialize section ── */}
            <section
              className="home-stage-section fade-up"
              style={initializeAnimationStyle}
            >
              <div className="section-header print-hide-on-markdown">
                <div>
                  <p className="section-kicker">Viewer shell</p>
                  <h3 className="font-display mt-3 text-2xl font-bold leading-tight tracking-[-0.04em] sm:mt-4 sm:text-4xl lg:text-5xl">
                    Initialize your Artifact
                  </h3>
                  <p className="mt-4 max-w-3xl text-sm leading-7 text-[color:var(--text-muted)] sm:mt-5 sm:text-base sm:leading-8">
                    Select a fragment above to render it here. Payloads stay off
                    the host request path, but links still need care.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {artifactKinds.map((kind) => (
                    <span key={kind} className="mono-pill">
                      {kind}
                    </span>
                  ))}
                </div>
              </div>

              <div className="bento-grid mt-8 sm:mt-10">
                <div className="bento-card bento-wide px-5 py-6 sm:px-8 sm:py-8">
                  <p className="section-kicker">Getting started</p>
                  <h4 className="font-display mt-3 text-xl font-bold leading-tight tracking-[-0.03em] sm:mt-4 sm:text-2xl lg:text-3xl">
                    Pick a sample or paste your own content above.
                  </h4>
                  <p className="mt-3 max-w-2xl text-sm leading-7 text-[color:var(--text-muted)] sm:mt-4 sm:text-base sm:leading-8">
                    {parsed.ok
                      ? "Fragment decoded — select an artifact to render it."
                      : "No fragment in the URL yet."}
                  </p>
                </div>
                {emptyStateSteps.map((step, index) => (
                  <div
                    key={step}
                    className="bento-card px-5 py-6 sm:px-8 sm:py-8"
                  >
                    <p className="section-kicker">Step {index + 1}</p>
                    <p className="mt-3 text-sm leading-7 text-[color:var(--text-muted)] sm:text-base sm:leading-8">
                      {step}
                    </p>
                  </div>
                ))}
                <div className="bento-card px-5 py-6 sm:px-8 sm:py-8">
                  <p className="section-kicker">Security</p>
                  <a
                    href={securityPath}
                    className="mt-3 inline-flex items-center gap-2 text-base font-semibold leading-6 text-[color:var(--accent)]"
                  >
                    Read the security page
                  </a>
                  <p className="mt-2 text-sm leading-7 text-[color:var(--text-muted)] sm:text-base sm:leading-8">
                    Fragment payloads stay out of the static host request path,
                    but links are not secret-safe.
                  </p>
                  <a
                    href={urlExplainerPath}
                    className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[color:var(--accent)]"
                  >
                    Read the privacy tradeoff
                  </a>
                </div>
                <div className="bento-card px-5 py-6 sm:px-8 sm:py-8">
                  <p className="section-kicker">Hosting</p>
                  <p className="mt-3 text-sm leading-7 text-[color:var(--text-muted)] sm:text-base sm:leading-8">
                    Single static route. Works on any static host.
                  </p>
                </div>
              </div>
            </section>
          </section>
        )}

        <footer className="site-footer print-hide-on-markdown">
          <span>agent-render</span>
          <a href={securityPath}>Security</a>
        </footer>
      </div>
    </main>
  );
}
