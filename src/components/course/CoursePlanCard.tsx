/** A saved course plan, as listed on the course builder hub and the dashboard. */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { analysePlan, normaliseConfig, type CoursePlan } from '../../lib/courseBuilder';

interface Props {
  plan: CoursePlan;
  onUpdate: () => void;
}

export default function CoursePlanCard({ plan, onUpdate }: Props) {
  const [busy, setBusy] = useState(false);
  const config = normaliseConfig(plan.config);
  const analysis = analysePlan(config);
  const risks = analysis.checks.filter((c) => c.tone === 'risk').length;

  const remove = async () => {
    if (!confirm(`Delete “${plan.title}”? This cannot be undone.`)) return;
    setBusy(true);
    const { error } = await supabase.from('course_plans').delete().eq('id', plan.id);
    setBusy(false);
    if (error) alert(`Could not delete the plan: ${error.message}`);
    else onUpdate();
  };

  return (
    <div className="cb-card">
      <div className="cb-card__body">
        <h3 className="cb-card__title">
          <Link to={`/course/${plan.id}`}>{plan.title}</Link>
        </h3>
        {plan.description && <p className="cb-card__desc">{plan.description}</p>}
        <div className="cb-row__meta">
          {config.subject && <span className="cb-tag">{config.subject}</span>}
          {config.level && <span className="cb-tag">{config.level}</span>}
          <span className="cb-tag">
            {analysis.quals.length} {analysis.quals.length === 1 ? 'qualification' : 'qualifications'}
          </span>
          {analysis.totalGlh > 0 && <span className="cb-tag">{analysis.totalGlh} GLH</span>}
          {risks > 0 && (
            <span className="cb-tag cb-tag--risk">
              {risks} {risks === 1 ? 'thing' : 'things'} to check
            </span>
          )}
        </div>
      </div>
      <div className="cb-card__foot">
        <span className="text-soft text-sm">
          Updated {new Date(plan.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
        </span>
        <div className="cb-card__actions">
          <Link to={`/course/${plan.id}`} className="btn btn-secondary btn-sm">Open</Link>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void remove()} disabled={busy}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
