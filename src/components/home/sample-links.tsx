"use client";

import type { CSSProperties } from "react";
import { ArrowUpRight } from "lucide-react";
import { kindIcons } from "@/components/artifact-kind-icons";
import { sampleLinkCards } from "@/components/home/sample-link-data";
import { numberFormatter } from "@/lib/format";
import { cn } from "@/lib/utils";

type SampleLinksProps = {
  activeHash: string;
  animationStyle?: CSSProperties;
};

/**
 * Vertical sample list for the empty-state side bench — one hairline row per
 * preset: kind pill, title, single-line description, char count, arrow.
 * Keeps preset hashes out of the initial shell chunk (dynamically imported).
 */
export function SampleLinks({ activeHash, animationStyle }: SampleLinksProps) {
  return (
    <section className="home-samples-section bench-section" style={animationStyle}>
      <div className="bench-section-head">
        <h3 className="bench-section-title">Samples</h3>
        <span className="mono-pill">{sampleLinkCards.length}</span>
      </div>

      <div className="sample-list">
        {sampleLinkCards.map((sample) => {
          const Icon = kindIcons[sample.kind];
          const isActive = activeHash === sample.hash;

          return (
            <a
              key={sample.hash}
              href={sample.hash}
              className={cn("sample-link", "bench-cell", isActive && "is-active")}
            >
              <span className="mono-pill sample-row-kind bench-cell-kind">
                <Icon className="h-3 w-3" />
                {sample.kind}
              </span>
              <span className="sample-row-body bench-cell-body">
                <span className="sample-row-title">{sample.title}</span>
                <span className="sample-row-desc">
                  {sample.description ??
                    `${sample.artifactCount} artifact${sample.artifactCount === 1 ? "" : "s"}`}
                </span>
              </span>
              <span className="sample-row-meta bench-readout">
                <span className="sample-row-count">
                  {numberFormatter.format(sample.fragmentLength)} chars
                </span>
                <ArrowUpRight className="sample-row-arrow h-3.5 w-3.5" />
              </span>
            </a>
          );
        })}
      </div>
    </section>
  );
}
