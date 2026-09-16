import type { ColumnConfig, ParsedFile, TableConfig, Widget } from '../lib/types';
import { ORIGINAL_ORDER } from '../lib/types';

// Header matching ignores case and collapses runs of whitespace, so a header
// that picked up a stray space or line break (common in exported spreadsheets)
// still matches the column it already belongs to. Without this a near-identical
// header looks like a brand new column and the original is left behind, empty.
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** The header in an uploaded file that supplies this column's values, if any. */
export function findFileHeader(
  headers: string[],
  column: Pick<ColumnConfig, 'key' | 'label'>,
): string | undefined {
  return headers.find((h) => norm(h) === norm(column.key) || norm(h) === norm(column.label));
}

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

/** A header that exists in the file but has no values in any row. */
function isEmptyInFile(header: string, rows: Record<string, string>[]): boolean {
  return rows.every((r) => (r[header] ?? '').trim() === '');
}

// A column the upload creates from a file header. The key keeps the header
// verbatim so row values still line up; the label is tidied for display, since
// headers spanning several lines in a spreadsheet arrive with double spaces.
function newColumn(header: string, rows: Record<string, string>[]): ColumnConfig {
  return {
    key: header,
    label: header.replace(/\s+/g, ' ').trim(),
    visible: !isEmptyInFile(header, rows),  // a column with no values has nothing to show
    filterable: false,
    searchable: false,
    type: inferType(header, rows),
  };
}

export interface ReconcileResult {
  config: TableConfig;
  /** Labels of new columns taken from the uploaded file. */
  addedColumns: string[];
  /** Labels of existing columns whose header is absent from the uploaded file. */
  removedColumns: string[];
  /** Labels of columns the file contains but leaves empty — added, and hidden. */
  emptyColumns: string[];
}

/**
 * Merge a freshly-uploaded file's headers into an existing table config.
 *
 * Every existing column keeps all of its settings (visibility, type, filters,
 * colour, etc.). Headers in the file that aren't already represented by an
 * existing column's key or label are appended as new text-by-default columns.
 * Columns missing from the file are reported but left in place, so previously
 * published links don't lose structure unexpectedly — use
 * `replaceTableStructure` when the file should define the columns outright.
 */
export function reconcileColumns(config: TableConfig, parsed: ParsedFile): ReconcileResult {
  const existing = config.columns;

  const isKnown = (header: string) =>
    existing.some((c) => norm(c.key) === norm(header) || norm(c.label) === norm(header));

  const newColumns: ColumnConfig[] = parsed.headers
    .filter((h) => h && !isKnown(h))
    .map((header) => newColumn(header, parsed.rows));

  return {
    config: { ...config, columns: [...existing, ...newColumns] },
    addedColumns: newColumns.map((c) => c.label),
    removedColumns: missingFromFile(existing, parsed.headers).map((c) => c.label),
    emptyColumns: newColumns.filter((c) => !c.visible).map((c) => c.label),
  };
}

/**
 * Build a column list straight from an uploaded file's headers, in file order.
 *
 * A header that matches a column the table already has keeps that column's
 * settings; everything else becomes a new text-by-default column. Headers the
 * file doesn't contain are simply absent — this is the column list for a true
 * replace.
 */
export function columnsFromFile(parsed: ParsedFile, existing: ColumnConfig[] = []): ColumnConfig[] {
  const columns: ColumnConfig[] = [];
  const usedKeys = new Set<string>();

  for (const header of parsed.headers) {
    if (!header) continue;

    const match = existing.find((c) => norm(c.key) === norm(header) || norm(c.label) === norm(header));
    // The file is the source of truth here, so a column it leaves empty is hidden
    // even if it used to be shown.
    const base: ColumnConfig = match
      ? (isEmptyInFile(header, parsed.rows) ? { ...match, visible: false } : match)
      : newColumn(header, parsed.rows);

    // Two headers can normalise to the same key (e.g. a repeated column name).
    // Suffix the duplicate so each column keeps its own data.
    let key = base.key;
    let n = 1;
    while (usedKeys.has(norm(key))) {
      n++;
      key = `${base.key} ${n}`;
    }
    usedKeys.add(norm(key));
    columns.push(key === base.key ? base : { ...base, key, label: base.label });
  }

  return columns;
}

/**
 * Keep an AI-suggested column list honest about the file it describes.
 *
 * Columns whose key doesn't match a header in the file are dropped (they would
 * only ever render empty), and any header the suggestion missed is appended
 * with inferred settings, so the table shows every column in the file exactly
 * once.
 */
export function alignColumnsToFile(columns: ColumnConfig[], parsed: ParsedFile): ColumnConfig[] {
  const matched: ColumnConfig[] = [];
  const covered = new Set<string>();

  for (const column of columns) {
    const header = findFileHeader(parsed.headers, column);
    if (!header || covered.has(norm(header))) continue;
    covered.add(norm(header));
    matched.push(
      isEmptyInFile(header, parsed.rows) ? { ...column, visible: false } : column,
    );
  }

  const missing = columnsFromFile({
    ...parsed,
    headers: parsed.headers.filter((h) => h && !covered.has(norm(h))),
  });

  return [...matched, ...missing];
}

