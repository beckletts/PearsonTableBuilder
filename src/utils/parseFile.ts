import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import type { ParsedFile } from '../lib/types';

// Format a JS Date as DD/MM/YYYY (UTC-based to avoid timezone shifts on date-only values)
function formatDate(d: Date): string {
  const day = d.getUTCDate().toString().padStart(2, '0');
  const mon = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  return `${day}/${mon}/${d.getUTCFullYear()}`;
}

// Coerce any cell value to a clean string
function clean(val: unknown): string {
  if (val instanceof Date) return formatDate(val);
  const s = String(val ?? '')
    .replace(/​/g, '')  // zero-width space
    .replace(/\n/g, ' ')     // embedded newlines → space
    .trim();
  // Strip Excel error values and unevaluated formula strings
  if (/^#(N\/A|VALUE!|REF!|DIV\/0!|NAME\?|NULL!|NUM!)$/.test(s)) return '';
  if (s.startsWith('=')) return '';
  return s;
}

// Clean a header cell: strip newlines and extra whitespace
function cleanHeader(val: unknown): string {
  return String(val ?? '')
    .replace(/​/g, '')
    .replace(/\n/g, ' ')
    .trim();
}

// Check whether a cell value looks like it could be a real text header
function isHeaderCell(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (v instanceof Date) return false;
  const s = String(v).trim();
  if (!s) return false;
  if (s.startsWith('=')) return false;  // preamble formula cell
  return true;
}

export async function getSheetNames(file: File): Promise<string[]> {
  const name = file.name.toLowerCase();
  if (!name.endsWith('.xlsx') && !name.endsWith('.xls')) return [];
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', bookSheets: true });
  return wb.SheetNames;
}

export async function parseFile(file: File, sheetName?: string): Promise<ParsedFile> {
  const name = file.name.toLowerCase();

  if (name.endsWith('.csv')) {
    return new Promise((resolve, reject) => {
      Papa.parse<Record<string, string>>(file, {
        header: true,
        skipEmptyLines: true,
        complete: (result) => {
          resolve({
            headers: result.meta.fields ?? [],
            rows: result.data.map((row) =>
              Object.fromEntries(Object.entries(row).map(([k, v]) => [k, clean(v)])),
            ),
          });
        },
        error: (err) => reject(new Error(err.message)),
      });
    });
  }

  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const buf = await file.arrayBuffer();
    // cellDates: true → date cells come back as JS Date objects, not serial numbers
    const wb = XLSX.read(buf, { type: 'array', cellDates: true });
    const ws = wb.Sheets[sheetName ?? wb.SheetNames[0]];
    if (!ws) throw new Error(`Sheet "${sheetName}" not found in workbook.`);

    // Read all rows as raw arrays so we can detect preamble rows
    const rawRows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null });

    // Find the real header row: first row with ≥3 non-empty, non-formula, non-date cells
    // (the overview file has 4 preamble rows with formula strings before the real headers on row 5)
    const hdrIdx = rawRows.findIndex((row) =>
      (row as unknown[]).filter(isHeaderCell).length >= 3
    );

    if (hdrIdx < 0 || rawRows.length <= hdrIdx) {
      return { headers: [], rows: [] };
    }

    // Build clean, deduplicated header list (track which column indices to use)
    const headerRow = rawRows[hdrIdx] as unknown[];
    const headers: string[] = [];
    const colIndices: number[] = [];  // which column index each header came from

    headerRow.forEach((h, i) => {
      const label = cleanHeader(h);
      if (!label) return;  // skip empty header columns
      // Deduplicate: suffix with a counter if this label already exists
      let unique = label;
      let n = 1;
      while (headers.includes(unique)) {
        n++;
        unique = `${label} ${n}`;
      }
      headers.push(unique);
      colIndices.push(i);
    });

    // Build data rows from rows after the header row
    const rows = rawRows
      .slice(hdrIdx + 1)
      .filter((row) => (row as unknown[]).some((v) => v !== null && v !== undefined && v !== ''))
      .map((row) =>
        Object.fromEntries(
          headers.map((h, hi) => [h, clean((row as unknown[])[colIndices[hi]] ?? '')])
        )
      );

    return { headers, rows };
  }

  throw new Error('Unsupported file type. Please upload a .csv, .xlsx, or .xls file.');
}
