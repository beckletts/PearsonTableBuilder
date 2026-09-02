#!/usr/bin/env python3
"""Regenerate src/data/optionsGuide.ts from the Options Guide PDF.

Usage:  python3 scripts/extract-options-guide.py <options-guide.pdf>
Needs:  pip install pdfplumber

Run this when a new edition of the "Options Guide — Programme Builder" is
published. The course builder reads nothing but the generated module, so this is
the only step needed to move it onto a new edition.
"""
import sys
from pathlib import Path

# The PDF is an Excel export. All 11 pages share the same 12 column x-boundaries,
# but the guide merges the two right-hand prose columns across many rows, and
# inside some subject blocks the short columns are drawn with tighter line spacing
# than the row they belong to. Cropping bleeds text in from neighbouring cells, so
# every read here filters characters by their centre point and lets pdfplumber
# reconstruct the text from just those characters.
# 
#   1. One row band per qualification, from the left-hand region (always ruled).
#   2. Per-row columns are read as text lines. Where a column has exactly one line
#      per band they map in order (immune to the spacing mismatch); otherwise each
#      line maps to the nearest band and columns the guide merges down a block are
#      forward-filled.
#   3. The prose columns are read from their own cell rectangles, filtering
#      characters by centre point so no neighbouring cell bleeds in, and
#      replicating each merged block across every row band it covers.


import pdfplumber, re, json
from pdfplumber.utils import extract_text
from collections import Counter

PDF = sys.argv[1] if len(sys.argv) > 1 else sys.exit(__doc__)
VX = [50.9, 68.0, 106.0, 151.3, 181.6, 211.1, 392.7, 431.7, 472.7, 492.5, 512.3, 632.9, 731.3]
COLS = ['level', 'family', 'subject', 'glh', 'qn', 'title', 'programme_role',
        'learner_profile', 'status_2027', 'funded_2027', 'transition', 'consider']
INHERIT = {'level', 'family', 'subject', 'programme_role', 'learner_profile'}
LINE_GAP = 4.0   # pt between text baselines that starts a new line

def clean(s):
    s = re.sub(r'[​\xa0]', ' ', s or '')
    s = re.sub(r'[ \t]+', ' ', s)
    return '\n'.join(l.strip() for l in s.split('\n')).strip()

def inside(chars, x0, top, x1, bottom):
    return [c for c in chars
            if x0 <= (c['x0'] + c['x1']) / 2 <= x1 and top <= (c['top'] + c['bottom']) / 2 <= bottom]

def cell_text(chars, x0, top, x1, bottom):
    sel = inside(chars, x0, top, x1, bottom)
    return clean(extract_text(sel, layout=False)) if sel else ''

def cell_lines(chars, x0, top, x1, bottom):
    """Text lines in the rect, as (centre_y, text), clustered on the y gap."""
    sel = sorted(inside(chars, x0, top, x1, bottom), key=lambda c: (c['top'] + c['bottom']) / 2)
    groups, cur, last = [], [], None
    for c in sel:
        mid = (c['top'] + c['bottom']) / 2
        if last is not None and mid - last > LINE_GAP:
            groups.append(cur); cur = []
        cur.append(c); last = mid
    if cur:
        groups.append(cur)
    out = []
    for g in groups:
        txt = clean(extract_text(g, layout=False)).replace('\n', ' ')
        if txt:
            mids = [(c['top'] + c['bottom']) / 2 for c in g]
            out.append((sum(mids) / len(mids), txt))
    return out

