"use client";

import { useEffect, useRef } from "react";
import type { HtmlArtifact } from "@/lib/payload/schema";
import { sanitizeKitHtmlInto } from "@/lib/html/sanitize-kit-html";
import { withBasePath } from "@/lib/site/base-path";

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
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  // Trusted path: hand the markup to the isolation frame once it reports ready. The frame is
  // origin-opaque, so a postMessage handshake is the only channel; it also means the frame renders
  // empty if opened directly, rather than becoming a general HTML-rendering endpoint.
  useEffect(() => {
    if (!trusted) {
      return;
    }

    const handleMessage = (event: MessageEvent) => {
      const frame = frameRef.current;
      if (!frame || event.source !== frame.contentWindow) {
        return;
      }

      const data = event.data as { type?: string; height?: number } | null;
      if (data?.type === "agent-render:frame-ready") {
        frame.contentWindow?.postMessage(
          { type: "agent-render:artifact-html", html: artifact.content },
          "*",
        );
        onReady();
        return;
      }

      if (data?.type === "agent-render:artifact-height" && typeof data.height === "number") {
        frame.style.height = `${data.height + 24}px`;
      }
    };

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [artifact.content, trusted, onReady]);

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
    // Server-injected (self-hosted) HTML runs verbatim in the isolation frame, which is a separate
    // document (public/artifact-frame.html) rather than a srcdoc. That distinction is the whole
    // feature: a srcdoc inherits this page's nonce/hash-only script-src, which blocked every
    // artifact script, and inherits no stylesheet, so kit classes rendered unstyled. The frame
    // carries its own CSP (set by the self-hosted server for that path) and links the generated kit
    // stylesheet, so scripts run and the kit renders.
    //
    // sandbox is allow-scripts ONLY, deliberately. The opaque origin stops the frame reading the
    // viewer DOM, the auth cookie, or the artifact API; withholding forms and modals stops it
    // *asking* for the shared password with a prompt() or a lookalike sign-in form. Agents relay
    // untrusted content, so a stored artifact is hostile UI even on the operator's own instance.
    return (
      <iframe
        ref={frameRef}
        className="kit-html-frame"
        data-testid="renderer-html-trusted"
        data-renderer-ready="true"
        sandbox="allow-scripts"
        src={withBasePath("/artifact-frame.html")}
        title={artifact.title ?? artifact.id}
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
