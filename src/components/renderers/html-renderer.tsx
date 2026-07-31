"use client";

import { useEffect, useRef } from "react";
import type { HtmlArtifact } from "@/lib/payload/schema";
import { sanitizeKitHtmlInto } from "@/lib/html/sanitize-kit-html";

type HtmlRendererProps = {
  artifact: HtmlArtifact;
  /**
   * True only when the payload arrived via server injection (self-hosted UUID mode). Trusted
   * content renders verbatim in a sandboxed (origin-isolated) frame; fragment payloads are mintable
   * by anyone and always render sanitized inline.
   */
  trusted: boolean;
  onReady: () => void;
};

/**
 * Renders kit `html` artifacts. Untrusted content is sanitized to the kit vocabulary and rendered
 * inline; kit interactivity (tabs) is wired here with viewer-owned JS, so agent markup never needs
 * scripts. See sanitize-kit-html.ts for the trust boundary.
 */
export function HtmlRenderer({ artifact, trusted, onReady }: HtmlRendererProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (trusted) {
      return;
    }

    const container = containerRef.current;
    if (container) {
      // Adopt the sanitized nodes directly rather than assigning a string to innerHTML: the browser
      // never re-parses the sanitizer's output, so serialize/re-parse mutation XSS has no surface.
      sanitizeKitHtmlInto(container, artifact.content);
      initKitTabs(container);
    }
    onReady();
  }, [artifact.content, trusted, onReady]);

  if (trusted) {
    // Server-injected (self-hosted) HTML runs verbatim, but sandboxed WITHOUT allow-same-origin, so
    // scripts and forms work while the document sits in an opaque origin: it cannot reach the parent
    // DOM, the auth cookie, or the artifact API. Height is fixed by CSS (the parent cannot read a
    // cross-origin frame's scrollHeight), and the frame scrolls internally.
    return (
      <iframe
        className="kit-html-frame"
        data-testid="renderer-html-trusted"
        data-renderer-ready="true"
        sandbox="allow-scripts allow-popups allow-forms allow-modals"
        srcDoc={artifact.content}
        title={artifact.title ?? artifact.id}
        onLoad={onReady}
      />
    );
  }

  return (
    <div
      ref={containerRef}
      className="kit-html"
      data-testid="renderer-html"
      data-renderer-ready="true"
    />
  );
}

/**
 * Wires `.ar-tabs` containers: builds a tab bar from each panel's `data-ar-tab` label and toggles
 * panel visibility. Declarative agent markup in, viewer-owned behavior out.
 */
function initKitTabs(root: HTMLElement) {
  for (const tabs of Array.from(root.querySelectorAll<HTMLElement>(".ar-tabs"))) {
    if (tabs.dataset.arReady === "true") {
      continue;
    }

    const panels = Array.from(tabs.children).filter(
      (child): child is HTMLElement =>
        child instanceof HTMLElement && child.classList.contains("ar-tab"),
    );
    if (panels.length === 0) {
      continue;
    }

    const bar = document.createElement("div");
    bar.className = "ar-tab-bar";
    bar.setAttribute("role", "tablist");

    const buttons = panels.map((panel, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ar-tab-button";
      button.setAttribute("role", "tab");
      button.textContent = panel.getAttribute("data-ar-tab") ?? `Tab ${index + 1}`;
      bar.appendChild(button);
      return button;
    });

    const activate = (activeIndex: number) => {
      panels.forEach((panel, index) => {
        panel.toggleAttribute("hidden", index !== activeIndex);
      });
      buttons.forEach((button, index) => {
        button.setAttribute("aria-selected", index === activeIndex ? "true" : "false");
      });
    };

    buttons.forEach((button, index) => {
      button.addEventListener("click", () => activate(index));
    });

    tabs.prepend(bar);
    activate(0);
    tabs.dataset.arReady = "true";
  }
}
