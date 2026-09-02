/**
 * Course builder hub: start a plan, pick up a saved one, or read the guide.
 *
 * Separate from the table builder — nothing here touches tables or dashboards.
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { SUBJECTS, LEVELS, type Level } from '../data/optionsGuide';
import {
  DEFAULT_FIRST_TEACH_YEAR, emptyConfig,
  type CoursePlan, type CoursePlanAccess,
} from '../lib/courseBuilder';
import { generateUniqueCoursePlanSlug } from '../utils/generateSlug';
import { logCoursePlanAction } from '../lib/coursePlanActions';
import PearsonNav from '../components/layout/PearsonNav';
import CoursePlanCard from '../components/course/CoursePlanCard';
import './CoursePage.css';

interface Props { user: User }

export default function CourseBuilderPage({ user }: Props) {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<CoursePlan[]>([]);
  const [sharedPlans, setSharedPlans] = useState<CoursePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [level, setLevel] = useState('');

  const load = async () => {
    setLoading(true);
    const email = (user.email ?? '').toLowerCase();
    const [{ data, error: loadError }, { data: shareRows }] = await Promise.all([
      supabase.from('course_plans').select('*').eq('owner_id', user.id).order('updated_at', { ascending: false }),
      supabase.from('course_plan_shares').select('plan_id, access_level').eq('collaborator_email', email),
    ]);
    if (loadError) setError(loadError.message);
    setPlans((data as CoursePlan[]) ?? []);

    if (shareRows && shareRows.length > 0) {
      const levels = Object.fromEntries(
        (shareRows as { plan_id: string; access_level: CoursePlanAccess }[]).map((s) => [s.plan_id, s.access_level]),
      );
      const { data: shared } = await supabase
        .from('course_plans')
        .select('*')
        .in('id', Object.keys(levels))
        .order('updated_at', { ascending: false });
      setSharedPlans(((shared as CoursePlan[]) ?? []).map((p) => ({ ...p, _accessLevel: levels[p.id] ?? 'view' })));
    } else {
      setSharedPlans([]);
    }
    setLoading(false);
  };

  useEffect(() => { void load(); }, [user.id]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    const planTitle = title.trim() || 'Untitled course builder';
    const { data, error: createError } = await supabase
      .from('course_plans')
      .insert({
        owner_id: user.id,
        title: planTitle,
        // Every plan gets its public link segment up front, so publishing later
        // is a single flag rather than a migration of existing rows.
        slug: await generateUniqueCoursePlanSlug(planTitle),
        config: emptyConfig(subject || undefined, (level || undefined) as Level | undefined),
      })
      .select()
      .single();
    setCreating(false);
    if (createError) { setError(createError.message); return; }
    const created = data as CoursePlan;
    void logCoursePlanAction(created.id, 'created');
    navigate(`/course/${created.id}`);
  };

  return (
    <div>
      <PearsonNav user={user} />
      <main className="cb-page">
        <header className="cb-hero">
          <span className="badge badge-purple">Course builder</span>
          <h1 className="cb-hero__title">Plan a post-16 programme with confidence</h1>
          <p className="cb-hero__sub">
            The Options Guide lists 287 qualifications, which of them you can still teach from{' '}
            {DEFAULT_FIRST_TEACH_YEAR}, and where each one is heading. Build a programme here and the
            guide's own advice comes with it — what is funded, when reform lands, and what to move to.
            Publish a builder and teachers can use it themselves, from a link or embedded on a page.
          </p>
          <Link to="/course/guide" className="btn btn-secondary">Browse the guide</Link>
        </header>

        <section className="cb-start card">
          <h2 className="cb-section-title">Create a course builder</h2>
          <p className="cb-section-sub">
            Name it and choose a focus if you have one. You can change all of this later, and publish
            it when you want to share or embed it.
          </p>
          <form className="cb-start__form" onSubmit={(e) => void create(e)}>
            <div className="cb-start__field cb-start__field--wide">
              <label className="input-label" htmlFor="cb-title">Name</label>
              <input
                id="cb-title"
                className="input"
                placeholder="e.g. Level 3 Business options, September 2027"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="cb-start__field">
              <label className="input-label" htmlFor="cb-start-subject">Subject</label>
              <select id="cb-start-subject" className="input" value={subject} onChange={(e) => setSubject(e.target.value)}>
                <option value="">Not sure yet</option>
                {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="cb-start__field">
              <label className="input-label" htmlFor="cb-start-level">Level</label>
              <select id="cb-start-level" className="input" value={level} onChange={(e) => setLevel(e.target.value)}>
                <option value="">Not sure yet</option>
                {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <button type="submit" className="btn btn-primary cb-btn-primary" disabled={creating}>
              {creating ? 'Creating…' : 'Create course builder'}
            </button>
          </form>
          {error && <p className="cb-error">{error}</p>}
        </section>

        <section>
          <h2 className="cb-section-title">Your course builders</h2>
          {loading && (
            <div className="cb-loading"><div className="spinner spinner-lg" /></div>
          )}
          {!loading && plans.length === 0 && (
            <p className="cb-empty">
              No course builders yet. Create one above to start working through your options.
            </p>
          )}
          {!loading && plans.length > 0 && (
            <div className="cb-card-grid">
              {plans.map((plan) => (
                <CoursePlanCard key={plan.id} plan={plan} onUpdate={() => void load()} />
              ))}
            </div>
          )}
        </section>

        {!loading && sharedPlans.length > 0 && (
          <section style={{ marginTop: 36 }}>
            <h2 className="cb-section-title">Shared with me</h2>
            <p className="cb-section-sub">Course builders colleagues have shared with your account</p>
            <div className="cb-card-grid">
              {sharedPlans.map((plan) => (
                <CoursePlanCard
                  key={plan.id}
                  plan={plan}
                  accessLevel={plan._accessLevel ?? 'view'}
                  onUpdate={() => void load()}
                />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
