"use client";

import { useMemo } from "react";
import Papa from "papaparse";
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import type { CsvArtifact } from "@/lib/payload/schema";

type CsvRendererProps = {
  artifact: CsvArtifact;
};

type CsvRow = Record<string, string>;

export function CsvRenderer({ artifact }: CsvRendererProps) {
  const parsed = useMemo(() => {
    const result = Papa.parse<string[]>(artifact.content, { skipEmptyLines: true });

    if (result.errors.length > 0) {
      return { error: result.errors[0]?.message ?? "CSV parsing failed.", headers: [], rows: [] as CsvRow[] };
    }

    const [headerRow = [], ...bodyRows] = result.data;
    const headers = headerRow.map((value, index) => value || `column_${index + 1}`);
    const rows = bodyRows.map((row) =>
      headers.reduce<CsvRow>((record, header, index) => {
        record[header] = row[index] ?? "";
        return record;
      }, {}),
    );

    return { error: null, headers, rows };
  }, [artifact.content]);

  const columns = useMemo(() => {
    const helper = createColumnHelper<CsvRow>();
    return parsed.headers.map((header) =>
      helper.accessor((row) => row[header], {
        id: header,
        header: () => header,
        cell: (info) => info.getValue(),
      }),
    );
  }, [parsed.headers]);

  const table = useReactTable({
    data: parsed.rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  if (parsed.error) {
    return <div className="artifact-empty-state">{parsed.error}</div>;
  }

  return (
    <div className="csv-renderer-shell">
      <div className="csv-renderer-toolbar">
        <span className="mono-pill">{parsed.rows.length} rows</span>
        <span className="mono-pill">{parsed.headers.length} columns</span>
      </div>
      <div className="csv-table-wrap">
        <table className="csv-table">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id}>
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
