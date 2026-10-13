// A cell can hold several alternatives rather than one value — "this
// qualification OR that one" — written as separate lines in the source
// spreadsheet. Keeping those lines apart is the difference between a readable
// list of options and one long run-on sentence.

/** Words that separate alternatives rather than naming one. */
const SEPARATORS = new Set(['or', 'and', 'and/or', 'or:', '/', '&']);

/** The lines of a cell value: trimmed, with blank lines dropped. */
export function cellLines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Whether a line is a separator between options, e.g. a lone "OR". */
export function isOptionSeparator(line: string): boolean {
  return SEPARATORS.has(line.toLowerCase().replace(/[.,;]$/, ''));
}

/** Whether a value holds more than one line worth showing. */
export function hasMultipleLines(value: string): boolean {
  return value.includes('\n') && cellLines(value).length > 1;
}
