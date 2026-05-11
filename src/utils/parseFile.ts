import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import type { ParsedFile } from '../lib/types';

// Strip zero-width spaces and trim — Excel exports often embed U+200B
function clean(val: unknown): string {
  return String(val ?? '').replace(/​/g, '').trim();
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
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[sheetName ?? wb.SheetNames[0]];
    if (!ws) throw new Error(`Sheet "${sheetName}" not found in workbook.`);

    // Parse as raw arrays so we can detect multi-row header layouts.
    // Some Excel files have a layout/category row 1 (mostly empty) and the
    // real column headers in row 2. We detect this and use row 2 instead.
    const rawRows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });

    let headerRowIdx = 0;
    for (let i = 0; i < Math.min(rawRows.length, 5); i++) {
      const row = rawRows[i] as unknown[];
      const nonEmpty = row.filter((c) => clean(c) !== '').length;
      if (row.length > 0 && nonEmpty / row.length > 0.5) {
        headerRowIdx = i;
        break;
      }
    }

    const headers = (rawRows[headerRowIdx] as unknown[]).map(clean);
    const rows = rawRows
      .slice(headerRowIdx + 1)
      .filter((row) => (row as unknown[]).some((c) => clean(c) !== ''))
      .map((row) => {
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => { obj[h] = clean((row as unknown[])[i]); });
        return obj;
      });

    return { headers, rows };
  }

  throw new Error('Unsupported file type. Please upload a .csv, .xlsx, or .xls file.');
}
