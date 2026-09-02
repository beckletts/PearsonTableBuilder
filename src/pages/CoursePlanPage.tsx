/**
 * Course plan workspace: search the Options Guide on the left, build the
 * programme and read the guide's advice on the right.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { LEVELS, REFORM_YEARS, SUBJECTS, type Level, type Qualification } from '../data/optionsGuide';
import {
  analysePlan, emptyFilters, normaliseConfig, planExportRows,
  type CoursePlan, type CoursePlanConfig, type GuideFilters,
} from '../lib/courseBuilder';
import PearsonNav from '../components/layout/PearsonNav';
import QualificationBrowser from '../components/course/QualificationBrowser';
import QualificationDetail from '../components/course/QualificationDetail';
import PlanPanel from '../components/course/PlanPanel';
import './CoursePage.css';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface Props { user: User }

export default function CoursePlanPage({ user }: Props) {
  const { id } = useParams<{ id: string }>();

  const [plan, setPlan] = useState<CoursePlan | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [config, setConfig] = useState<CoursePlanConfig | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [filters, setFilters] = useState<GuideFilters>(emptyFilters);
  const [open, setOpen] = useState<Qualification | null>(null);

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
      if (error || !data) { setLoadError(error?.message ?? 'Course plan not found'); return; }
      const record = data as CoursePlan;
      const normalised = normaliseConfig(record.config);
      loadedId.current = id;
      dirty.current = false;
      setPlan(record);
      setTitle(record.title);
      setDescription(record.description ?? '');
      setConfig(normalised);
      setFilters({ ...emptyFilters, subject: normalised.subject ?? '', level: normalised.level ?? '' });
    })();
    return () => { cancelled = true; };
  }, [id]);

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
        title: next.title.trim() || 'Untitled course plan',
        description: next.description.trim() || null,
        config: next.config,
      })
      .eq('id', id);
    setSaveState(error ? 'error' : 'saved');
  }, [id]);

  useEffect(() => {
    if (!config || !plan || loadedId.current !== id) return;
    if (!dirty.current) { dirty.current = true; return; }   // skip the initial load
    window.clearTimeout(pending.current);
    pending.current = window.setTimeout(() => void save({ title, description, config }), 800);
    return () => window.clearTimeout(pending.current);
  }, [title, description, config, plan, id, save]);

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
    const rows = planExportRows(config, analysis);
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Course plan');
    const safe = (title.trim() || 'course-plan').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    XLSX.writeFile(wb, `${safe}.xlsx`);
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

  const inPlanIds = config.items.map((i) => i.id);

  return (
    <div>
      <PearsonNav user={user} />
      <main className="cb-page cb-page--wide">
        <nav className="cb-breadcrumb">
          <Link to="/course">Course builder</Link> <span aria-hidden="true">/</span> {plan.title}
        </nav>

        <header className="cb-plan-head card">
          <div className="cb-plan-head__main">
            <label className="input-label" htmlFor="cb-plan-title">Plan name</label>
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
      </main>
    </div>
  );
}
