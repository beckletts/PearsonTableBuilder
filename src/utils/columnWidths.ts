import type { ColumnConfig } from '../lib/types';

// Without widths a browser sizes columns from their content, so a column of
// long qualification names takes most of the table and a column of short job
// titles gets squeezed into a sliver. Widths are percentages of the table, not
// pixels, because these tables are embedded in pages of varying width.

/** Whether any visible column asks for a width, which puts the table on fixed layout. */
export function hasColumnWidths(columns: ColumnConfig[]): boolean {
  return columns.some((c) => c.visible && isWidthSet(c.width));
}

export function isWidthSet(width: number | undefined): width is number {
  return typeof width === 'number' && width > 0;
}

/** Clamp a typed width to something a table can honour. */
export function normaliseWidth(value: number): number {
  return Math.min(100, Math.max(1, Math.round(value)));
}

/** The style for a column's <col>, or undefined to let it share what's left. */
export function columnWidthStyle(column: ColumnConfig): { width: string } | undefined {
  return isWidthSet(column.width) ? { width: `${column.width}%` } : undefined;
}

export interface WidthSummary {
  /** Percentage claimed by columns that have a width. */
  claimed: number;
  /** Visible columns left to share whatever remains. */
  autoCount: number;
  /** What each auto column gets, or 0 when widths already fill the table. */
  perAuto: number;
  /** Set widths add up to more than the table — the browser will scale them down. */
  over: boolean;
}

/** What the current widths add up to, for showing alongside the inputs. */
export function summariseWidths(columns: ColumnConfig[]): WidthSummary {
  const visible = columns.filter((c) => c.visible);
  const claimed = visible.reduce((sum, c) => sum + (isWidthSet(c.width) ? c.width : 0), 0);
  const autoCount = visible.filter((c) => !isWidthSet(c.width)).length;
  const remaining = Math.max(0, 100 - claimed);

  return {
    claimed,
    autoCount,
    perAuto: autoCount > 0 ? Math.round((remaining / autoCount) * 10) / 10 : 0,
    over: claimed > 100,
  };
}

/** Spread the table evenly across its visible columns. */
export function evenWidths(columns: ColumnConfig[]): ColumnConfig[] {
  const visibleCount = columns.filter((c) => c.visible).length;
  if (visibleCount === 0) return columns;
  const each = normaliseWidth(100 / visibleCount);
  return columns.map((c) => (c.visible ? { ...c, width: each } : c));
}

/** Hand every column back to automatic sizing. */
export function clearWidths(columns: ColumnConfig[]): ColumnConfig[] {
  return columns.map((c) => (isWidthSet(c.width) ? { ...c, width: undefined } : c));
}
