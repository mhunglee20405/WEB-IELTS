"use client";

import { useId, type CSSProperties, type ReactNode } from "react";
import { QueryState } from "./query-state";

export interface DataTableColumn<T> {
  key: string;
  header: string;
  renderCell: (row: T) => ReactNode;
  align?: "start" | "end";
}

export interface DataTableProps<T> {
  caption: string;
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  isLoading?: boolean;
  isError?: boolean;
  error?: unknown;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
}

/**
 * Accessible responsive table following modern-web-guidance `responsive-table`:
 * - Keyboard-scrollable wrapper (`tabIndex={0}`, `role="region"`, `aria-labelledby`).
 * - Required `<caption>`, `<th scope="col">`, and `<th scope="row">` for the primary column.
 * - Automatically collapses into container-queried stacked cards under 600px width
 *   using CSS custom properties `--cell-label`.
 */
export function DataTable<T>({
  caption,
  columns,
  rows,
  getRowKey,
  isLoading = false,
  isError = false,
  error,
  onRetry,
  emptyTitle,
  emptyDescription,
  emptyAction,
}: DataTableProps<T>) {
  const captionId = useId();
  const primaryColumn = columns[0];
  const secondaryColumns = columns.slice(1);

  return (
    <QueryState
      isLoading={isLoading}
      isError={isError}
      error={error}
      isEmpty={!isLoading && !isError && rows.length === 0}
      onRetry={onRetry}
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
      emptyAction={emptyAction}
    >
      <div
        tabIndex={0}
        role="region"
        aria-labelledby={captionId}
        className="lms-table-wrapper"
      >
        <table className="lms-table">
          <caption id={captionId}>{caption}</caption>
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={column.align === "end" ? "text-end" : "text-start"}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={getRowKey(row)}>
                {primaryColumn ? (
                  <th scope="row">{primaryColumn.renderCell(row)}</th>
                ) : null}
                {secondaryColumns.map((column) => (
                  <td
                    key={column.key}
                    style={
                      {
                        "--cell-label": `"${column.header.replaceAll('"', '\\"')}"`,
                      } as CSSProperties
                    }
                    className={column.align === "end" ? "md:text-end" : undefined}
                  >
                    {column.renderCell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </QueryState>
  );
}