/**
 * Swap a table's columns for a new set — the "replace everything" path.
 *
 * Display and branding settings (pagination, sticky header, tracking, refresh
 * note, title, description) are kept, because they describe the table rather
 * than the data. Anything that points at a column — default sort, primary
 * search column, filter order, widgets — is re-pointed or dropped so nothing
 * references a column that no longer exists.
 */
export function replaceTableStructure(
  config: TableConfig,
  columns: ColumnConfig[],
  parsed: ParsedFile,
  hints?: { primarySearchColumn?: string; defaultSort?: TableConfig['defaultSort'] },
): ReconcileResult {
  const keptKeys = new Set(config.columns.map((c) => norm(c.key)));
  const newKeys = new Set(columns.map((c) => norm(c.key)));

  const next = pruneDanglingReferences({
    ...config,
    columns,
    primarySearchColumn: hints?.primarySearchColumn ?? config.primarySearchColumn,
    defaultSort: hints?.defaultSort ?? config.defaultSort,
    // Let filter order fall back to the new column order rather than the old one.
    filterOrder: config.filterOrder?.filter((k) => newKeys.has(norm(k))),
  });

  return {
    config: next,
    addedColumns: columns.filter((c) => !keptKeys.has(norm(c.key))).map((c) => c.label),
    removedColumns: config.columns.filter((c) => !newKeys.has(norm(c.key))).map((c) => c.label),
    emptyColumns: columns
      .filter((c) => {
        const header = findFileHeader(parsed.headers, c);
        return header ? isEmptyInFile(header, parsed.rows) : false;
      })
      .map((c) => c.label),
  };
}

/** Drop a single column and tidy up anything that referenced it. */
export function removeColumn(config: TableConfig, key: string): TableConfig {
  return pruneDanglingReferences({
    ...config,
    columns: config.columns.filter((c) => c.key !== key),
  });
}

/** Drop every column whose header is absent from the uploaded file. */
export function dropColumnsMissingFromFile(config: TableConfig, parsed: ParsedFile): TableConfig {
  const missing = new Set(missingFromFile(config.columns, parsed.headers).map((c) => c.key));
  return pruneDanglingReferences({
    ...config,
    columns: config.columns.filter((c) => !missing.has(c.key)),
  });
}

/**
 * Re-point or remove every setting that names a column, so a config never
 * refers to a column that isn't in its column list.
 */
export function pruneDanglingReferences(config: TableConfig): TableConfig {
  const byKey = new Map(config.columns.map((c) => [c.key, c]));
  const has = (key: string | undefined): key is string => !!key && byKey.has(key);

  const primarySearchColumn = has(config.primarySearchColumn)
    ? config.primarySearchColumn
    : config.columns.find((c) => c.searchable)?.key
      ?? config.columns.find((c) => c.visible)?.key
      ?? config.columns[0]?.key
      ?? '';

  const sortColumn =
    config.defaultSort.column === ORIGINAL_ORDER || has(config.defaultSort.column)
      ? config.defaultSort.column
      : ORIGINAL_ORDER;

  return {
    ...config,
    primarySearchColumn,
    defaultSort: { ...config.defaultSort, column: sortColumn },
    filterOrder: config.filterOrder?.filter((k) => byKey.get(k)?.filterable),
    widgets: config.widgets ? pruneWidgets(config.widgets, has) : config.widgets,
  };
}

// ── Internals ────────────────────────────────────────────────────────────────

function missingFromFile(columns: ColumnConfig[], headers: string[]): ColumnConfig[] {
  const fileHeaders = new Set(headers.map(norm));
  return columns.filter((c) => !fileHeaders.has(norm(c.key)) && !fileHeaders.has(norm(c.label)));
}

// Widgets read their data from named columns. Keep the ones that still have
// something to show; drop the rest rather than render an empty card.
function pruneWidgets(widgets: Widget[], has: (key: string | undefined) => boolean): Widget[] {
  return widgets.flatMap<Widget>((widget) => {
    if (widget.type === 'stat_cards') {
      const cfg = widget.config as { stats: { label: string; type: string; column?: string }[] };
      const stats = (cfg.stats ?? []).filter((s) => s.type === 'total_rows' || has(s.column));
      if (stats.length === 0) return [];
      return [{ ...widget, config: { ...cfg, stats } } as Widget];
    }

    if (widget.type === 'card_view') {
      const cfg = widget.config as {
        titleColumn: string;
        subtitleColumn?: string;
        badgeColumns?: string[];
        linkColumn?: string;
        descriptionColumn?: string;
      };
      if (!has(cfg.titleColumn)) return [];
      return [{
        ...widget,
        config: {
          ...cfg,
          subtitleColumn: has(cfg.subtitleColumn) ? cfg.subtitleColumn : undefined,
          linkColumn: has(cfg.linkColumn) ? cfg.linkColumn : undefined,
          descriptionColumn: has(cfg.descriptionColumn) ? cfg.descriptionColumn : undefined,
          badgeColumns: cfg.badgeColumns?.filter((k) => has(k)),
        },
      } as Widget];
    }

    // intro_banner, callout_box and footer_note are free text — nothing to prune.
    return [widget];
  });
}
