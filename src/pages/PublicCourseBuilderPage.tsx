/**
 * The public face of a published course builder, at /cb/<slug>.
 *
 * This is the shared link and what an embed renders — a working tool, not a
 * snapshot. A visitor browses the Options Guide, assembles a programme, reads
 * the guide's advice on their own choices, and downloads the result.
 *
 * Nothing a visitor does is written to the database. Their selection is held in
 * their own browser, so two people using the same link never see each other's
 * work and the owner's builder is never altered from the public page.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { trackEvent } from '../lib/analytics';
import type { Qualification } from '../data/optionsGuide';
import {
  analysePlan, emptyFilters, normaliseConfig,
  type CoursePlan, type CoursePlanConfig, type CoursePlanItem, type GuideFilters,
} from '../lib/courseBuilder';
import { downloadPlanWorkbook } from '../lib/coursePlanDownload';
import QualificationBrowser from '../components/course/QualificationBrowser';
import QualificationDetail from '../components/course/QualificationDetail';
import PlanPanel from '../components/course/PlanPanel';
import PearsonLogo from '../components/layout/PearsonLogo';
import './CoursePage.css';

/** Where a visitor's own working copy lives, per builder. */
const storageKey = (slug: string) => `ptb_course_builder_${slug}`;

interface Draft {
  items: CoursePlanItem[];
  notes?: string;
}

function readDraft(slug: string): Draft | null {
  try {
    const raw = localStorage.getItem(storageKey(slug));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Draft;
    return Array.isArray(parsed.items) ? parsed : null;
  } catch {
    // A private window or blocked storage is fine — the builder still works,
    // it just will not remember anything.
    return null;
  }
}

