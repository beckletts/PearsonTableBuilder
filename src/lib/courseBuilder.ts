/**
 * Course builder: the saved-plan shape, and the reading of the Options Guide
 * that turns a set of chosen qualifications into plain advice.
 *
 * Kept separate from the table builder — a course plan shares no storage or
 * types with tables or linked dashboards.
 */
import {
  QUALIFICATIONS,
  findQualification,
  type Level,
  type Qualification,
} from '../data/optionsGuide';

/** The year a plan is being built for. The guide is written around 2027. */
export const DEFAULT_FIRST_TEACH_YEAR = 2027;

/** One qualification chosen for a plan. */
export interface CoursePlanItem {
  /** Qualification id from the guide. */
  id: string;
  /** Stored alongside the id so a plan survives a future re-numbering. */
  qn: string;
  title: string;
  /** The teacher's own note — why this sits in the programme. */
  note?: string;
}

export interface CoursePlanConfig {
  /** Subject area the plan is focused on, when the teacher picked one. */
  subject?: string;
  /** Level the plan is aimed at, when the teacher picked one. */
  level?: Level;
  /** First teach year the plan is being built for. */
  firstTeachYear: number;
  items: CoursePlanItem[];
  /** Free notes for the whole plan. */
  notes?: string;
  /**
   * Whether the author's notes appear on the shared page. Off by default —
   * planning notes are usually internal, so publishing must be deliberate.
   */
  shareNotes?: boolean;
}

export interface CoursePlan {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  /** Public link segment: /cp/<slug> once published. */
  slug: string;
  config: CoursePlanConfig;
  is_published: boolean;
  created_at: string;
  updated_at: string;
  /** Set when the plan reached us through a share rather than ownership. */
  _accessLevel?: CoursePlanAccess;
}

export type CoursePlanAccess = 'view' | 'edit';

export interface CoursePlanShare {
  id: string;
  plan_id: string;
  owner_id: string;
  collaborator_email: string;
  access_level: CoursePlanAccess;
  created_at: string;
}

export function emptyConfig(subject?: string, level?: Level): CoursePlanConfig {
  return { subject, level, firstTeachYear: DEFAULT_FIRST_TEACH_YEAR, items: [] };
}

/** Tolerate a plan saved before a field existed, or with a malformed config. */
export function normaliseConfig(config: unknown): CoursePlanConfig {
  const c = (config ?? {}) as Partial<CoursePlanConfig>;
  return {
    subject: c.subject,
    level: c.level,
    firstTeachYear: typeof c.firstTeachYear === 'number' ? c.firstTeachYear : DEFAULT_FIRST_TEACH_YEAR,
    items: Array.isArray(c.items) ? c.items : [],
    notes: c.notes,
    shareNotes: c.shareNotes ?? false,
  };
}

// ── Filtering the guide ──────────────────────────────────────────────────────

export interface GuideFilters {
  search: string;
  subject: string;
  level: string;
  family: string;
  /** 'available' | 'withdrawn' | 'new', or '' for any. */
  status: string;
  /** Only qualifications funded for first teach 2027. */
  fundedOnly: boolean;
}

export const emptyFilters: GuideFilters = {
  search: '', subject: '', level: '', family: '', status: '', fundedOnly: false,
};

