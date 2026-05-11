import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import type { ParsedFile } from '../lib/types';

// Strip zero-width spaces (U+200B) and trim — Excel exports often embed these
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
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
    const headers = json.length > 0 ? Object.keys(json[0]) : [];
    const rows = json.map((row) =>
      Object.fromEntries(Object.entries(row).map(([k, v]) => [k, clean(v)])),
    );
    return { headers, rows };
  }

  throw new Error('Unsupported file type. Please upload a .csv, .xlsx, or .xls file.');
}