export default function PublicCourseBuilderPage() {
  const { slug } = useParams<{ slug: string }>();

  const [plan, setPlan] = useState<CoursePlan | null>(null);
  const [ownerConfig, setOwnerConfig] = useState<CoursePlanConfig | null>(null);
  const [draft, setDraft] = useState<Draft>({ items: [] });
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [filters, setFilters] = useState<GuideFilters>(emptyFilters);
  const [open, setOpen] = useState<Qualification | null>(null);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const { data } = await supabase.from('course_plans').select('*').eq('slug', slug).maybeSingle();
      if (cancelled) return;
      // An unpublished builder is invisible to the public policy, so a miss
      // covers both "no such builder" and "not published".
      if (!data || !(data as CoursePlan).is_published) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      const record = data as CoursePlan;
      const config = normaliseConfig(record.config);
      const saved = readDraft(slug);

      setPlan(record);
      setOwnerConfig(config);
      setRestored(saved !== null);
      setDraft(saved ?? {
        // A builder can open blank, or pre-loaded with the owner's own
        // selection as a starting point.
        items: config.startFrom === 'owner' ? config.items : [],
      });
      setFilters({
        ...emptyFilters,
        subject: config.subject ?? '',
        level: config.level ?? '',
      });
      setLoading(false);
      trackEvent({ coursePlanId: record.id, eventType: 'page_view' });
    })();
    return () => { cancelled = true; };
  }, [slug]);

  // Persist the visitor's working copy as they go.
  useEffect(() => {
    if (!slug || !plan) return;
    try {
      localStorage.setItem(storageKey(slug), JSON.stringify(draft));
    } catch {
      // Storage unavailable — carry on without remembering.
    }
  }, [slug, plan, draft]);

  // Interactions are sampled once per distinct search term / filter rather than
  // on every keystroke, so Analytics stays readable.
  const seen = useRef(new Set<string>());
  const note = (eventType: 'search' | 'filter' | 'button_click', eventData: Record<string, string>) => {
    if (!plan) return;
    const key = `${eventType}:${Object.values(eventData).join('|')}`;
    if (seen.current.has(key)) return;
    seen.current.add(key);
    trackEvent({ coursePlanId: plan.id, eventType, eventData });
  };

  const config: CoursePlanConfig | null = useMemo(
    () => (ownerConfig ? { ...ownerConfig, items: draft.items, notes: draft.notes } : null),
    [ownerConfig, draft],
  );
  const analysis = useMemo(() => (config ? analysePlan(config) : null), [config]);

  const changeFilters = (next: GuideFilters) => {
    if (next.search.trim() && next.search !== filters.search) note('search', { term: next.search.trim() });
    if (next.subject !== filters.subject && next.subject) note('filter', { column: 'Subject' });
    if (next.level !== filters.level && next.level) note('filter', { column: 'Level' });
    if (next.family !== filters.family && next.family) note('filter', { column: 'Type' });
    if (next.status !== filters.status && next.status) note('filter', { column: 'Status' });
    setFilters(next);
  };

  const addQual = (qual: Qualification) => {
    note('button_click', { label: 'Add qualification' });
    setDraft((d) => (d.items.some((i) => i.id === qual.id)
      ? d
      : { ...d, items: [...d.items, { id: qual.id, qn: qual.qn, title: qual.title }] }));
  };

  const removeQual = (qualId: string) =>
    setDraft((d) => ({ ...d, items: d.items.filter((i) => i.id !== qualId) }));

  const setNote = (qualId: string, itemNote: string) =>
    setDraft((d) => ({ ...d, items: d.items.map((i) => (i.id === qualId ? { ...i, note: itemNote } : i)) }));

  const reset = () => {
    if (!ownerConfig) return;
    if (!confirm('Start again? This clears the qualifications you have chosen.')) return;
    setDraft({ items: ownerConfig.startFrom === 'owner' ? ownerConfig.items : [] });
    setRestored(false);
  };

  if (loading) {
    return (
      <main className="cb-public">
        <div className="cb-loading"><div className="spinner spinner-lg" /></div>
      </main>
    );
  }

  if (notFound || !plan || !config || !analysis || !ownerConfig) {
    return (
      <main className="cb-public">
        <div className="cb-public__missing">
          <h1 className="cb-read__title">Course builder not available</h1>
          <p className="text-soft mt-8">
            This course builder may have been unpublished, or the link may be wrong. Check the link
            with whoever shared it with you.
          </p>
        </div>
      </main>
    );
  }

  const inPlanIds = config.items.map((i) => i.id);
  const locked = ownerConfig.lockScope === true;

  return (
    <main className="cb-public cb-public--wide">
      <div className="cb-public__inner cb-public__inner--wide">
        <div className="cb-public__brand">
          {/* The logo defaults to white for the dark app nav; this page is light. */}
          <PearsonLogo width={96} color="#0D004D" />
        </div>

        <header className="cb-public__head">
          <h1 className="cb-read__title">{plan.title}</h1>
          {plan.description && <p className="cb-read__desc">{plan.description}</p>}
          <div className="cb-row__meta">
            {ownerConfig.subject && <span className="cb-tag">{ownerConfig.subject}</span>}
            {ownerConfig.level && <span className="cb-tag">{ownerConfig.level}</span>}
            <span className="cb-tag">First teach {ownerConfig.firstTeachYear}</span>
          </div>
          <p className="cb-public__intro">
            Search the Pearson post-16 Options Guide, add the qualifications you are considering, and
            this builder shows you what the guide says about them — what is funded for{' '}
            {ownerConfig.firstTeachYear}, when reform lands, and what to move to. Download your
            programme when you are done.
          </p>
          {restored && (
            <p className="cb-public__restored">
              Picking up where you left off.{' '}
              <button type="button" className="btn btn-ghost btn-sm" onClick={reset}>Start again</button>
            </p>
          )}
        </header>

        <div className="cb-workspace">
          <section className="cb-workspace__browse card">
            <h2 className="cb-section-title">Search the guide</h2>
            <p className="cb-section-sub">
              {locked
                ? `Showing ${[ownerConfig.level, ownerConfig.subject].filter(Boolean).join(' ')} qualifications. Open any one to read the guide's advice in full.`
                : 'Open any qualification to read the guide’s advice in full.'}
            </p>
            <QualificationBrowser
              filters={filters}
              onFiltersChange={changeFilters}
              onOpen={setOpen}
              onAdd={addQual}
              inPlanIds={inPlanIds}
              lockedSubject={locked ? ownerConfig.subject : undefined}
              lockedLevel={locked ? ownerConfig.level : undefined}
            />
          </section>

          <section className="cb-workspace__plan card">
            <PlanPanel
              config={config}
              analysis={analysis}
              heading="Your programme"
              onOpen={setOpen}
              onRemove={removeQual}
              onNoteChange={setNote}
              onNotesChange={(notes) => setDraft((d) => ({ ...d, notes }))}
              onSearchFor={(searchTitle) => changeFilters({ ...filters, search: searchTitle })}
              onExport={() => {
                note('button_click', { label: 'Download as Excel' });
                downloadPlanWorkbook(plan.title, config, analysis);
              }}
              onPrint={() => {
                note('button_click', { label: 'Print' });
                window.print();
              }}
            />
          </section>
        </div>

        <footer className="cb-read__foot">
          <p className="text-sm text-soft">
            Built from the Pearson post-16 Options Guide. Status and funding shown are for first
            teach {ownerConfig.firstTeachYear}; speak to your Curriculum Development Manager before
            committing to a programme. Your choices stay in this browser — they are not saved to
            Pearson or visible to anyone else.
          </p>
        </footer>

        {open && (
          <QualificationDetail
            qual={open}
            inPlan={inPlanIds.includes(open.id)}
            onClose={() => setOpen(null)}
            onAdd={() => addQual(open)}
            onRemove={() => removeQual(open.id)}
            onSearchFor={(searchTitle) => changeFilters({ ...filters, search: searchTitle })}
          />
        )}
      </div>
    </main>
  );
}
