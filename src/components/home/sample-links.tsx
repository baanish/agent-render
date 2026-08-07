"use client";

import { sampleLinkCards } from "@/components/home/sample-link-data";
import { numberFormatter } from "@/lib/format";
import { cn } from "@/lib/utils";

type SampleLinksProps = {
  activeHash: string;
};

/**
 * Renders the deferred sample-fragment grid for the homepage.
 *
 * Keeps the large preset envelope strings and prebuilt hashes out of the initial viewer shell chunk
 * while preserving the same visible sample links once the empty-state page finishes hydrating.
 */
export function SampleLinks({ activeHash }: SampleLinksProps) {
  return (
    <section className="home-samples-section">
      <header className="sample-index-heading">
        <h2>Samples</h2>
        <span>INDEX / {String(sampleLinkCards.length).padStart(2, "0")}</span>
      </header>

      <ol className="sample-link-grid">
        {sampleLinkCards.map((sample, index) => {
          const isActive = activeHash === sample.hash;

          return (
            <li key={sample.hash}>
              <a
                href={sample.hash}
                className={cn("sample-link", isActive && "is-active")}
              >
                <span className="sample-link-index">{String(index + 1).padStart(2, "0")}</span>
                <span className="sample-link-copy">
                  <span className="sample-link-title">{sample.title}</span>
                  <span className="sample-link-meta">
                    {sample.artifactCount} artifact{sample.artifactCount === 1 ? "" : "s"}
                  </span>
                </span>
                <span className="sample-link-length">
                  {numberFormatter.format(sample.fragmentLength)} CH
                </span>
              </a>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
