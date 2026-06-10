import type { ColumnConfig, ParsedFile, TableConfig } from '../lib/types';

const norm = (s: string) => s.toLowerCase().trim();

// Light type inference from sample values, mirroring the column types the AI assigns.
// Defaults to 'text' unless every sampled value clearly fits a narrower type.
function inferType(header: string, rows: Record<string, string>[]): ColumnConfig['type'] {
  const values = rows
    .map((r) => (r[header] ?? '').trim())
    .filter(Boolean)
    .slice(0, 50);
  if (values.length === 0) return 'text';
  if (values.every((v) => /^https?:\/\//i.test(v))) return 'url';
  if (values.every((v) => /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(v))) return 'date';
  if (values.every((v) => /^-?[\d,]+(\.\d+)?$/.test(v))) return 'number';
  return 'text';
}

export interface ReconcileResult {
  config: TableConfig;
  /** Labels of new columns appended from the uploaded file. */
  addedColumns: string[];
  /** Labels of existing columns whose header is absent from the uploaded file. */
  removedColumns: string[];
}

/**
 * Merge a freshly-uploaded file's headers into an existing table config.
 *
 * Every existing column keeps all of its settings (visibility, type, filters,
 * colour, etc.). Headers in the file that aren't already represented by an
 * existing column's key or label are appended as new text-by-default columns.
 * Removed columns are reported but left in place so previously-published links
 * don't lose structure unexpectedly.
 */
export function reconcileColumns(config: TableConfig, parsed: ParsedFile): ReconcileResult {
  const existing = config.columns;

  // A header is already represented if it matches a column's key or label.
  // (The same matching `StepCustomise` uses when remapping row data on save.)
  const isKnown = (header: string) =>
    existing.some((c) => norm(c.key) === norm(header) || norm(c.label) === norm(header));

  const newColumns: ColumnConfig[] = parsed.headers
    .filter((h) => h && !isKnown(h))
    .map((header) => ({
      key: header,
      label: header,
      visible: true,
      filterable: false,
      searchable: false,
      type: inferType(header, parsed.rows),
    }));

  const fileHeaders = new Set(parsed.headers.map(norm));
  const removedColumns = existing
    .filter((c) => !fileHeaders.has(norm(c.key)) && !fileHeaders.has(norm(c.label)))
    .map((c) => c.label);

  return {
    config: { ...config, columns: [...existing, ...newColumns] },
    addedColumns: newColumns.map((c) => c.label),
    removedColumns,
  };
}