export function filterQualifications(filters: GuideFilters): Qualification[] {
  const needle = filters.search.trim().toLowerCase();
  return QUALIFICATIONS.filter((q) => {
    if (filters.subject && q.subject !== filters.subject) return false;
    if (filters.level && q.level !== filters.level) return false;
    if (filters.family && q.family !== filters.family) return false;
    if (filters.status && q.status2027 !== filters.status) return false;
    if (filters.fundedOnly && q.funded2027 !== 'funded') return false;
    if (needle) {
      const haystack = `${q.title} ${q.qn} ${q.subject} ${q.family}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
}

// ── Reading the guide back to the teacher ────────────────────────────────────

/** Plain-English labels for the guide's status and funding columns. */
export const STATUS_LABEL = {
  available: 'Available for 2027',
  withdrawn: 'Being withdrawn',
  new: 'New qualification',
} as const;

export const FUNDING_LABEL = {
  funded: 'Funded for 2027',
  'not-funded': 'Not funded for 2027',
  tba: 'Funding to be confirmed',
} as const;

export const ACTION_LABEL = {
  continue: 'Keep teaching for now',
  replace: 'Plan a replacement',
  none: 'No action needed',
  unconfirmed: 'Guidance still to come',
} as const;

/**
 * The GLH range that full programmes in the guide actually occupy at a level.
 * Used to tell a teacher how their combination of smaller qualifications
 * compares, rather than checking it against an invented target.
 */
export function fullProgrammeGlhRange(level: Level): { min: number; max: number } | null {
  const sizes = QUALIFICATIONS
    .filter((q) => q.level === level && q.programmeRole === 'Full programme' && q.glhValue !== null)
    .map((q) => q.glhValue as number);
  if (sizes.length === 0) return null;
  return { min: Math.min(...sizes), max: Math.max(...sizes) };
}

export type CheckTone = 'ok' | 'watch' | 'risk';

export interface PlanCheck {
  tone: CheckTone;
  title: string;
  detail: string;
  /** Qualifications the check is about, so the UI can point at them. */
  quals?: Qualification[];
}

export interface PlanAnalysis {
  /** Chosen qualifications, resolved against the guide. */
  quals: Qualification[];
  /** Plan items whose qualification is no longer in the guide. */
  missing: CoursePlanItem[];
  totalGlh: number;
  /** Items with no GLH figure published, so absent from the total. */
  unknownGlhCount: number;
  fullProgrammes: Qualification[];
  withdrawn: Qualification[];
  notFunded: Qualification[];
  fundingTba: Qualification[];
  /** The earliest first-teach year a reform affects this plan. */
  earliestReformYear: number | null;
  /** What the guide suggests considering, for the at-risk choices in the plan. */
  suggestions: string[];
  checks: PlanCheck[];
}

/** GLH as a short label — a handful of qualifications have no figure yet. */
export function glhLabel(qual: Qualification): string {
  return qual.glhValue === null ? 'GLH to be published' : `${qual.glh} GLH`;
}

function list(quals: Qualification[], max = 3): string {
  const titles = quals.slice(0, max).map((q) => q.title);
  const rest = quals.length - titles.length;
  return rest > 0 ? `${titles.join(', ')} and ${rest} more` : titles.join(', ');
}

/**
 * Turn a plan into the handful of things a teacher needs to know: how big it is,
 * what is at risk, and when the reform lands.
 */
export function analysePlan(config: CoursePlanConfig): PlanAnalysis {
  const quals: Qualification[] = [];
  const missing: CoursePlanItem[] = [];
  for (const item of config.items) {
    const q = findQualification(item);
    if (q) quals.push(q);
    else missing.push(item);
  }

  const totalGlh = quals.reduce((sum, q) => sum + (q.glhValue ?? 0), 0);
  const unknownGlhCount = quals.filter((q) => q.glhValue === null).length;
  const fullProgrammes = quals.filter((q) => q.programmeRole === 'Full programme');
  const withdrawn = quals.filter((q) => q.status2027 === 'withdrawn');
  const notFunded = quals.filter((q) => q.funded2027 === 'not-funded');
  const fundingTba = quals.filter((q) => q.funded2027 === 'tba');
  const reformYears = quals.map((q) => q.reformYear).filter((y): y is number => y !== null);
  const earliestReformYear = reformYears.length ? Math.min(...reformYears) : null;

  const atRisk = [...new Set([...withdrawn, ...notFunded])];
  const suggestions = [...new Set(atRisk.flatMap((q) => q.consider))];

  const checks: PlanCheck[] = [];

  if (missing.length) {
    checks.push({
      tone: 'watch',
      title: 'Some choices are no longer in the guide',
      detail: `${missing.length} saved ${missing.length === 1 ? 'choice is' : 'choices are'} not in the current edition: ${missing.map((m) => m.title).join(', ')}. Remove them or pick a current equivalent.`,
    });
  }

  if (notFunded.length) {
    checks.push({
      tone: 'risk',
      title: `Not funded for first teach ${config.firstTeachYear}`,
      // Worded to read the same on the workspace and on the shared page.
      detail: `${list(notFunded)} ${notFunded.length === 1 ? 'has' : 'have'} no funding for ${config.firstTeachYear}. Check the transition route the guide gives for ${notFunded.length === 1 ? 'it' : 'them'}.`,
      quals: notFunded,
    });
  }

  const withdrawnOnly = withdrawn.filter((q) => !notFunded.includes(q));
  if (withdrawnOnly.length) {
    checks.push({
      tone: 'risk',
      title: `Being withdrawn for first teach ${config.firstTeachYear}`,
      detail: `${list(withdrawnOnly)} ${withdrawnOnly.length === 1 ? 'is' : 'are'} not available to start in ${config.firstTeachYear}.`,
      quals: withdrawnOnly,
    });
  }

  if (fundingTba.length) {
    checks.push({
      tone: 'watch',
      title: 'Funding still to be confirmed',
      detail: `${list(fundingTba)} ${fundingTba.length === 1 ? 'is a new qualification whose' : 'are new qualifications whose'} funding the guide has not confirmed yet. Sound, but confirm before you commit.`,
      quals: fundingTba,
    });
  }

  if (earliestReformYear !== null) {
    const affected = quals.filter((q) => q.reformYear === earliestReformYear);
    checks.push({
      tone: earliestReformYear <= config.firstTeachYear ? 'risk' : 'watch',
      title: `First reform lands for first teach ${earliestReformYear}`,
      detail: `${list(affected)} ${affected.length === 1 ? 'is' : 'are'} reformed for first teach ${earliestReformYear}. A two-year programme starting in ${config.firstTeachYear} finishes in ${config.firstTeachYear + 2}, so plan the replacement before then.`,
      quals: affected,
    });
  }

  // Size. The guide splits qualifications into a full programme on its own, or
  // parts to be combined — so check the plan against whichever it is.
  if (quals.length === 0) {
    // Only prompt when the plan is genuinely empty — a plan holding nothing but
    // stale choices already has the check above telling it so.
    if (missing.length === 0) {
      checks.push({
        tone: 'watch',
        title: 'Nothing chosen yet',
        detail: 'Add qualifications from the guide to start building the programme.',
      });
    }
  } else if (fullProgrammes.length > 1) {
    checks.push({
      tone: 'watch',
      title: 'More than one full programme',
      detail: `${list(fullProgrammes)} are each a full programme on their own. A learner would normally take one of them, not several.`,
      quals: fullProgrammes,
    });
  } else if (fullProgrammes.length === 1) {
    const spine = fullProgrammes[0];
    const extras = quals.length - 1;
    // Don't call the shape sound when the programme it rests on is itself going.
    const spineAtRisk = atRisk.includes(spine);
    checks.push({
      tone: spineAtRisk ? 'watch' : 'ok',
      title: spineAtRisk ? 'Built around a programme that is changing' : 'Built around a full programme',
      detail: `${spine.title} is a full programme on its own${extras === 0 ? ` — ${glhLabel(spine)}` : `, and the other ${extras === 1 ? 'choice sits' : `${extras} choices sit`} alongside it, taking the plan to ${totalGlh} GLH`}.${spineAtRisk ? ' It is the part of this plan that needs replacing first.' : ''}`,
    });
  } else {
    const level = config.level ?? quals[0].level;
    const range = fullProgrammeGlhRange(level);
    // Some GLH figures are not published yet, so say so rather than letting the
    // total quietly under-report.
    const caveat = unknownGlhCount > 0
      ? ` ${unknownGlhCount} of them ${unknownGlhCount === 1 ? 'has no' : 'have no'} published GLH, so the real total is higher.`
      : '';
    if (range) {
      const short = totalGlh < range.min;
      checks.push({
        tone: short && unknownGlhCount === 0 ? 'watch' : 'ok',
        title: short ? `Smaller than a full ${level} programme` : `Comparable to a full ${level} programme`,
        detail: `Every choice here is meant to be part of a study programme. They total ${totalGlh} GLH, against ${range.min}–${range.max} GLH for the full programmes at ${level} in the guide.${caveat}`,
      });
    } else {
      checks.push({
        tone: 'ok',
        title: `${totalGlh} GLH across ${quals.length} ${quals.length === 1 ? 'qualification' : 'qualifications'}`,
        detail: `Every choice here is meant to be part of a study programme. The guide lists no single full programme at ${level}, so build the programme from these and check the total against your timetable.${caveat}`,
      });
    }
  }

  const subjects = [...new Set(quals.map((q) => q.subject))];
  if (subjects.length > 1) {
    checks.push({
      tone: 'watch',
      title: 'Spans more than one subject area',
      detail: `This plan mixes ${subjects.join(', ')}. That is fine for a mixed programme — worth a check that it is deliberate.`,
    });
  }

  return {
    quals, missing, totalGlh, unknownGlhCount, fullProgrammes,
    withdrawn, notFunded, fundingTba, earliestReformYear, suggestions, checks,
  };
}

/** Rows for the Excel export, in the order a colleague would want to read them. */
export function planExportRows(config: CoursePlanConfig, analysis: PlanAnalysis) {
  return analysis.quals.map((q) => {
    const item = config.items.find((i) => i.id === q.id);
    return {
      'Qualification title': q.title,
      QN: q.qn,
      Level: q.level,
      Family: q.family,
      Subject: q.subject,
      GLH: q.glh,
      'Programme role': q.programmeRole,
      'Learner profile': q.learnerProfile,
      'Status for first teach 2027': STATUS_LABEL[q.status2027],
      'Funded for first teach 2027': FUNDING_LABEL[q.funded2027],
      'Reform first teach year': q.reformYear ?? '',
      'Transition information': q.transition.join(' '),
      'Qualifications to consider': q.consider.join('; '),
      'Your note': item?.note ?? '',
    };
  });
}
