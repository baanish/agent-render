import type { Metadata } from "next";
import Image from "next/image";
import { ArrowLeft, Link2, ShieldCheck, Zap } from "lucide-react";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const iconPath = `${basePath}/icon.svg`;

export const metadata: Metadata = {
  title: "Why does this URL look weird? - agent-render",
  description: "A plain-English explainer for agent-render fragment payload URLs, arx compression, and privacy tradeoffs.",
};

export default function UrlExplainerPage() {
  return (
    <main className="app-shell min-h-screen">
      <header className="nav-bar sticky top-0 z-30 flex items-center justify-between px-4 py-3 sm:px-8 sm:py-4 lg:px-12">
        <a
          href={`${basePath}/`}
          className="flex items-center gap-2.5 rounded-[var(--radius-lg)] -m-1 p-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-2 sm:gap-3"
          aria-label="Back to agent-render"
        >
          <div className="grid h-8 w-8 place-items-center rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface-strong)] sm:h-9 sm:w-9">
            <Image src={iconPath} alt="" width={24} height={24} className="h-4.5 w-4.5 sm:h-5 sm:w-5" priority unoptimized />
          </div>
          <span className="font-display text-lg font-semibold sm:text-xl">Agent Render</span>
        </a>
      </header>

      <article className="mx-auto flex w-full max-w-4xl flex-col gap-10 px-4 pb-16 pt-10 sm:px-8 sm:pb-24 sm:pt-16 lg:px-12">
        <a href={`${basePath}/`} className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-[color:var(--accent)]">
          <ArrowLeft className="h-4 w-4" />
          Back to viewer
        </a>

        <section className="home-hero-section">
          <p className="section-kicker">URL explainer</p>
          <h1 className="font-display mt-4 text-[2.7rem] font-bold leading-[0.94] sm:mt-6 sm:text-6xl">
            Why does this URL look weird?
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-8 text-[color:var(--text-muted)] sm:mt-7 sm:text-lg">
            The long part after <span className="font-mono">#agent-render=</span> is the artifact itself, compressed into the URL fragment so a static host can show it without receiving the content in the page request.
          </p>
        </section>

        <section className="bento-grid">
          <div className="bento-card bento-wide px-5 py-6 sm:px-8 sm:py-8">
            <p className="section-kicker">The shape</p>
            <p className="font-mono mt-4 break-all text-sm leading-7 text-[color:var(--text-muted)] sm:text-base">
              https://agent-render.com/#agent-render=v1.arx.1.&lt;compressed-payload&gt;
            </p>
            <p className="mt-4 text-sm leading-7 text-[color:var(--text-muted)] sm:text-base sm:leading-8">
              Everything before <span className="font-mono">#</span> loads the app. Everything after <span className="font-mono">#</span> stays in the browser and tells the app what to render.
            </p>
          </div>

          <div className="bento-card px-5 py-6 sm:px-8 sm:py-8">
            <Link2 className="h-5 w-5 text-[color:var(--accent)]" />
            <p className="section-kicker mt-4">v1</p>
            <p className="mt-3 text-sm leading-7 text-[color:var(--text-muted)]">
              The payload format version. It lets old and new links fail clearly instead of guessing.
            </p>
          </div>

          <div className="bento-card px-5 py-6 sm:px-8 sm:py-8">
            <Zap className="h-5 w-5 text-[color:var(--accent)]" />
            <p className="section-kicker mt-4">arx</p>
            <p className="mt-3 text-sm leading-7 text-[color:var(--text-muted)]">
              The compression method. It uses an agent-render dictionary, Brotli compression, and URL-safe text encoding to keep rich artifacts linkable.
            </p>
          </div>

          <div className="bento-card px-5 py-6 sm:px-8 sm:py-8">
            <ShieldCheck className="h-5 w-5 text-[color:var(--accent)]" />
            <p className="section-kicker mt-4">Privacy</p>
            <p className="mt-3 text-sm leading-7 text-[color:var(--text-muted)]">
              The static host does not receive fragment contents during the page request. The link is still not a secret: browser history, copied URLs, screenshots, logs from tools that inspect the full URL, and future client-side analytics can expose it.
            </p>
          </div>
        </section>

        <section className="home-stage-section">
          <p className="section-kicker">In 30 seconds</p>
          <div className="mt-5 grid gap-4">
            <p className="text-base leading-8 text-[color:var(--text-muted)]">
              A normal page URL asks the server for a route. An agent-render URL also carries a compressed artifact after the hash mark. Browsers do not send that hash to the server in the initial request, so the static app loads first and then decodes the artifact locally.
            </p>
            <p className="text-base leading-8 text-[color:var(--text-muted)]">
              The weird-looking text is a transport format, not a tracking code. Shorter codecs like <span className="font-mono">deflate</span> and <span className="font-mono">arx</span> make markdown, code, diffs, CSV, and JSON fit into shareable links.
            </p>
            <p className="text-base leading-8 text-[color:var(--text-muted)]">
              Use fragment links for quick static sharing. Use the optional self-hosted UUID mode when the payload is too large, the target chat app mangles long links, or you need a short URL and accept server-side storage.
            </p>
          </div>
        </section>
      </article>
    </main>
  );
}
