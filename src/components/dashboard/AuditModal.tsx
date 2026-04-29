import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import './AuditModal.css';

interface AuditEntry {
  id: string;
  user_email: string;
  action: string;
  row_count: number;
  created_at: string;
}

interface Props {
  tableId: string;
  tableTitle: string;
  onClose: () => void;
}

export default function AuditModal({ tableId, tableTitle, onClose }: Props) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    supabase
      .from('table_audit_log')
      .select('id, user_email, action, row_count, created_at')
      .eq('table_id', tableId)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) { setUnavailable(true); }
        else { setEntries((data as AuditEntry[]) ?? []); }
        setLoading(false);
      });
  }, [tableId]);

  const actionLabel = (action: string) => {
    if (action === 'publish')    return 'Published';
    if (action === 'save_draft') return 'Saved as draft';
    return action;
  };

  const actionIcon = (action: string) => action === 'publish' ? '🌐' : '💾';

  return (
    <div className="audit-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="audit-modal">
        <div className="audit-modal__header">
          <div>
            <h2 className="audit-modal__title">Change history</h2>
            <p className="audit-modal__sub">{tableTitle}</p>
          </div>
          <button className="audit-modal__close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="audit-modal__body">
          {loading ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : unavailable ? (
            <p className="text-sm text-muted">Change history is not available yet. Run the migration-v3.sql in your Supabase SQL editor to enable it.</p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-muted">No changes recorded yet. History is tracked from the next save onwards.</p>
          ) : (
            <div className="audit-modal__list">
              {entries.map((entry) => (
                <div key={entry.id} className="audit-modal__entry">
                  <div className="audit-modal__entry-icon">{actionIcon(entry.action)}</div>
                  <div className="audit-modal__entry-detail">
                    <p className="audit-modal__entry-action">{actionLabel(entry.action)}</p>
                    <p className="text-xs text-muted">
                      {entry.user_email}
                      {' · '}
                      {entry.row_count.toLocaleString()} rows
                      {' · '}
                      {new Date(entry.created_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
