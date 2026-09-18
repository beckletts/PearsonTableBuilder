import type { ColumnConfig, TableConfig } from '../lib/types';

// Badge columns are colour-coded so a viewer can tell at a glance which column
// a pill belongs to — useful for a wide table of yes/no columns, unwanted when
// every column means the same thing. Table owners can override it: one colour
// for every badge column (TableConfig.badgeColor), or a colour per column
// (ColumnConfig.badgeColor). With neither set, this palette is used in column
// order, which is the long-standing behaviour.
export const BADGE_PALETTE: BadgeStyle[] = [
  { backgroundColor: '#5B2D86', color: '#fff' },
  { backgroundColor: '#D4C5E8', color: '#5B2D86' },
  { backgroundColor: '#E8F0FF', color: '#1A4D8F' },
  { backgroundColor: '#F5F5F5', color: '#0D004D', border: '1px solid #D0D0D0' },
  { backgroundColor: '#E8F5F5', color: '#1A7373' },
  { backgroundColor: '#FFF9F0', color: '#C25100' },
];

/** The colour offered first when someone switches to a single badge colour. */
export const DEFAULT_SINGLE_BADGE_COLOR = '#5B2D86';

export interface BadgeStyle {
  backgroundColor: string;
  color: string;
  border?: string;
}

// ── Contrast ─────────────────────────────────────────────────────────────────

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

// WCAG relative luminance
function luminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * Black or white text for a chosen background — whichever reads better.
 * Keeps a custom badge colour accessible without asking anyone to pick two
 * colours and check them against each other.
 */
export function readableTextColor(background: string): string {
  const rgb = parseHex(background);
  if (!rgb) return '#1A1A1A';
  const bg = luminance(rgb);
  return contrast(bg, luminance([255, 255, 255])) >= contrast(bg, luminance([26, 26, 26]))
    ? '#FFFFFF'
    : '#1A1A1A';
}

/** Turn a single chosen colour into a full badge style. */
export function badgeStyleFromColor(background: string): BadgeStyle {
  const rgb = parseHex(background);
  const style: BadgeStyle = { backgroundColor: background, color: readableTextColor(background) };
  // A very pale pill needs a hairline outline to read as a pill at all.
  if (rgb && luminance(rgb) > 0.8) style.border = '1px solid #D0D0D0';
  return style;
}

// ── Resolution ───────────────────────────────────────────────────────────────

/**
 * The style for one badge column: its own colour if it has one, else the
 * table's single colour, else its slot in the automatic palette.
 *
 * `badgeColumnKeys` is the visible badge columns in display order — the palette
 * follows that order so colours stay stable as a viewer sorts and filters.
 */
export function resolveBadgeStyle(
  column: Pick<ColumnConfig, 'key' | 'badgeColor'>,
  config: Pick<TableConfig, 'badgeColor'>,
  badgeColumnKeys: string[],
): BadgeStyle {
  const chosen = column.badgeColor ?? config.badgeColor;
  if (chosen) return badgeStyleFromColor(chosen);

  const idx = badgeColumnKeys.indexOf(column.key);
  return BADGE_PALETTE[(idx < 0 ? 0 : idx) % BADGE_PALETTE.length];
}

/**
 * Whether the badge guide still tells a viewer anything.
 *
 * It exists to map a colour to a column, so several badge columns sharing one
 * colour makes it a list of identical swatches. A table with a single badge
 * column keeps its guide, as it always has.
 */
export function badgeLegendIsRedundant(
  columns: Pick<ColumnConfig, 'key' | 'badgeColor'>[],
  config: Pick<TableConfig, 'badgeColor'>,
): boolean {
  if (columns.length < 2) return false;
  const keys = columns.map((c) => c.key);
  const backgrounds = new Set(
    columns.map((c) => resolveBadgeStyle(c, config, keys).backgroundColor.toLowerCase()),
  );
  return backgrounds.size === 1;
}
