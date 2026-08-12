import type { Metadata } from "next";
import { InstrumentFooter } from "@/components/shell/instrument-footer";
import { InstrumentHeader } from "@/components/shell/instrument-header";

export const metadata: Metadata = {
  title: "Why does this URL look weird? - agent-render",
  description: "A plain-English explainer for agent-render fragment payload URLs, arx compression, and privacy tradeoffs.",
};

/**
 * Explains fragment URL shape and the host-retention boundary in the same chassis as the viewer.
 */
export default function UrlExplainerPage() {
  return (
    <main className="app-shell min-h-screen">
      <InstrumentHeader />
      <div className="instrument-body">
        <article className="reference-page">
          <h1>Why does this URL look weird?</h1>
          <p>
            The long part after the <span className="font-mono">#</span> (which starts with a one-character codec tag) is the artifact itself, compressed into the URL fragment so a static host can show it without receiving the content in the page request.
          </p>

          <section className="reference-section">
            <h2>Shape</h2>
            <p className="font-mono break-all">
              https://agent-render.com/#a&lt;compressed-payload&gt;
            </p>
            <p>
              Everything before <span className="font-mono">#</span> loads the app. Everything after <span className="font-mono">#</span> stays in the browser and tells the app what to render.
            </p>
          </section>

          <section className="reference-section">
            <h2>Version</h2>
            <p>
              The payload format version lets old and new links fail clearly instead of guessing.
            </p>
          </section>

          <section className="reference-section">
            <h2>Compression</h2>
            <p>
              Codecs such as <span className="font-mono">deflate</span> and <span className="font-mono">arx</span> keep markdown, code, diffs, CSV, and JSON inside a shareable fragment budget.
            </p>
          </section>

          <section className="reference-section">
            <h2>Retention boundary</h2>
            <p>
              The static host does not receive fragment contents during the page request. The link is still not a secret: browser history, copied URLs, screenshots, logs from tools that inspect the full URL, and future client-side analytics can expose it.
            </p>
          </section>

          <section className="reference-section">
            <h2>When to use which link</h2>
            <p>
              A normal page URL asks the server for a route. An agent-render URL also carries a compressed artifact after the hash mark. Browsers do not send that hash to the server in the initial request, so the static app loads first and then decodes the artifact locally.
            </p>
            <p>
              Use fragment links for quick static sharing. Use the optional self-hosted UUID mode when the payload is too large, the target chat app mangles long links, or you need a short URL and accept server-side storage.
            </p>
          </section>
        </article>
      </div>
      <InstrumentFooter />
    </main>
  );
}
