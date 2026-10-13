import type { TableRow } from '../lib/types';

/**
 * The first empty cell that follows the last value in a row.
 *
 * In a table of progressive steps a row simply runs out — three steps filled,
 * two blank — and the blanks mean "the pathway ends here", which is worth
 * saying once rather than repeating in every remaining cell.
 *
 * Returns null when the row has no trailing blank, or no values at all.
 */
export function firstTrailingEmptyKey(row: TableRow, keys: string[]): string | null {
  let lastFilled = -1;

  keys.forEach((key, i) => {
    const raw = row.data[key];
    const value = raw === null || raw === undefined ? '' : String(raw).trim();
    if (value) lastFilled = i;
  });

  if (lastFilled < 0 || lastFilled >= keys.length - 1) return null;
  return keys[lastFilled + 1];
}

/** That key for each row, so a cell can be checked without rescanning its row. */
export function firstTrailingEmptyByRow(rows: TableRow[], keys: string[]): Record<string, string> {
  const byRow: Record<string, string> = {};
  for (const row of rows) {
    const key = firstTrailingEmptyKey(row, keys);
    if (key) byRow[row.id] = key;
  }
  return byRow;
}
