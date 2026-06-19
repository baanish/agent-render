"use client";

import { useEffect, useMemo, useRef } from "react";
import Papa from "papaparse";
import type { CsvArtifact } from "@/lib/payload/schema";

type CsvRendererProps = {
  artifact: CsvArtifact;
  onReady?: () => void;
};

/**
 * Displays CSV artifacts as a read-only table grid in the viewer renderer slot.
 * Takes `artifact` content and optional `onReady` callback for shell-level renderer readiness tracking.
 * Parses CSV client-side and shows a clear fallback message when parsing fails.
 */
export function CsvRenderer({ artifact, onReady }: CsvRendererProps) {
  const onReadyRef = useRef(onReady);
  const parsed = useMemo(() => {
    const result = Papa.parse<string[]>(artifact.content, { skipEmptyLines: true });

    if (result.errors.length > 0) {
      return { error: result.errors[0]?.message ?? "CSV parsing failed.", headers: [], rows: [] as string[][] };
    }

    const [headerRow = [], ...bodyRows] = result.data;
    let columnCount = headerRow.length;
    for (const row of bodyRows) {
      columnCount = Math.max(columnCount, row.length);
    }
    const headers = new Array<string>(columnCount);
    for (let index = 0; index < columnCount; index += 1) {
      headers[index] = headerRow[index] || `column_${index + 1}`;
    }

    return { error: null, headers, rows: bodyRows };
  }, [artifact.content]);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    onReadyRef.current?.();
  }, [artifact.id]);

  if (parsed.error) {
    return (
      <div className="artifact-empty-state" data-testid="renderer-csv" data-renderer-ready="true">
        {parsed.error}
      </div>
    );
  }

  return (
    <div className="csv-renderer-shell" data-testid="renderer-csv" data-renderer-ready="true">
      <div className="csv-renderer-toolbar">
        <span className="mono-pill">{parsed.rows.length} rows</span>
        <span className="mono-pill">{parsed.headers.length} columns</span>
      </div>
      <div className="csv-table-wrap">
        <table className="csv-table">
          <thead>
            <tr>
              {parsed.headers.map((header, index) => (
                <th key={`${header}-${index}`}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {parsed.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {parsed.headers.map((header, columnIndex) => (
                  <td key={`${header}-${columnIndex}`}>{row[columnIndex] ?? ""}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
