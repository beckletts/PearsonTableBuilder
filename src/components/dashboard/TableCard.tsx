import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type { TableRecord } from '../../lib/types';
import './TableCard.css';

interface Props {
  table: TableRecord;
  onUpdate: () => void;
}

export default function TableCard({ table, onUpdate }: Props) {
  const [busy, setBusy] = useState(false);

  const togglePublish = async () => {
    setBusy(true);
    await supabase.from('tables').update({ is_published: !table.is_published }).eq('id', table.id);
    onUpdate();
    setBusy(false);
  };

  const deleteTable = async () => {
    if (!confirm(`Delete "${table.title}"? This cannot be undone.`)) return;
    setBusy(true);
    await supabase.from('tables').delete().eq('id', table.id);
    onUpdate();
    setBusy(false);
  };

  const copyLink = () => {
    void navigator.clipboard.writeText(`${window.location.origin}/t/${table.slug}`);
  };

  const rowCount = (table.config as { _rowCount?: number })._rowCount;

  return (
    <div className="table-card card">
      <div className="table-card__top">
        <div>
          <h3 className="table-card__title">{table.title}</h3>
          {table.description && <p className="table-card__desc">{table.description}</p>}
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            <span className={`badge ${table.is_published ? 'badge-green' : 'badge-grey'}`}>
              {table.is_published ? 'Published' : 'Draft'}
            </span>
            {rowCount && <span className="badge badge-grey">{rowCount.toLocaleString()} rows</span>}
            <span className="badge badge-grey">{table.config.columns.filter((c) => c.visible).length} columns</span>
          </div>
        </div>
      </div>

      <div className="table-card__actions">
        <Link to={`/builder/${table.id}`} className="btn btn-secondary btn-sm">Edit</Link>
        {table.is_published && (
          <>
            <Link to={`/t/${table.slug}`} target="_blank" className="btn btn-secondary btn-sm">View ↗</Link>
            <button className="btn btn-ghost btn-sm" onClick={copyLink}>Copy link</button>
          </>
        )}
        <button
          className={`btn btn-sm ${table.is_published ? 'btn-secondary' : 'btn-primary'}`}
          onClick={() => void togglePublish()}
          disabled={busy}
        >
          {table.is_published ? 'Unpublish' : 'Publish'}
        </button>
        <button className="btn btn-danger btn-sm" onClick={() => void deleteTable()} disabled={busy}>
          Delete
        </button>
      </div>

      <p className="table-card__date text-xs text-muted">
        Updated {new Date(table.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
      </p>
    </div>
  );
}
