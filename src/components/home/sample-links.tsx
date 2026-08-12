"use client";

import { sampleLinkCards } from "@/components/home/sample-link-data";
import { numberFormatter } from "@/lib/format";
import { cn } from "@/lib/utils";

type SampleLinksProps = {
  activeHash: string;
};

/**
 * Renders the deferred sample-fragment table for the homepage.
 *
 * Keeps the large preset envelope strings and prebuilt hashes out of the initial viewer shell chunk
 * while preserving the same visible sample links once the empty-state page finishes hydrating.
 */
export function SampleLinks({ activeHash }: SampleLinksProps) {
  return (
    <section className="home-samples-section">
      <div className="sample-table-wrap">
        <table className="sample-table">
          <caption>Reference</caption>
          <thead>
            <tr>
              <th>Kind</th>
              <th>Title</th>
              <th>Chars</th>
            </tr>
          </thead>
          <tbody>
            {sampleLinkCards.map((sample) => {
              const isActive = activeHash === sample.hash;

              return (
                <tr key={sample.hash} className={cn("sample-row", isActive && "is-active")}>
                  <td className="sample-row-kind">{sample.kind}</td>
                  <td>
                    <a href={sample.hash} className="sample-row-title">
                      {sample.title}
                    </a>
                  </td>
                  <td className="sample-row-chars">
                    {numberFormatter.format(sample.fragmentLength)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
