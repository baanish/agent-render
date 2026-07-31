"use client";

import { useEffect, useMemo, useRef } from "react";
import type { HtmlArtifact } from "@/lib/payload/schema";
import { sanitizeKitHtml } from "@/lib/html/sanitize-kit-html";

type HtmlRendererProps = {
  artifact: HtmlArtifact;
  /**
   * True only when the payload arrived via server injection (self-hosted UUID mode). Trusted
   * content renders verbatim in a same-origin frame at the operator's documented risk; fragment
   * payloads are mintable by anyone and always render sanitized.
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
  const sanitized = useMemo(
    () => (trusted ? null : sanitizeKitHtml(artifact.content)),
    [artifact.content, trusted],
  );

  useEffect(() => {
    if (trusted) {
      return;
    }

    const container = containerRef.current;
    if (container) {
      initKitTabs(container);
    }
    onReady();
  }, [sanitized, trusted, onReady]);

  if (trusted) {
    return (
      <iframe
        className="kit-html-frame"
        data-testid="renderer-html-trusted"
        data-renderer-ready="true"
        srcDoc={artifact.content}
        title={artifact.title ?? artifact.id}
        onLoad={(event) => {
          const frame = event.currentTarget;
          const height = frame.contentDocument?.documentElement.scrollHeight ?? 0;
          if (height > 0) {
            frame.style.height = `${height + 24}px`;
          }
          onReady();
        }}
      />
    );
  }

  return (
    <div
      ref={containerRef}
      className="kit-html"
      data-testid="renderer-html"
      data-renderer-ready="true"
      dangerouslySetInnerHTML={{ __html: sanitized ?? "" }}
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
