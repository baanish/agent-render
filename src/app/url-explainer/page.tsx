import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { withBasePath } from "@/lib/site/base-path";

const homePath = withBasePath("/");
const iconPath = withBasePath("/icon.svg");
const iconImageStyle = {
  backgroundImage: `url(${iconPath})`,
  backgroundPosition: "center",
  backgroundRepeat: "no-repeat",
  backgroundSize: "contain",
};

export const metadata: Metadata = {
  title: "Why does this URL look weird? - agent-render",
  description: "A plain-English explainer for agent-render fragment payload URLs, arx compression, and privacy tradeoffs.",
};

export default function UrlExplainerPage() {
  return (
    <main className="app-shell min-h-screen">
      <header className="nav-bar shell-header sticky top-0 z-30">
        <a
          href={homePath}
          className="shell-home-link"
          aria-label="Back to agent-render"
        >
          <span className="shell-mark">
            <span aria-hidden="true" className="shell-mark-image" style={iconImageStyle} />
          </span>
          <span className="shell-wordmark">agent-render</span>
        </a>
        <span className="revision-placard">PROC URL-01 / REV C</span>
      </header>

      <article className="support-page">
        <a href={homePath} className="artifact-action support-back">
          <ArrowLeft className="h-4 w-4" />
          Back to viewer
        </a>

        <section className="support-heading">
          <h1>Why does this URL look weird?</h1>
          <p>
            The long part after the <span className="font-mono">#</span> (which starts with a one-character codec tag) is the artifact itself, compressed into the URL fragment so a static host can show it without receiving the content in the page request.
          </p>
        </section>

        <section className="url-anatomy-panel">
          <header className="instrument-heading">
            <h2>Fragment anatomy</h2>
            <span className="revision-placard">LIMITS URL-01</span>
          </header>
          <div className="url-fragment-readout">
            <span>ADDRESS</span>
            <code>https://agent-render.com/#a&lt;compressed-payload&gt;</code>
          </div>
          <dl className="url-anatomy-table">
            <div>
              <dt>HOST</dt>
              <dd>Everything before <span className="font-mono">#</span> loads the static application.</dd>
            </div>
            <div>
              <dt>TAG</dt>
              <dd>The first character after <span className="font-mono">#</span> identifies the codec.</dd>
            </div>
            <div>
              <dt>PAYLOAD</dt>
              <dd>The remaining characters carry the compressed artifact bundle.</dd>
            </div>
            <div>
              <dt>BOUNDARY</dt>
              <dd>The browser omits the fragment from the initial request to the static host.</dd>
            </div>
          </dl>
          <p className="qrh-callout is-warning">
            <span>WARN</span>
            The link is not a secret: browser history, copied URLs, screenshots, URL-inspecting tools, and future client-side analytics can expose it.
          </p>
        </section>

        <section className="support-copy">
          <h2>In 30 seconds</h2>
          <div>
            <p>
              A normal page URL asks the server for a route. An agent-render URL also carries a compressed artifact after the hash mark. Browsers do not send that hash to the server in the initial request, so the static app loads first and then decodes the artifact locally.
            </p>
            <p>
              The weird-looking text is a transport format, not a tracking code. Shorter codecs like <span className="font-mono">deflate</span> and <span className="font-mono">arx</span> make markdown, code, diffs, CSV, and JSON fit into shareable links.
            </p>
            <p>
              Use fragment links for quick static sharing. Use the optional self-hosted UUID mode when the payload is too large, the target chat app mangles long links, or you need a short URL and accept server-side storage.
            </p>
          </div>
        </section>
      </article>
    </main>
  );
}
