"use client";

import type { CSSProperties } from "react";
import {
  ArrowUpRight,
  FileCode2,
  FileDiff,
  FileJson2,
  FileSpreadsheet,
  FileText,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { sampleLinkCards } from "@/components/home/sample-link-data";
import type { ArtifactKind } from "@/lib/payload/schema";
import { cn } from "@/lib/utils";

type SampleLinksProps = {
  activeHash: string;
  animationStyle: CSSProperties;
};

const numberFormatter = new Intl.NumberFormat("en-US");

const kindIcons: Record<ArtifactKind, LucideIcon> = {
  markdown: FileText,
  code: FileCode2,
  diff: FileDiff,
  csv: FileSpreadsheet,
  json: FileJson2,
};

/**
 * Renders the deferred sample-fragment grid for the homepage.
 *
 * Keeps the large preset envelope strings and prebuilt hashes out of the initial viewer shell chunk
 * while preserving the same visible sample links once the empty-state page finishes hydrating.
 */
export function SampleLinks({ activeHash, animationStyle }: SampleLinksProps) {
  return (
    <section
      className="home-samples-section fade-up"
      style={animationStyle}
    >
      <div className="section-header">
        <div>
          <p className="section-kicker">Example fragments</p>
          <h3 className="font-display mt-3 text-2xl font-bold tracking-[-0.03em] sm:mt-4 sm:text-4xl">
            Load a sample envelope
          </h3>
        </div>
        <span className="mono-pill">{sampleLinkCards.length} presets</span>
      </div>
      <p className="mt-4 max-w-2xl text-sm leading-7 text-[color:var(--text-muted)] sm:mt-5 sm:text-base sm:leading-8">
        Click any sample to open it in the viewer. Same encoding as production
        links.
      </p>

      <div className="sample-link-grid mt-6 sm:mt-8">
        {sampleLinkCards.map((sample) => {
          const Icon = kindIcons[sample.kind];
          const isActive = activeHash === sample.hash;

          return (
            <a
              key={sample.hash}
              href={sample.hash}
              className={cn("sample-link", isActive && "is-active")}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mono-pill !px-2.5 !py-1">
                    <Icon className="h-3.5 w-3.5" />
                    {sample.kind}
                  </span>
                  <span className="section-kicker">
                    {numberFormatter.format(sample.fragmentLength)} chars
                  </span>
                </div>
                <h4 className="mt-3 text-base font-semibold leading-6 sm:text-lg">
                  {sample.title}
                </h4>
                <p className="mt-1.5 text-sm leading-7 text-[color:var(--text-muted)]">
                  {sample.description ??
                    `${sample.artifactCount} artifact${sample.artifactCount === 1 ? "" : "s"}`}
                </p>
              </div>
              <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-[color:var(--text-soft)]" />
            </a>
          );
        })}
      </div>
    </section>
  );
}
