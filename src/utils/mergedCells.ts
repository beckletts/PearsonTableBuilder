import type { TableRow } from '../lib/types';

/**
 * For each merge-enabled column, a blank cell attaches (rowSpan) to the nearest
 * filled cell directly above it in the currently displayed row order — mirroring
 * how a merged cell looks when exported from Excel (value in the top cell, blanks below).
 * Returns one entry per row: colKey -> rowSpan, where 0 means "don't render this cell,
 * it's covered by an earlier row's rowSpan".
 */
export function computeMergedSpans(
  rows: TableRow[],
  mergeColumnKeys: string[],
): Record<string, number>[] {
  const spans: Record<string, number>[] = rows.map(() => ({}));
  for (const colKey of mergeColumnKeys) {
    let startIdx = -1;
    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i].data[colKey];
      const isEmpty = raw === null || raw === undefined || String(raw).trim() === '';
      if (isEmpty && startIdx >= 0) {
        spans[startIdx][colKey] = (spans[startIdx][colKey] ?? 1) + 1;
        spans[i][colKey] = 0;
      } else {
        spans[i][colKey] = 1;
        startIdx = isEmpty ? -1 : i;
      }
    }
  }
  return spans;
}
