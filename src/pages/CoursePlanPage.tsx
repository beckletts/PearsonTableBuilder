/**
 * Course plan workspace: search the Options Guide on the left, build the
 * programme and read the guide's advice on the right.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { LEVELS, REFORM_YEARS, SUBJECTS, type Level, type Qualification } from '../data/optionsGuide';
import {
  analysePlan, emptyFilters, normaliseConfig,
  type CoursePlan, type CoursePlanAccess, type CoursePlanConfig, type GuideFilters,
} from '../lib/courseBuilder';
import { downloadPlanWorkbook } from '../lib/coursePlanDownload';
import { setCoursePlanPublished } from '../lib/coursePlanActions';
import PearsonNav from '../components/layout/PearsonNav';
import QualificationBrowser from '../components/course/QualificationBrowser';
import QualificationDetail from '../components/course/QualificationDetail';
import PlanPanel from '../components/course/PlanPanel';
import CoursePlanReadView from '../components/course/CoursePlanReadView';
import CoursePlanShareModal from '../components/course/CoursePlanShareModal';
import EmbedModal from '../components/dashboard/EmbedModal';
import './CoursePage.css';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface Props { user: User }

export default function CoursePlanPage({ user }: Props) {
  const { id } = useParams<{ id: string }>();

  const [plan, setPlan] = useState<CoursePlan | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [config, setConfig] = useState<CoursePlanConfig | null>(null);
  const [published, setPublished] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [filters, setFilters] = useState<GuideFilters>(emptyFilters);
  const [open, setOpen] = useState<Qualification | null>(null);
  const [sharing, setSharing] = useState(false);
  const [embedding, setEmbedding] = useState(false);
  const [copied, setCopied] = useState(false);
  const [publishBusy, setPublishBusy] = useState(false);
  /** Undefined until the plan loads; 'owner' when the signed-in user owns it. */
  const [access, setAccess] = useState<'owner' | CoursePlanAccess | undefined>(undefined);

  // Which plan the state below actually belongs to, so a debounced save can
  // never land on a different plan than the one it was typed into.
  const loadedId = useRef<string | undefined>(undefined);

  // Load, then seed the browse filters from the plan's focus so the first
  // screen already shows the qualifications the teacher cares about.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase.from('course_plans').select('*').eq('id', id).single();
      if (cancelled) return;
      if (error || !data) { setLoadError(error?.message ?? 'Course builder not found'); return; }
      const record = data as CoursePlan;
      const normalised = normaliseConfig(record.config);

      // RLS already decided we may read this; work out whether we may write it.
      let level: 'owner' | CoursePlanAccess = 'view';
      if (record.owner_id === user.id) {
        level = 'owner';
      } else {
        const { data: share } = await supabase
          .from('course_plan_shares')
          .select('access_level')
          .eq('plan_id', record.id)
          .eq('collaborator_email', (user.email ?? '').toLowerCase())
          .maybeSingle();
        level = (share as { access_level?: CoursePlanAccess } | null)?.access_level === 'edit' ? 'edit' : 'view';
      }
      if (cancelled) return;

      loadedId.current = id;
      dirty.current = false;
      setAccess(level);
      setPlan(record);
      setPublished(record.is_published);
      setTitle(record.title);
      setDescription(record.description ?? '');
      setConfig(normalised);
      setFilters({ ...emptyFilters, subject: normalised.subject ?? '', level: normalised.level ?? '' });
    })();
    return () => { cancelled = true; };
  }, [id, user.id, user.email]);

  // Debounced autosave: planning is fiddly, and losing a half-built programme
  // to a stray navigation would be worse than a save button.
  const pending = useRef<number | undefined>(undefined);
  const dirty = useRef(false);
  const save = useCallback(async (next: { title: string; description: string; config: CoursePlanConfig }) => {
    if (!id) return;
    setSaveState('saving');
    const { error } = await supabase
      .from('course_plans')
      .update({
        title: next.title.trim() || 'Untitled course builder',
        description: next.description.trim() || null,
        config: next.config,
      })
      .eq('id', id);
    setSaveState(error ? 'error' : 'saved');
  }, [id]);

  const canEdit = access === 'owner' || access === 'edit';

  useEffect(() => {
    if (!config || !plan || loadedId.current !== id || !canEdit) return;
    if (!dirty.current) { dirty.current = true; return; }   // skip the initial load
    window.clearTimeout(pending.current);
    pending.current = window.setTimeout(() => void save({ title, description, config }), 800);
    return () => window.clearTimeout(pending.current);
  }, [title, description, config, plan, id, canEdit, save]);

  const analysis = useMemo(() => (config ? analysePlan(config) : null), [config]);

  const patch = (changes: Partial<CoursePlanConfig>) =>
    setConfig((c) => (c ? { ...c, ...changes } : c));

  const addQual = (qual: Qualification) =>
    setConfig((c) => {
      if (!c || c.items.some((i) => i.id === qual.id)) return c;
      return { ...c, items: [...c.items, { id: qual.id, qn: qual.qn, title: qual.title }] };
    });

  const removeQual = (qualId: string) =>
    setConfig((c) => (c ? { ...c, items: c.items.filter((i) => i.id !== qualId) } : c));

  const setNote = (qualId: string, note: string) =>
    setConfig((c) => (c ? { ...c, items: c.items.map((i) => (i.id === qualId ? { ...i, note } : i)) } : c));

  const exportPlan = () => {
    if (!config || !analysis) return;
    downloadPlanWorkbook(title.trim() || 'course-plan', config, analysis);
  };

  // Publishing is written straight through rather than debounced — it is a
  // deliberate act, and the link it hands out should work immediately.
  const togglePublish = async () => {
    if (!plan) return;
    setPublishBusy(true);
    const next = !published;
    const error = await setCoursePlanPublished(plan.id, next);
    setPublishBusy(false);
    if (error) alert(`Could not ${next ? 'publish' : 'unpublish'} the course builder: ${error}`);
    else setPublished(next);
  };

  const copyLink = () => {
    if (!plan) return;
    void navigator.clipboard.writeText(`${window.location.origin}/cb/${plan.slug}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (loadError) {
    return (
      <div>
        <PearsonNav user={user} />
        <main className="cb-page">
          <p className="cb-error">{loadError}</p>
          <Link to="/course" className="btn btn-secondary">Back to the course builder</Link>
        </main>
      </div>
    );
  }

  if (!plan || !config || !analysis) {
    return (
      <div>
        <PearsonNav user={user} />
        <main className="cb-page">
          <div className="cb-loading"><div className="spinner spinner-lg" /></div>
        </main>
      </div>
    );
  }

  // A colleague with view-only access gets the same read view as the public
  // page, inside the app shell, rather than a disabled copy of the workspace.
  if (!canEdit) {
    return (
      <div>
        <PearsonNav user={user} />
        <main className="cb-page">
          <nav className="cb-breadcrumb">
            <Link to="/course">Course builder</Link> <span aria-hidden="true">/</span> {plan.title}
          </nav>
          <CoursePlanReadView
            title={plan.title}
            description={plan.description}
            config={config}
            analysis={analysis}
            contextLabel="Shared with you — view only"
          />
        </main>
      </div>
    );
  }

  const inPlanIds = config.items.map((i) => i.id);
  const isOwner = access === 'owner';

  return (
    <div>
      <PearsonNav user={user} />
      <main className="cb-page cb-page--wide">
        <nav className="cb-breadcrumb">
          <Link to="/course">Course builder</Link> <span aria-hidden="true">/</span> {plan.title}
        </nav>

        <div className="cb-plan-bar card">
          <div className="cb-plan-bar__status">
            <span className={`cb-tag ${published ? 'cb-tag--ok' : ''}`}>
              {published ? 'Published' : 'Draft'}
            </span>
            {!isOwner && <span className="cb-tag cb-tag--watch">Shared with you — can edit</span>}
            <p className="cb-plan-bar__hint">
              {published
                ? 'Anyone with the link can use this course builder, and it can be embedded on a website.'
                : 'Only you and the people you share it with can see this course builder.'}
            </p>
          </div>
          <div className="cb-plan-bar__actions">
            {published && (
              <>
                <a href={`/cb/${plan.slug}`} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
                  View ↗
                </a>
                <button type="button" className="btn btn-ghost btn-sm" onClick={copyLink}>
                  {copied ? '✓ Copied' : 'Copy link'}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEmbedding(true)}>
                  Embed
                </button>
              </>
            )}
            {isOwner && (
              <>
                <button
                  type="button"
                  className={`btn btn-sm ${published ? 'btn-secondary' : 'btn-primary cb-btn-primary'}`}
                  onClick={() => void togglePublish()}
                  disabled={publishBusy}
                >
                  {published ? 'Unpublish' : 'Publish'}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSharing(true)}>
                  Share
                </button>
              </>
            )}
          </div>
        </div>

        <header className="cb-plan-head card">
          <div className="cb-plan-head__main">
            <label className="input-label" htmlFor="cb-plan-title">Name</label>
            <input
              id="cb-plan-title"
              className="input cb-plan-head__title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <label className="input-label" htmlFor="cb-plan-desc">Description</label>
            <input
              id="cb-plan-desc"
              className="input"
              placeholder="Who this programme is for (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="cb-plan-head__focus">
            <div>
              <label className="input-label" htmlFor="cb-plan-subject">Subject focus</label>
              <select
                id="cb-plan-subject"
                className="input"
                value={config.subject ?? ''}
                onChange={(e) => patch({ subject: e.target.value || undefined })}
              >
                <option value="">No focus</option>
                {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="input-label" htmlFor="cb-plan-level">Level</label>
              <select
                id="cb-plan-level"
                className="input"
                value={config.level ?? ''}
                onChange={(e) => patch({ level: (e.target.value || undefined) as Level | undefined })}
              >
                <option value="">No level</option>
                {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="input-label" htmlFor="cb-plan-year">First teach year</label>
              <select
                id="cb-plan-year"
                className="input"
                value={config.firstTeachYear}
                onChange={(e) => patch({ firstTeachYear: Number(e.target.value) })}
              >
                {REFORM_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <p className="cb-save" role="status">
              {saveState === 'saving' && 'Saving…'}
              {saveState === 'saved' && 'All changes saved'}
              {saveState === 'error' && 'Could not save — check your connection'}
            </p>
          </div>

          {/* How the builder behaves for someone arriving on the shared link. */}
          <fieldset className="cb-share-options">
            <legend className="cb-section-title">On the shared and embedded builder</legend>
            <label className="cb-check">
              <input
                type="checkbox"
                checked={config.startFrom === 'owner'}
                onChange={(e) => patch({ startFrom: e.target.checked ? 'owner' : 'blank' })}
              />
              <span>Start visitors off with the programme below, rather than an empty builder</span>
            </label>
            <label className="cb-check">
              <input
                type="checkbox"
                checked={config.lockScope === true}
                onChange={(e) => patch({ lockScope: e.target.checked })}
                disabled={!config.subject && !config.level}
              />
              <span>
                Keep visitors to {[config.level, config.subject].filter(Boolean).join(' ') || 'this subject and level'}
                {!config.subject && !config.level && ' (set a subject or level first)'}
              </span>
            </label>
          </fieldset>
        </header>

        <div className="cb-workspace">
          <section className="cb-workspace__browse card">
            <h2 className="cb-section-title">Search the guide</h2>
            <p className="cb-section-sub">
              Add qualifications to build the programme. Open any one to read the guide's advice in full.
            </p>
            <QualificationBrowser
              filters={filters}
              onFiltersChange={setFilters}
              onOpen={setOpen}
              onAdd={addQual}
              inPlanIds={inPlanIds}
            />
          </section>

          <section className="cb-workspace__plan card">
            <PlanPanel
              config={config}
              analysis={analysis}
              onOpen={setOpen}
              onRemove={removeQual}
              onNoteChange={setNote}
              onNotesChange={(notes) => patch({ notes })}
              onSearchFor={(searchTitle) => setFilters({ ...emptyFilters, search: searchTitle })}
              onExport={exportPlan}
              shareNotes={config.shareNotes === true}
              onShareNotesChange={(shareNotes) => patch({ shareNotes })}
            />
          </section>
        </div>

        {open && (
          <QualificationDetail
            qual={open}
            inPlan={inPlanIds.includes(open.id)}
            onClose={() => setOpen(null)}
            onAdd={() => addQual(open)}
            onRemove={() => removeQual(open.id)}
            onSearchFor={(searchTitle) => setFilters({ ...emptyFilters, search: searchTitle })}
          />
        )}

        {sharing && (
          <CoursePlanShareModal planId={plan.id} planTitle={title} onClose={() => setSharing(false)} />
        )}
        {embedding && (
          <EmbedModal
            tableTitle={title}
            tableSlug={plan.slug}
            basePath="cb"
            kind="course builder"
            onClose={() => setEmbedding(false)}
          />
        )}
      </main>
    </div>
  );
}
