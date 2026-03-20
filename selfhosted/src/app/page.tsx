import Link from "next/link";

/** Home page for the self-hosted variant. Explains the product and links to the API docs. */
export default function HomePage() {
  return (
    <main className="app-shell min-h-screen px-2 pb-5 pt-2.5 sm:px-6 sm:pb-12 sm:pt-5 lg:px-10 lg:pt-7">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <section className="panel panel-hero fade-up px-6 py-8">
          <p className="section-kicker">Self-hosted viewer</p>
          <h2 className="font-display mt-3 text-4xl font-semibold leading-tight tracking-[-0.04em]">
            agent-render, server-backed
          </h2>
          <p className="mt-4 text-base leading-7 text-[color:var(--text-muted)]">
            This is the self-hosted variant of agent-render. Store artifact payloads in SQLite
            and share them via <code className="font-mono text-sm">{"{host}/{uuid}"}</code> links.
          </p>
          <p className="mt-3 text-base leading-7 text-[color:var(--text-muted)]">
            No fragment length limits. Payloads are stored server-side and rendered with the same
            viewer as the static fragment-based version.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <span className="mono-pill">SQLite storage</span>
            <span className="mono-pill">24h sliding TTL</span>
            <span className="mono-pill">Same viewer</span>
          </div>
        </section>

        <section className="panel fade-up px-6 py-6">
          <h3 className="text-xl font-semibold tracking-[-0.03em]">API usage</h3>
          <div className="mt-4 space-y-4 text-sm leading-7 text-[color:var(--text-muted)]">
            <div>
              <p className="font-semibold text-[color:var(--text-primary)]">Create an artifact</p>
              <pre className="mt-1 overflow-x-auto rounded-lg bg-[color:var(--surface-muted)] p-3 font-mono text-xs leading-6">
{`POST /api/artifacts
Content-Type: application/json

{ "v": 1, "codec": "plain", "artifacts": [...] }`}
              </pre>
            </div>
            <div>
              <p className="font-semibold text-[color:var(--text-primary)]">View an artifact</p>
              <pre className="mt-1 overflow-x-auto rounded-lg bg-[color:var(--surface-muted)] p-3 font-mono text-xs leading-6">
{`GET /{uuid}`}
              </pre>
            </div>
            <div>
              <p className="font-semibold text-[color:var(--text-primary)]">Delete an artifact</p>
              <pre className="mt-1 overflow-x-auto rounded-lg bg-[color:var(--surface-muted)] p-3 font-mono text-xs leading-6">
{`DELETE /api/artifacts/{uuid}`}
              </pre>
            </div>
          </div>
        </section>

        <section className="panel fade-up px-6 py-6">
          <h3 className="text-xl font-semibold tracking-[-0.03em]">Learn more</h3>
          <p className="mt-3 text-sm leading-7 text-[color:var(--text-muted)]">
            See the{" "}
            <Link href="https://github.com/baanish/agent-render" className="text-[color:var(--accent)] underline">
              project README
            </Link>{" "}
            for deployment instructions, payload format details, and the self-hosted skill documentation.
          </p>
        </section>
      </div>
    </main>
  );
}
