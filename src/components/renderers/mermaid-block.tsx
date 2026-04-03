"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTheme } from "next-themes";

type MermaidBlockProps = {
  code: string;
  onReady?: () => void;
};

/**
 * Renders a mermaid diagram from raw mermaid syntax.
 *
 * Dynamically imports the mermaid library on first mount to keep the initial bundle light.
 * Responds to theme changes and re-renders diagrams when the active theme switches between
 * light and dark. Displays a fallback code block if rendering fails.
 */
export function MermaidBlock({ code, onReady }: MermaidBlockProps) {
  const containerId = useId().replace(/:/g, "_");
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    let cancelled = false;

    async function render() {
      try {
        const mermaid = (await import("mermaid")).default;

        mermaid.initialize({
          startOnLoad: false,
          theme: resolvedTheme === "dark" ? "dark" : "default",
          fontFamily: "inherit",
          securityLevel: "strict",
        });

        const { svg } = await mermaid.render(`mermaid-${containerId}`, code.trim());

        if (cancelled || !containerRef.current) return;

        containerRef.current.innerHTML = svg;
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to render mermaid diagram");
      } finally {
        if (!cancelled) onReady?.();
      }
    }

    render();

    return () => {
      cancelled = true;
    };
  }, [code, containerId, resolvedTheme, onReady]);

  if (error) {
    return (
      <div className="mermaid-error">
        <p className="mermaid-error-message">Diagram render failed: {error}</p>
        <pre className="mermaid-error-source">{code}</pre>
      </div>
    );
  }

  return <div ref={containerRef} className="mermaid-container" />;
}