def detile(text):
    """Collapse text that is the same block repeated back-to-back into one copy."""
    lines = text.split('\n')
    n = len(lines)
    for unit in range(1, n // 2 + 1):
        if n % unit == 0 and all(lines[i] == lines[i % unit] for i in range(n)):
            return '\n'.join(lines[:unit])
    return text

records = []
with pdfplumber.open(PDF) as pdf:
    for pageno, pg in enumerate(pdf.pages, start=1):
        chars = pg.chars

        # 1. one row band per qualification, from the left-hand region
        left = pg.crop((VX[0], 0, VX[6], pg.height), strict=False)
        ltabs = left.find_tables({'vertical_strategy': 'explicit',
                                  'explicit_vertical_lines': VX[:7],
                                  'horizontal_strategy': 'lines'})
        if not ltabs:
            continue
        ltab = max(ltabs, key=lambda t: len(t.rows))
        bands = [(r.bbox[1], r.bbox[3]) for r in ltab.rows]
        top, bottom = ltab.bbox[1], ltab.bbox[3]
        centres = [(a + b) / 2 for a, b in bands]

        grid = [{c: '' for c in COLS} for _ in bands]

        # 2. per-row columns
        for ci in range(10):
            col = COLS[ci]
            lines = pg.crop((VX[ci], top, VX[ci + 1], bottom), strict=False).extract_text_lines()
            if len(lines) == len(bands):
                for bi, ln in enumerate(lines):
                    grid[bi][col] = clean(ln['text'])
            else:
                for ln in lines:
                    y = (ln['top'] + ln['bottom']) / 2
                    bi = min(range(len(bands)), key=lambda i: abs(centres[i] - y))
                    txt = clean(ln['text'])
                    grid[bi][col] = (grid[bi][col] + ' ' + txt).strip() if grid[bi][col] else txt
                if col in INHERIT:
                    carry = ''
                    for row in grid:
                        if row[col]:
                            carry = row[col]
                        else:
                            row[col] = carry

        # 3. prose columns. A cell rect gives the band range a guidance block
        #    covers. Where the guide draws no separator between consecutive
        #    rows, one rect covers several of them — detected by the rect holding
        #    more than one value, or one value that every band repeats — and each
        #    band is then read on its own. Otherwise the block is genuinely
        #    merged and applies to every band it covers (de-tiled, since a
        #    borderless run can repeat the unit).
        right = pg.crop((VX[10], 0, VX[12], pg.height), strict=False)
        for rtab in right.find_tables({'vertical_strategy': 'explicit',
                                       'explicit_vertical_lines': VX[10:13],
                                       'horizontal_strategy': 'lines'}):
            for cell in rtab.cells:
                if cell is None:
                    continue
                cx0, ctop, cx1, cbottom = cell
                col = COLS[10] if abs(cx0 - VX[10]) < 2 else COLS[11]
                covered = [bi for bi, (btop, bbottom) in enumerate(bands)
                           if min(cbottom, bbottom) - max(ctop, btop) > (bbottom - btop) * 0.5]
                if not covered:
                    continue
                slices = [cell_text(chars, cx0, max(ctop, bands[bi][0]),
                                    cx1, min(cbottom, bands[bi][1])) for bi in covered]
                distinct = {s for s in slices if s}
                # More than one value in the rect, or one value that every band
                # repeats, means the rows carry their own copies: read per band.
                if len(distinct) > 1 or (len(distinct) == 1 and all(slices)):
                    for bi, val in zip(covered, slices):
                        if not grid[bi][col]:
                            grid[bi][col] = val
                    continue
                val = detile(cell_text(chars, cx0, ctop, cx1, cbottom))
                if not val:
                    continue
                for bi in covered:
                    if not grid[bi][col]:
                        grid[bi][col] = val

        for bi, row in enumerate(grid):
            row['page'] = pageno
            records.append(row)

records = [r for r in records if r['title'] and 'Qualification Title' not in r['title']]

# A merged prose block that runs over a page break leaves the page's last row
# blank; fill it from the row above when it continues the same subject block.
last_of_page = {}
for i, r in enumerate(records):
    last_of_page[r['page']] = i
for _, i in sorted(last_of_page.items()):
    if i and records[i - 1]['subject'] == records[i]['subject']:
        for col in ('transition', 'consider'):
            if not records[i][col]:
                records[i][col] = records[i - 1][col]



import json, re, textwrap
recs = records

STATUS = {'✔': 'available', 'x': 'withdrawn', 'NEW': 'new'}
FUNDED = {'✔': 'funded', 'x': 'not-funded', 'TBA': 'tba'}
ENTRY_START = re.compile(r'^(T Level|V Level|A Level|Pearson|GCSE)\b')
# The guide wraps long names mid-word after a hyphen ("Three-\ndimensional").
DEHYPHEN = re.compile(r'-\s+(?=[a-z])')

def unwrap(text):
    return DEHYPHEN.sub('-', re.sub(r'\s+', ' ', text.replace('\n', ' '))).strip()

def glh_value(glh):
    if not glh or glh.upper() in ('TBA', 'TBC'):
        return None
    if '-' in glh:
        lo, hi = glh.split('-', 1)
        return round((int(lo) + int(hi)) / 2)
    return int(glh) if glh.isdigit() else None

def consider_entries(text):
    """Rejoin the guide's wrapped lines into one entry per qualification."""
    out = []
    for line in [l.strip() for l in text.split('\n') if l.strip()]:
        if out and not ENTRY_START.match(line):
            out[-1] = f'{out[-1]} {line}'
        else:
            out.append(line)
    return [unwrap(e) for e in out]

def unwrap_lines(lines):
    """Rejoin lines the guide wrapped mid-sentence, keeping its real line breaks.

    A line continues the one above it when it starts lower-case and the line
    above was cut mid-sentence (no closing . : or ,), or when the line above
    left a bracket open ("...(Coming" / "Sept 2027)").
    """
    out = []
    for line in lines:
        prev = out[-1] if out else ''
        open_bracket = prev.count('(') > prev.count(')')
        continues = prev and (
            open_bracket
            or (line[:1].islower() and prev[-1] not in '.:,')
        )
        if continues:
            out[-1] = f'{prev} {line}'
        else:
            out.append(line)
    return out


def reform_year(text):
    m = re.search(r'Reform qualifications(?: in development)? for first teach (\d{4})', text)
    return int(m.group(1)) if m else None

def action(text):
    if not text or text.strip('?') == '':
        return 'none'
    if text.startswith('N/A'):
        return 'none'
    if text.startswith('Continue to teach'):
        return 'continue'
    if text.startswith('Reform qualifications'):
        return 'replace'
    return 'none'

quals = []
for i, r in enumerate(recs):
    quals.append({
        'id': f'q{i + 1:03d}',
        'qn': r['qn'],
        'title': unwrap(r['title']),
        'level': r['level'],
        'family': r['family'],
        'subject': r['subject'],
        'glh': r['glh'],
        'glhValue': glh_value(r['glh']),
        'programmeRole': r['programme_role'],
        'learnerProfile': r['learner_profile'],
        'status2027': STATUS[r['status_2027']],
        'funded2027': FUNDED[r['funded_2027']],
        'action': action(r['transition']),
        'reformYear': reform_year(r['transition']),
        'transition': unwrap_lines([l.strip() for l in r['transition'].split('\n') if l.strip()]),
        'consider': consider_entries(r['consider']),
    })

# Guidance prose repeats heavily across rows — hold one copy of each and let the
# rows point at it, so the shipped module stays small.
def key(v): return json.dumps(v, ensure_ascii=False)
trans_list, trans_ix = [], {}
cons_list, cons_ix = [], {}
for q in quals:
    for val, lst, ix, field in ((q['transition'], trans_list, trans_ix, 'transition'),
                                (q['consider'], cons_list, cons_ix, 'consider')):
        k = key(val)
        if k not in ix:
            ix[k] = len(lst); lst.append(val)
        q[field + 'Ix'] = ix[k]

def ts_arr(rows, indent='  '):
    return '\n'.join(f'{indent}{json.dumps(r, ensure_ascii=False)},' for r in rows)


# ── Emit the TypeScript module ───────────────────────────────────────────────
for q in quals:
    if q['transition'] == ['??']:
        q['action'] = 'unconfirmed'

def js(v):
    return json.dumps(v, ensure_ascii=False)

rows = []
for q in quals:
    rows.append(
        '  { id: %s, qn: %s, level: %s, family: %s, subject: %s, glh: %s, glhValue: %s,'
        ' programmeRole: %s, learnerProfile: %s, status2027: %s, funded2027: %s,'
        ' action: %s, reformYear: %s, t: %d, c: %d,\n    title: %s },' % (
            js(q['id']), js(q['qn']), js(q['level']), js(q['family']), js(q['subject']),
            js(q['glh']), 'null' if q['glhValue'] is None else q['glhValue'],
            js(q['programmeRole']), js(q['learnerProfile']), js(q['status2027']),
            js(q['funded2027']), js(q['action']),
            'null' if q['reformYear'] is None else q['reformYear'],
            q['transitionIx'], q['considerIx'], js(q['title'])))

header = '''/**
 * The Pearson post-16 Options Guide, as a typed dataset.
 *
 * Every row here comes from the "Options Guide — Programme Builder" PDF: 287
 * qualifications across 17 subject areas, with the guide's own wording for
 * transition guidance and the qualifications it suggests considering.
 *
 * This file is generated. To refresh it for a new edition of the guide, re-run
 * the extraction against the new PDF rather than editing rows by hand — the
 * course builder reads nothing else, so this module is the single source of
 * truth for what teachers see.
 */

/** Post-16 level the qualification sits at. */
export type Level = 'Level 2' | 'Level 3';

/** Qualification family, as the guide groups them. */
export type QualFamily =
  | 'BTEC' | 'T Level' | 'A Level' | 'V Level'
  | 'NVQ' | 'Foundation Certificate' | 'Occupational Certificate';

/** Whether the qualification is a programme on its own or one part of one. */
export type ProgrammeRole = 'Full programme' | 'Part of a study programme';

/** Status for first teach 2027: still available, being withdrawn, or brand new. */
export type TeachStatus = 'available' | 'withdrawn' | 'new';

/** Funding position for first teach 2027. */
export type FundingStatus = 'funded' | 'not-funded' | 'tba';

/**
 * What the guide asks a centre to do:
 *  - `continue`    keep teaching it; reform lands in a later year
 *  - `replace`     move to a different qualification for the reform year
 *  - `none`        nothing to do (a new qualification, or marked N/A)
 *  - `unconfirmed` the guide has not yet published a route for this one
 */
export type GuideAction = 'continue' | 'replace' | 'none' | 'unconfirmed';

export interface Qualification {
  /** Stable id used by saved course plans. */
  id: string;
  /** Ofqual qualification number, or TBA/TBC for one still in development. */
  qn: string;
  title: string;
  level: Level;
  family: QualFamily;
  subject: string;
  /** Guided learning hours exactly as printed — may be a range or 'TBA'. */
  glh: string;
  /** GLH as a number for totalling; the midpoint of a range, null when unknown. */
  glhValue: number | null;
  programmeRole: ProgrammeRole;
  learnerProfile: string;
  status2027: TeachStatus;
  funded2027: FundingStatus;
  action: GuideAction;
  /** First teach year the reform lands, where the guide gives one. */
  reformYear: number | null;
  /** The guide's transition wording, one entry per line. */
  transition: string[];
  /** Qualifications the guide suggests considering instead. */
  consider: string[];
}

/**
 * The guidance prose repeats across many rows, so each distinct block is stored
 * once and rows reference it by index.
 */
const TRANSITIONS: string[][] = [
%s
];

const CONSIDER: string[][] = [
%s
];

/** A row as stored: `t` and `c` index TRANSITIONS and CONSIDER. */
type Row = Omit<Qualification, 'transition' | 'consider'> & { t: number; c: number };

const ROWS: Row[] = [
%s
];

/** Every qualification in the guide, in the order the guide lists them. */
export const QUALIFICATIONS: Qualification[] = ROWS.map(({ t, c, ...row }) => ({
  ...row,
  transition: TRANSITIONS[t],
  consider: CONSIDER[c],
}));

const byId = new Map(QUALIFICATIONS.map((q) => [q.id, q]));
const byQn = new Map(QUALIFICATIONS.filter((q) => /^\\d/.test(q.qn)).map((q) => [q.qn, q]));

/**
 * Look a qualification up for a saved plan item. Ids are stable, but we fall
 * back to the QN and then the title so plans keep working if a future edition of
 * the guide renumbers its rows.
 */
export function findQualification(ref: { id?: string; qn?: string; title?: string }): Qualification | undefined {
  if (ref.id && byId.has(ref.id)) return byId.get(ref.id);
  if (ref.qn && byQn.has(ref.qn)) return byQn.get(ref.qn);
  if (ref.title) return QUALIFICATIONS.find((q) => q.title === ref.title);
  return undefined;
}

/** Subject areas, alphabetical. */
export const SUBJECTS: string[] = [...new Set(QUALIFICATIONS.map((q) => q.subject))].sort();

/** Qualification families present in the guide, alphabetical. */
export const FAMILIES: QualFamily[] = [...new Set(QUALIFICATIONS.map((q) => q.family))].sort();

/** Levels present in the guide. */
export const LEVELS: Level[] = ['Level 2', 'Level 3'];

/** Reform years the guide names, earliest first. */
export const REFORM_YEARS: number[] = [
  ...new Set(QUALIFICATIONS.map((q) => q.reformYear).filter((y): y is number => y !== null)),
].sort((a, b) => a - b);
''' % (
    '\n'.join('  %s,' % js(t) for t in trans_list),
    '\n'.join('  %s,' % js(c) for c in cons_list),
    '\n'.join(rows),
)

OUT = Path(__file__).resolve().parent.parent / 'src' / 'data' / 'optionsGuide.ts'
OUT.write_text(header)
print(f'wrote {len(quals)} qualifications to {OUT}')
