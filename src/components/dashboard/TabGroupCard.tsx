import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type { TableRecord } from '../../lib/types';
import ShareModal from './ShareModal';
import EmbedModal from './EmbedModal';
import './TabGroupCard.css';

interface Props {
  primary: TableRecord;
  tabs: TableRecord[];
  onUpdate: () => void;
}

export default function TabGroupCard({ primary, tabs, onUpdate }: Props) {
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [embedding, setEmbedding] = useState(false);

  const allTabs = [primary, ...tabs];
  const isPublished = primary.is_published;

  const togglePublish = async () => {
    setBusy(true);
    await supabase.from('tables').update({ is_published: !isPublished }).eq('id', primary.id);
    onUpdate();
    setBusy(false);
  };

  const deleteGroup = async () => {
    const names = allTabs.map((t) => t.title).join(', ');
    if (!confirm(`Delete all tabs in this group (${names})? This cannot be undone.`)) return;
    setBusy(true);
    await supabase.from('tables').delete().in('id', allTabs.map((t) => t.id));
    onUpdate();
    setBusy(false);
  };

  const copyLink = () => {
    void navigator.clipboard.writeText(`${window.location.origin}/t/${primary.slug}`);
  };

  return (
    <>
      <div className="tab-group-card card">
        <div className="tab-group-card__top">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h3 className="tab-group-card__title">{primary.title}</h3>
              <span className={`badge ${isPublished ? 'badge-green' : 'badge-grey'}`}>
                {isPublished ? 'Published' : 'Draft'}
              </span>
              <span className="badge badge-purple">{allTabs.length} tabs</span>
            </div>
            {primary.description && (
              <p className="tab-group-card__desc">{primary.description}</p>
            )}
          </div>
        </div>

        <div className="tab-group-card__tabs">
          {allTabs.map((tab, i) => (
            <div key={tab.id} className="tab-group-card__tab">
              <div className="tab-group-card__tab-info">
                <span className="tab-group-card__tab-index">{i + 1}</span>
                <div>
                  <span className="tab-group-card__tab-title">{tab.title}</span>
                  <span className="tab-group-card__tab-cols text-xs text-muted">
                    {tab.config.columns.filter((c) => c.visible).length} columns
                    {tab.is_published !== isPublished && (
                      <span className={`badge ${tab.is_published ? 'badge-green' : 'badge-grey'}`} style={{ marginLeft: 6 }}>
                        {tab.is_published ? 'Published' : 'Draft'}
                      </span>
                    )}
                  </span>
                </div>
              </div>
              <div className="tab-group-card__tab-actions">
                <Link to={`/builder/${tab.id}`} className="btn btn-secondary btn-sm">Edit</Link>
                {tab.is_published && (
                  <Link to={`/t/${tab.slug}`} target="_blank" className="btn btn-ghost btn-sm">View ↗</Link>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="tab-group-card__actions">
          <Link
            to={`/builder/new?groupId=${primary.id}&tabOrder=${allTabs.length}`}
            className="btn btn-secondary btn-sm"
          >
            + Add tab
          </Link>
          {isPublished && (
            <button className="btn btn-ghost btn-sm" onClick={copyLink}>Copy link</button>
          )}
          {isPublished && (
            <button className="btn btn-ghost btn-sm" onClick={() => setEmbedding(true)}>Embed</button>
          )}
          <button
            className={`btn btn-sm ${isPublished ? 'btn-secondary' : 'btn-primary'}`}
            onClick={() => void togglePublish()}
            disabled={busy}
          >
            {isPublished ? 'Unpublish' : 'Publish'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setSharing(true)}>Share</button>
          <button className="btn btn-danger btn-sm" onClick={() => void deleteGroup()} disabled={busy}>
            Delete all
          </button>
        </div>

        <p className="tab-group-card__date text-xs text-muted">
          Updated {new Date(primary.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
        </p>
      </div>

      {sharing && (
        <ShareModal
          tableId={primary.id}
          tableTitle={primary.title}
          onClose={() => setSharing(false)}
        />
      )}
      {embedding && (
        <EmbedModal
          tableTitle={primary.title}
          tableSlug={primary.slug}
          onClose={() => setEmbedding(false)}
        />
      )}
    </>
  );
}
