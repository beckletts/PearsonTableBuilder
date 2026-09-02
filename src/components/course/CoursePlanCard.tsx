/**
 * A course builder on the dashboard and the course builder hub.
 *
 * Carries the same option set as a table card, so a published builder is
 * managed the same way as any other published thing in the app.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import {
  analysePlan, normaliseConfig,
  type CoursePlan, type CoursePlanAccess,
} from '../../lib/courseBuilder';
import { duplicateCoursePlan, setCoursePlanPublished } from '../../lib/coursePlanActions';
import CoursePlanShareModal from './CoursePlanShareModal';
import CoursePlanAuditModal from './CoursePlanAuditModal';
import EmbedModal from '../dashboard/EmbedModal';
import AnalyticsModal from '../dashboard/AnalyticsModal';
import TransferOwnershipModal from '../dashboard/TransferOwnershipModal';
import './CoursePlanCard.css';

interface Props {
  plan: CoursePlan;
  /** Omitted for a builder the signed-in user owns. */
  accessLevel?: CoursePlanAccess;
  onUpdate: () => void;
}

export default function CoursePlanCard({ plan, accessLevel, onUpdate }: Props) {
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [embedding, setEmbedding] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [history, setHistory] = useState(false);
  const [copied, setCopied] = useState(false);

  const isOwner = accessLevel === undefined;
  const config = normaliseConfig(plan.config);
  const analysis = analysePlan(config);
  const risks = analysis.checks.filter((c) => c.tone === 'risk').length;

  const togglePublish = async () => {
    setBusy(true);
    const error = await setCoursePlanPublished(plan.id, !plan.is_published);
    setBusy(false);
    if (error) alert(`Could not ${plan.is_published ? 'unpublish' : 'publish'} the course builder: ${error}`);
    else onUpdate();
  };

  const copyLink = () => {
    void navigator.clipboard.writeText(`${window.location.origin}/cb/${plan.slug}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const duplicate = async () => {
    setBusy(true);
    const error = await duplicateCoursePlan(plan);
    setBusy(false);
    if (error) alert(`Could not duplicate the course builder: ${error}`);
    else onUpdate();
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
      message = `Delete “${plan.title}”?\n\nThis course builder is shared with ${shares.length} colleague${shares.length > 1 ? 's' : ''}: ${names}.\n\nDeleting it will immediately remove their access, and any link or embed will stop working. This cannot be undone.`;
    } else if (plan.is_published) {
      message = `Delete “${plan.title}”?\n\nIt is published, so any link or embed pointing at it will stop working. This cannot be undone.`;
    }
    if (!confirm(message)) return;

    setBusy(true);
    const { error } = await supabase.from('course_plans').delete().eq('id', plan.id);
    setBusy(false);
    if (error) alert(`Could not delete the course builder: ${error.message}`);
    else onUpdate();
  };

  return (
    <>
      <div className="cb-card">
        <div className="cb-card__body">
          <div className="cb-card__title-row">
            <h3 className="cb-card__title">
              <Link to={`/course/${plan.id}`}>{plan.title}</Link>
            </h3>
            {!isOwner && (
              <span className="badge badge-yellow cb-card__badge">
                {accessLevel === 'edit' ? 'Shared · can edit' : 'Shared · view only'}
              </span>
            )}
          </div>
          {plan.description && <p className="cb-card__desc">{plan.description}</p>}
          <div className="cb-row__meta">
            <span className={`badge ${plan.is_published ? 'badge-green' : 'badge-grey'}`}>
              {plan.is_published ? 'Published' : 'Draft'}
            </span>
            {config.subject && <span className="cb-tag">{config.subject}</span>}
            {config.level && <span className="cb-tag">{config.level}</span>}
            {analysis.quals.length > 0 && (
              <span className="cb-tag">
                {analysis.quals.length} {analysis.quals.length === 1 ? 'qualification' : 'qualifications'}
              </span>
            )}
            {risks > 0 && (
              <span className="cb-tag cb-tag--risk">
                {risks} {risks === 1 ? 'thing' : 'things'} to check
              </span>
            )}
          </div>
        </div>

        <div className="cb-card__actions-grid">
          <Link to={`/course/${plan.id}`} className="btn btn-secondary btn-sm">
            {isOwner || accessLevel === 'edit' ? 'Edit' : 'Open'}
          </Link>
          {plan.is_published && (
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
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAnalytics(true)}>
            Analytics
          </button>
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
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTransferring(true)}>
                Transfer
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setHistory(true)}>
                History
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void duplicate()} disabled={busy}>
                Duplicate
              </button>
              <button type="button" className="btn btn-danger btn-sm" onClick={() => void remove()} disabled={busy}>
                Delete
              </button>
            </>
          )}
        </div>

        <p className="cb-card__date text-xs text-muted">
          Updated {new Date(plan.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
        </p>
      </div>

      {sharing && (
        <CoursePlanShareModal planId={plan.id} planTitle={plan.title} onClose={() => setSharing(false)} />
      )}
      {embedding && (
        <EmbedModal
          tableTitle={plan.title}
          tableSlug={plan.slug}
          basePath="cb"
          kind="course builder"
          onClose={() => setEmbedding(false)}
        />
      )}
      {analytics && (
        <AnalyticsModal coursePlanId={plan.id} title={plan.title} onClose={() => setAnalytics(false)} />
      )}
      {transferring && (
        <TransferOwnershipModal
          kind="course_plan"
          id={plan.id}
          title={plan.title}
          onClose={() => setTransferring(false)}
          onDone={onUpdate}
        />
      )}
      {history && (
        <CoursePlanAuditModal planId={plan.id} planTitle={plan.title} onClose={() => setHistory(false)} />
      )}
    </>
  );
}
