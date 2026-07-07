import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type { TableRecord } from '../../lib/types';
import { generateUniqueSlug } from '../../utils/generateSlug';
import { fetchAllRows } from '../../utils/fetchAllRows';
import ShareModal from './ShareModal';
import TransferOwnershipModal from './TransferOwnershipModal';
import EmbedModal from './EmbedModal';
import AuditModal from './AuditModal';
import AnalyticsModal from './AnalyticsModal';
import './TableCard.css';

interface Props {
  table: TableRecord;
  isOwner: boolean;
  onUpdate: () => void;
}

export default function TableCard({ table, isOwner, onUpdate }: Props) {
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [embedding, setEmbedding] = useState(false);
  const [auditing, setAuditing] = useState(false);
  const [analytics, setAnalytics] = useState(false);

  const togglePublish = async () => {
    setBusy(true);
    await supabase.from('tables').update({ is_published: !table.is_published }).eq('id', table.id);
    onUpdate();
    setBusy(false);
  };

  const deleteTable = async () => {
    setBusy(true);
    const { data: shares } = await supabase.from('table_shares').select('collaborator_email').eq('table_id', table.id);
    setBusy(false);

    let message = `Delete "${table.title}"? This cannot be undone.`;
    if (shares && shares.length > 0) {
      const names = shares.map((s: { collaborator_email: string }) => s.collaborator_email).join(', ');
      message = `Delete "${table.title}"?\n\nThis table is currently shared with ${shares.length} colleague${shares.length > 1 ? 's' : ''}: ${names}.\n\nDeleting it will immediately remove their access. This cannot be undone.`;
    }

    if (!confirm(message)) return;
    setBusy(true);
    await supabase.from('tables').delete().eq('id', table.id);
    onUpdate();
    setBusy(false);
  };

  const duplicateTable = async () => {
    setBusy(true);
    try {
      const newTitle = `Copy of ${table.title}`;
      const newSlug = await generateUniqueSlug(newTitle);

      const { data: newTable, error } = await supabase
        .from('tables')
        .insert({
          owner_id: table.owner_id,
          title: newTitle,
          description: table.description,
          slug: newSlug,
          config: table.config,
          is_published: false,
          tab_group_id: null,
          tab_order: 0,
        })
        .select('id')
        .single();

      if (error || !newTable) throw error;

      const rows = await fetchAllRows(table.id);
      const CHUNK = 500;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK).map((r) => ({
          table_id: (newTable as { id: string }).id,
          data: r.data,
          row_index: r.row_index,
        }));
        await supabase.from('table_rows').insert(chunk);
      }

      onUpdate();
    } finally {
      setBusy(false);
    }
  };

  const copyLink = () => {
    void navigator.clipboard.writeText(`${window.location.origin}/t/${table.slug}`);
  };

  const isSecondaryTab = !!table.tab_group_id;

  return (
    <>
      <div className="table-card card">
        <div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <h3 className="table-card__title">{table.title}</h3>
            {isSecondaryTab && <span className="badge badge-purple" style={{ marginTop: 2, flexShrink: 0 }}>Tab</span>}
            {!isOwner && <span className="badge badge-yellow" style={{ marginTop: 2, flexShrink: 0 }}>Shared</span>}
          </div>
          {table.description && <p className="table-card__desc">{table.description}</p>}
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            <span className={`badge ${table.is_published ? 'badge-green' : 'badge-grey'}`}>
              {table.is_published ? 'Published' : 'Draft'}
            </span>
            <span className="badge badge-grey">{table.config.columns.filter((c) => c.visible).length} columns</span>
          </div>
        </div>

        <div className="table-card__actions">
          <Link to={`/builder/${table.id}`} className="btn btn-secondary btn-sm">Edit</Link>
          {table.is_published && (
            <>
              <Link to={`/t/${table.slug}`} target="_blank" className="btn btn-secondary btn-sm">View ↗</Link>
              <button className="btn btn-ghost btn-sm" onClick={copyLink}>Copy link</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setEmbedding(true)}>Embed</button>
            </>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => setAnalytics(true)}>
            Analytics
          </button>
          {isOwner && (
            <>
              <button
                className={`btn btn-sm ${table.is_published ? 'btn-secondary' : 'btn-primary'}`}
                onClick={() => void togglePublish()}
                disabled={busy}
              >
                {table.is_published ? 'Unpublish' : 'Publish'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setSharing(true)}>
                Share
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setTransferring(true)}>
                Transfer
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setAuditing(true)}>
                History
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => void duplicateTable()} disabled={busy}>
                Duplicate
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => void deleteTable()} disabled={busy}>
                Delete
              </button>
            </>
          )}
        </div>

        <p className="table-card__date text-xs text-muted">
          Updated {new Date(table.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
        </p>
      </div>

      {sharing && (
        <ShareModal
          tableId={table.id}
          tableTitle={table.title}
          onClose={() => setSharing(false)}
        />
      )}
      {transferring && (
        <TransferOwnershipModal
          kind="table"
          id={table.id}
          title={table.title}
          onClose={() => setTransferring(false)}
          onDone={onUpdate}
        />
      )}
      {embedding && (
        <EmbedModal
          tableTitle={table.title}
          tableSlug={table.slug}
          onClose={() => setEmbedding(false)}
        />
      )}
      {auditing && (
        <AuditModal
          tableId={table.id}
          tableTitle={table.title}
          onClose={() => setAuditing(false)}
        />
      )}
      {analytics && (
        <AnalyticsModal
          tableId={table.id}
          title={table.title}
          onClose={() => setAnalytics(false)}
        />
      )}
    </>
  );
}
