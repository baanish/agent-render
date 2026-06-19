import type { Metadata } from "next";
import { withBasePath } from "@/lib/site/base-path";

const homePath = withBasePath("/");

export const metadata: Metadata = {
  title: "Security - agent-render",
  description: "Security notes for agent-render static artifact links, markdown rendering, Mermaid, CSP, and reports.",
};

const sections = [
  {
    title: "What reaches the server",
    body: [
      "Static mode sends HTML, CSS, and JavaScript to the browser. Artifact payloads are not sent to the static host as part of the initial page request.",
      "Fragment payloads stay out of the HTTP request path, query string, and request body for the static host.",
      "The server can still receive normal static asset requests, IP address, user agent, referrer headers, and access logs from the hosting layer.",
    ],
  },
  {
    title: "What can still leak",
    body: [
      "agent-render is zero-retention by host design. It is not a secret manager.",
      "Artifact contents can still leak through copied URLs, browser history, bookmarks, screenshots, screen sharing, crash reports, extensions, referrer behavior, and future client-side analytics if someone adds them.",
      "Do not put secrets, credentials, private keys, production tokens, or regulated data in artifact links.",
    ],
  },
  {
    title: "Markdown and Mermaid",
    body: [
      "Markdown artifacts are rendered as GitHub-flavored Markdown and passed through rehype-sanitize before display.",
      "React Markdown is configured with skipHtml, so raw HTML embedded in markdown is skipped instead of rendered.",
      "Mermaid diagrams are only rendered from fenced mermaid code blocks. Mermaid runs with securityLevel: \"strict\" and falls back to showing source text if rendering fails.",
    ],
  },
  {
    title: "CSP and security headers",
    body: [
      "The default static export does not require a runtime server. Configure Content-Security-Policy and other security headers at your static host or CDN.",
      "Recommended headers include a restrictive Content-Security-Policy, Referrer-Policy, X-Content-Type-Options, Permissions-Policy, and HSTS when served over HTTPS.",
      "If you loosen CSP for a custom deployment, review markdown, Mermaid, fonts, images, and script sources together before publishing.",
    ],
  },
  {
    title: "Known limitations",
    body: [
      "URL fragments are client-side, but they are still visible to the browser, local machine, extensions, and anyone who receives the link.",
      "Self-hosted UUID mode is a different deployment mode and stores payloads server-side by design.",
      "The viewer treats payloads as untrusted input, but the safest policy is to keep sensitive material out of links entirely.",
    ],
  },
] as const;

/**
 * Public security page documenting the static host boundary and renderer safety posture.
 * Keeps the copy direct and linkable for operators, reviewers, and security reports.
 */
export default function SecurityPage() {
  return (
    <main className="app-shell min-h-screen">
      <header className="nav-bar sticky top-0 z-30 flex items-center justify-between px-4 py-3 sm:px-8 sm:py-4 lg:px-12">
        <a href={homePath} className="nav-text-link">
          Agent Render
        </a>
      </header>

      <div className="mx-auto grid w-full max-w-4xl gap-10 px-4 py-10 sm:px-8 sm:py-16 lg:px-12">
        <section className="border-b border-[color:var(--border)] pb-10">
          <p className="section-kicker">Public security notes</p>
          <h1 className="font-display mt-4 text-4xl font-bold leading-tight sm:text-6xl">Security</h1>
          <p className="mt-5 max-w-3xl text-base leading-8 text-[color:var(--text-muted)] sm:text-lg">
            agent-render is a static artifact viewer. Its core host boundary is simple: artifact data lives in the
            URL fragment, so the static host does not receive it as part of the initial page request.
          </p>
        </section>

        <section className="bento-grid">
          {sections.map((section) => (
            <article key={section.title} className="bento-card px-5 py-6 sm:px-7 sm:py-7">
              <h2 className="text-lg font-bold leading-7">{section.title}</h2>
              <ul className="mt-4 grid gap-3 pl-5 text-sm leading-7 text-[color:var(--text-muted)] marker:text-[color:var(--accent)] sm:text-base sm:leading-8">
                {section.body.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          ))}
        </section>

        <section className="border border-[color:var(--border)] px-5 py-6 sm:px-7 sm:py-7">
          <p className="section-kicker">Reports</p>
          <h2 className="mt-3 text-lg font-bold leading-7">Security contact</h2>
          <p className="mt-4 text-sm leading-7 text-[color:var(--text-muted)] sm:text-base sm:leading-8">
            Report security issues through the GitHub repository. Use a private vulnerability report when available;
            otherwise open a minimal issue asking for a private contact path and do not include exploit details in public.
          </p>
          <a
            href="https://github.com/baanish/agent-render/security/advisories/new"
            rel="noreferrer"
            target="_blank"
            className="mt-4 inline-flex font-bold text-[color:var(--accent)]"
          >
            Open a private GitHub security advisory
          </a>
        </section>
      </div>
    </main>
  );
}
