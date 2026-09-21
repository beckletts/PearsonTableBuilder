import type { TableConfig, TableRow } from '../lib/types';

// A tick or a cross is an answer, not a category: green means yes, red means no,
// and a viewer should be able to scan a column of them without reading a key.
// Both the published table and the builder preview resolve them here, so the
// two can't drift apart.

const TICK_CHARS  = new Set(['✓', '✔', '✅', '√']);
const CROSS_CHARS = new Set(['✗', '✘', '❌', '✖', 'x', 'X', '×']);

export const DEFAULT_TICK_COLOR  = '#007A3D';
export const DEFAULT_CROSS_COLOR = '#C8001E';

export type TickMark = 'tick' | 'cross' | null;

/** Whether a cell value is a bare tick or cross. */
export function tickMarkOf(value: string): TickMark {
  const v = value.trim();
  if (TICK_CHARS.has(v)) return 'tick';
  if (CROSS_CHARS.has(v)) return 'cross';
  return null;
}

/**
 * The colour for a tick or a cross — the table's own colours when set, else
 * green for yes and red for no.
 */
export function tickMarkColor(mark: Exclude<TickMark, null>, config: Pick<TableConfig, 'tickMarks'>): string {
  const marks = config.tickMarks;
  return mark === 'tick'
    ? marks?.tickColor ?? DEFAULT_TICK_COLOR
    : marks?.crossColor ?? DEFAULT_CROSS_COLOR;
}

/**
 * Whether ticks and crosses are shown as coloured symbols rather than as the
 * pill their column would otherwise give them. The default, since a pill
 * coloured by column tells a viewer which column they are already looking at,
 * while green and red tell them the answer.
 */
export function showsTickSymbols(config: Pick<TableConfig, 'tickMarks'>): boolean {
  return (config.tickMarks?.style ?? 'symbol') === 'symbol';
}

/**
 * Column keys whose values are ticks and crosses throughout.
 *
 * Such a column carries no categories, so it is left out of the badge guide:
 * there is no pill colour to explain, and green and red need no key.
 */
export function tickOnlyColumnKeys(keys: string[], rows: TableRow[]): Set<string> {
  const tickOnly = new Set<string>();

  for (const key of keys) {
    let sawMark = false;
    let allMarks = true;

    for (const row of rows) {
      const raw = row.data[key];
      const value = raw === null || raw === undefined ? '' : String(raw).trim();
      if (!value || value === '—') continue;  // blanks say nothing either way
      if (tickMarkOf(value)) sawMark = true;
      else { allMarks = false; break; }
    }

    if (sawMark && allMarks) tickOnly.add(key);
  }

  return tickOnly;
}
