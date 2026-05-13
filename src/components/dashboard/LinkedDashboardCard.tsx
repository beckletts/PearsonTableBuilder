import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type { LinkedDashboard } from '../../lib/types';
import LinkedShareModal from './LinkedShareModal';
import './LinkedDashboardCard.css';

interface Props {
  dashboard: LinkedDashboard;
  onUpdate: () => void;
}

export default function LinkedDashboardCard({ dashboard, onUpdate }: Props) {
  const [busy, setBusy]         = useState(false);
  const [showShare, setShowShare] = useState(false);

  const togglePublish = async () => {
    setBusy(true);
    await supabase
      .from('linked_dashboards')
      .update({ is_published: !dashboard.is_published })
      .eq('id', dashboard.id);
    onUpdate();
    setBusy(false);
  };

  const deleteDashboard = async () => {
    if (!confirm(`Delete "${dashboard.title}"? This will remove all linked data and cannot be undone.`)) return;
    setBusy(true);
    await supabase.from('linked_dashboards').delete().eq('id', dashboard.id);
    onUpdate();
    setBusy(false);
  };

  const copyLink = () => {
    void navigator.clipboard.writeText(`${window.location.origin}/ld/${dashboard.slug}`);
  };

  const sourceCount = dashboard.config.sources?.length ?? 0;
  const colCount    = dashboard.config.columns.filter((c) => c.visible).length;

  return (
    <div className="ld-card card">
      <div>
        <div className="ld-card__header">
          <span className="ld-card__icon">🔗</span>
          <h3 className="ld-card__title">{dashboard.title}</h3>
        </div>
        {dashboard.description && <p className="ld-card__desc">{dashboard.description}</p>}
        <div className="ld-card__badges">
          <span className={`badge ${dashboard.is_published ? 'badge-green' : 'badge-grey'}`}>
            {dashboard.is_published ? 'Published' : 'Draft'}
          </span>
          <span className="badge badge-purple">{sourceCount} sheet{sourceCount !== 1 ? 's' : ''}</span>
          <span className="badge badge-grey">{colCount} columns</span>
        </div>
      </div>

      <div className="ld-card__actions">
        <Link to={`/linked/${dashboard.id}/edit`} className="btn btn-secondary btn-sm">
          Edit
        </Link>
        {dashboard.is_published && (
          <>
            <Link to={`/ld/${dashboard.slug}`} target="_blank" className="btn btn-secondary btn-sm">
              View ↗
            </Link>
            <button className="btn btn-ghost btn-sm" onClick={copyLink}>
              Copy link
            </button>
          </>
        )}
        <button className="btn btn-ghost btn-sm" onClick={() => setShowShare(true)}>
          Share
        </button>
        <button
          className={`btn btn-sm ${dashboard.is_published ? 'btn-secondary' : 'btn-primary'}`}
          onClick={() => void togglePublish()}
          disabled={busy}
        >
          {dashboard.is_published ? 'Unpublish' : 'Publish'}
        </button>
        <button className="btn btn-danger btn-sm" onClick={() => void deleteDashboard()} disabled={busy}>
          Delete
        </button>
      </div>

      {showShare && (
        <LinkedShareModal
          dashboardId={dashboard.id}
          dashboardTitle={dashboard.title}
          onClose={() => setShowShare(false)}
        />
      )}

      <p className="ld-card__date text-xs text-muted">
        Updated {new Date(dashboard.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
      </p>
    </div>
  );
}
