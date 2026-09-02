/** A saved course plan, as listed on the course builder hub and the dashboard. */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import {
  analysePlan, normaliseConfig,
  type CoursePlan, type CoursePlanAccess,
} from '../../lib/courseBuilder';
import CoursePlanShareModal from './CoursePlanShareModal';
import EmbedModal from '../dashboard/EmbedModal';

interface Props {
  plan: CoursePlan;
  /** Omitted for a plan the signed-in user owns. */
  accessLevel?: CoursePlanAccess;
  onUpdate: () => void;
}

export default function CoursePlanCard({ plan, accessLevel, onUpdate }: Props) {
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [embedding, setEmbedding] = useState(false);
  const [copied, setCopied] = useState(false);

  const isOwner = accessLevel === undefined;
  const config = normaliseConfig(plan.config);
  const analysis = analysePlan(config);
  const risks = analysis.checks.filter((c) => c.tone === 'risk').length;

  const togglePublish = async () => {
    setBusy(true);
    const { error } = await supabase
      .from('course_plans')
      .update({ is_published: !plan.is_published })
      .eq('id', plan.id);
    setBusy(false);
    if (error) alert(`Could not ${plan.is_published ? 'unpublish' : 'publish'} the plan: ${error.message}`);
    else onUpdate();
  };

  const copyLink = () => {
    void navigator.clipboard.writeText(`${window.location.origin}/cp/${plan.slug}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const remove = async () => {
    setBusy(true);
    const { data: shares } = await supabase
      .from('course_plan_shares')
      .select('collaborator_email')
      .eq('plan_id', plan.id);
    setBusy(false);

    let message = `Delete “${plan.title}”? This cannot be undone.`;
    if (shares && shares.length > 0) {
      const names = shares.map((s: { collaborator_email: string }) => s.collaborator_email).join(', ');
      message = `Delete “${plan.title}”?\n\nThis plan is shared with ${shares.length} colleague${shares.length > 1 ? 's' : ''}: ${names}.\n\nDeleting it will immediately remove their access. This cannot be undone.`;
    }
    if (!confirm(message)) return;

    setBusy(true);
    const { error } = await supabase.from('course_plans').delete().eq('id', plan.id);
    setBusy(false);
    if (error) alert(`Could not delete the plan: ${error.message}`);
    else onUpdate();
  };

  return (
    <>
      <div className="cb-card">
        <div className="cb-card__body">
          <h3 className="cb-card__title">
            <Link to={`/course/${plan.id}`}>{plan.title}</Link>
          </h3>
          {plan.description && <p className="cb-card__desc">{plan.description}</p>}
          <div className="cb-row__meta">
            <span className={`cb-tag ${plan.is_published ? 'cb-tag--ok' : ''}`}>
              {plan.is_published ? 'Published' : 'Draft'}
            </span>
            {!isOwner && (
              <span className="cb-tag cb-tag--watch">
                Shared · {accessLevel === 'edit' ? 'can edit' : 'view only'}
              </span>
            )}
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
            <Link to={`/course/${plan.id}`} className="btn btn-secondary btn-sm">
              {isOwner || accessLevel === 'edit' ? 'Edit' : 'Open'}
            </Link>
            {plan.is_published && (
              <>
                <a
                  href={`/cp/${plan.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-secondary btn-sm"
                >
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
                  className={`btn btn-sm ${plan.is_published ? 'btn-secondary' : 'btn-primary cb-btn-primary'}`}
                  onClick={() => void togglePublish()}
                  disabled={busy}
                >
                  {plan.is_published ? 'Unpublish' : 'Publish'}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSharing(true)}>
                  Share
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => void remove()} disabled={busy}>
                  Delete
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {sharing && (
        <CoursePlanShareModal planId={plan.id} planTitle={plan.title} onClose={() => setSharing(false)} />
      )}
      {embedding && (
        <EmbedModal
          tableTitle={plan.title}
          tableSlug={plan.slug}
          basePath="cp"
          kind="course plan"
          onClose={() => setEmbedding(false)}
        />
      )}
    </>
  );
}
