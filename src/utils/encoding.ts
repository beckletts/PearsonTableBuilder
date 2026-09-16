// Text encoding for uploaded files.
//
// Spreadsheets exported from Excel on Windows are usually saved as Windows-1252
// (also called CP1252), not UTF-8. Read as UTF-8 those bytes are invalid, and
// the browser silently turns each one into the replacement character '�' — so
// "Türkiye" arrives as "T�rkiye" and the accented character is gone before
// anyone can do anything about it. Detecting the encoding on the way in keeps
// the original characters.

// The 32 characters Windows-1252 puts in 0x80–0x9F, where ISO-8859-1 has
// control codes. Curly quotes, dashes and the euro sign live here, which is why
// they are the ones that usually break.
const CP1252_HIGH = [
  '€', '', '‚', 'ƒ', '„', '…', '†', '‡',
  'ˆ', '‰', 'Š', '‹', 'Œ', '', 'Ž', '',
  '', '‘', '’', '“', '”', '•', '–', '—',
  '˜', '™', 'š', '›', 'œ', '', 'ž', 'Ÿ',
];

/**
 * Decode an uploaded file's bytes to text.
 *
 * UTF-8 is tried first and used whenever the bytes are valid UTF-8, so nothing
 * changes for the files that were already correct. Anything else is read as
 * Windows-1252, which is what Excel writes.
 */
export function decodeText(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);

  // A UTF-8 byte-order mark settles it: this is UTF-8, and the mark itself is
  // dropped so it can't end up inside the first column's name.
  const hasBom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const body = hasBom ? bytes.subarray(3) : bytes;

  if (!hasBom) {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(body);
    } catch {
      return new TextDecoder('windows-1252').decode(body);
    }
  }

  return new TextDecoder('utf-8').decode(body);
}

/** Read a File as text, honouring the encoding its bytes are actually in. */
export async function readFileAsText(file: File): Promise<string> {
  return decodeText(await file.arrayBuffer());
}

// Reverse of CP1252_HIGH: the byte each of those characters came from.
const CP1252_BYTES = new Map(CP1252_HIGH.map((ch, i) => [ch, 0x80 + i]));

function toCp1252Byte(ch: string): number | undefined {
  const byte = CP1252_BYTES.get(ch);
  if (byte !== undefined) return byte;
  const code = ch.codePointAt(0) ?? 0;
  return code <= 0xff ? code : undefined;
}

/**
 * Undo double-encoded text — UTF-8 bytes that were read as Windows-1252
 * somewhere upstream, so "Türkiye" reads as "TÃ¼rkiye" and an apostrophe reads
 * as "â€™".
 *
 * The text is turned back into the bytes it came from and re-read as UTF-8. If
 * those bytes aren't valid UTF-8 the original string is returned untouched,
 * so this can never make a value worse.
 *
 * It cannot help with '�': there the original byte was discarded at read time
 * and nothing remains to decode.
 */
export function repairMojibake(text: string): string {
  if (!/[ÃÂâ€]/.test(text)) return text;

  const bytes = new Uint8Array(text.length);
  let i = 0;
  for (const ch of text) {
    const byte = toCp1252Byte(ch);
    if (byte === undefined) return text;  // not something 1252 could have produced
    bytes[i++] = byte;
  }

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, i));
  } catch {
    return text;
  }
}

// A character lost before the file reached us shows up one of two ways: as the
// replacement character, or as a bare '?' mid-word where Excel substituted a
// character its encoding couldn't hold (so "Bahçeşehir" saves as "Bahçe?ehir").
const LOST_CHARACTER = /�|\p{L}\?\p{L}/u;

/** Whether text contains a character that was lost before it was uploaded. */
export function hasLostCharacters(text: string): boolean {
  return LOST_CHARACTER.test(text);
}

/**
 * Find values whose characters were lost before upload. Nothing here can
 * restore them — only re-exporting the source file as UTF-8 can — so the point
 * is to say so while the data can still be re-exported.
 */
export function findUnreadableValues(rows: Record<string, string>[]): { count: number; examples: string[] } {
  const examples = new Set<string>();
  let count = 0;

  for (const row of rows) {
    for (const value of Object.values(row)) {
      if (!hasLostCharacters(value)) continue;
      count++;
      if (examples.size < 3) examples.add(value);
    }
  }

  return { count, examples: [...examples] };
}
