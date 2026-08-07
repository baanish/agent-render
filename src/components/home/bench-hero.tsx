"use client";

import type { CSSProperties } from "react";

type BenchHeroProps = {
  animationStyle?: CSSProperties;
};

/**
 * Compact wordmark-plus-truth strip that tops the empty-state instrument rig.
 * Replaces the old full-bleed essay hero: one display line, one plain-English
 * trust statement. Deeper framing lives in the inspector + footer.
 */
export function BenchHero({ animationStyle }: BenchHeroProps) {
  return (
    <section className="bench-hero" style={animationStyle}>
      <h2 className="bench-hero-headline">Zero-retention viewer for AI output, delivered in one link.</h2>
      <p className="bench-hero-truth">Everything lives in the URL fragment. The host only serves the shell.</p>
      <div className="bench-hero-trust" aria-label="Trust details">
        <span className="mono-pill">open source</span>
        <span className="mono-pill">self-hostable</span>
        <span className="mono-pill">no database</span>
      </div>
    </section>
  );
}
