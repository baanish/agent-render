import { withBasePath } from "@/lib/site/base-path";

const securityPath = withBasePath("/security/");
const urlExplainerPath = withBasePath("/url-explainer/");

const plateLinks = [
  {
    href: "https://github.com/baanish/agent-render",
    label: "GitHub",
  },
  {
    href: "https://github.com/baanish/agent-render/blob/main/docs/payload-format.md",
    label: "Payload format docs",
  },
  {
    href: securityPath,
    label: "Safety — Security page",
  },
  {
    href: urlExplainerPath,
    label: "Fragment format",
  },
  {
    href: "https://openclaw.ai",
    label: "OpenClaw",
  },
] as const;

/**
 * Renders the chassis manufacturer plate: zero-retention boundary, project posture, and instrument navigation.
 * Uses the same factual retention copy as the product contract so the footer, not a hero, carries those limits.
 */
export function InstrumentFooter() {
  return (
    <footer className="site-footer print-hide-on-markdown">
      <div className="chassis-plate">
        <p className="chassis-plate-id">
          agent-render · MIT · static · self-hostable · zero retention
        </p>
        <p className="chassis-plate-legend">
          Artifact content lives in the URL fragment, so in static mode the
          static host does not receive artifact content on the page request.
          Fragment links can still appear in browser history, screenshots,
          copied messages, extensions, and other places you share or run your
          browser.
        </p>
      </div>
      <nav className="chassis-plate-nav" aria-label="Project">
        {plateLinks.map((link) => (
          <a
            key={link.href}
            href={link.href}
            {...(link.href.startsWith("http")
              ? { target: "_blank", rel: "noreferrer" }
              : {})}
          >
            {link.label}
          </a>
        ))}
      </nav>
    </footer>
  );
}
