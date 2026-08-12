"use client";

import dynamic from "next/dynamic";
import type { CSSProperties } from "react";
import { withBasePath } from "@/lib/site/base-path";

const iconPath = withBasePath("/icon.svg");
const securityPath = withBasePath("/security/");
const iconImageStyle: CSSProperties = {
  backgroundImage: `url(${iconPath})`,
  backgroundPosition: "center",
  backgroundRepeat: "no-repeat",
  backgroundSize: "contain",
};

const ThemeToggle = dynamic(
  () =>
    import("@/components/theme-toggle").then((module) => module.ThemeToggle),
  {
    ssr: false,
    loading: () => (
      <span aria-hidden="true" className="theme-rocker is-loading">
        Theme
      </span>
    ),
  },
);

type InstrumentHeaderProps = {
  onGoHome?: () => void;
};

/**
 * Renders the instrument chassis header with home control, security link, and theme rocker.
 * Optional `onGoHome` clears the fragment on the viewer shell; secondary pages omit it and link home instead.
 */
export function InstrumentHeader({ onGoHome }: InstrumentHeaderProps) {
  const homePath = withBasePath("/");

  return (
    <header className="nav-bar print-hide-on-markdown">
      <a
        href={onGoHome ? "#" : homePath}
        onClick={
          onGoHome
            ? (event) => {
                event.preventDefault();
                onGoHome();
              }
            : undefined
        }
        className="brand-lockup"
        aria-label="Go to homepage"
      >
        <span aria-hidden="true" className="brand-mark" style={iconImageStyle} />
        <span className="brand-name">agent-render</span>
      </a>

      <div className="nav-cluster">
        <a href={securityPath} className="nav-text-link">
          Security
        </a>
        <ThemeToggle />
      </div>
    </header>
  );
}
