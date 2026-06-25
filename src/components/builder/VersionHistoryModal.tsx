import { useEffect, useState } from 'react';
import { listSnapshots, restoreSnapshot, type SnapshotMeta } from '../../utils/snapshots';
import './VersionHistoryModal.css';

interface Props {
  tableId: string;
  tableTitle: string;
  onClose: () => void;
  onRestored: () => void;
}

const reasonLabel = (reason: string) => {
  switch (reason) {
    case 'Before republish':       return 'Snapshot before republishing';
    case 'Before save':            return 'Snapshot before saving';
    case 'Auto-saved before restore': return 'Auto-saved before a restore';
    default:                       return reason || 'Snapshot';
  }
};

export default function VersionHistoryModal({ tableId, tableTitle, onClose, onRestored }: Props) {
  const [snapshots, setSnapshots] = useState<SnapshotMeta[]>([]);
  const [loading, setLoading]     = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError]         = useState('');

  const load = () => {
    setLoading(true);
    listSnapshots(tableId)
      .then((data) => { setSnapshots(data); })
      .catch(() => { setUnavailable(true); })
      .finally(() => setLoading(false));
  };

  useEffect(load, [tableId]);

  const handleRestore = async (id: string) => {
    setRestoringId(id);
    setError('');
    try {
      await restoreSnapshot(id, tableId);
      onRestored();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Restore failed. Please try again.');
      setRestoringId(null);
      setConfirmId(null);
    }
  };

  return (
    <div className="vh-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="vh-modal">
        <div className="vh-modal__header">
          <div>
            <h2 className="vh-modal__title">Version history</h2>
            <p className="vh-modal__sub">{tableTitle}</p>
          </div>
          <button className="vh-modal__close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="vh-modal__body">
          <p className="vh-modal__intro">
            Each time this table is republished or restored, the previous live version is saved here.
            Restore one if you published something by mistake — the current version is kept too, so a restore can be undone.
          </p>

          {loading ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : unavailable ? (
            <p className="text-sm text-muted">
              Version history is not available yet. Run <strong>migration-v8.sql</strong> in your Supabase SQL editor to enable it.
            </p>
          ) : snapshots.length === 0 ? (
            <p className="text-sm text-muted">
              No previous versions yet. A restore point is saved automatically the next time you republish this table.
            </p>
          ) : (
            <div className="vh-modal__list">
              {snapshots.map((snap) => (
                <div key={snap.id} className="vh-modal__entry">
                  <div className="vh-modal__entry-icon">🕑</div>
                  <div className="vh-modal__entry-detail">
                    <p className="vh-modal__entry-reason">{reasonLabel(snap.reason)}</p>
                    <p className="text-xs text-muted">
                      {new Date(snap.created_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                      {' · '}{snap.row_count.toLocaleString()} rows
                      {snap.user_email ? ` · ${snap.user_email}` : ''}
                    </p>
                  </div>
                  {confirmId === snap.id ? (
                    <div className="vh-modal__confirm">
                      <span className="text-xs text-soft">Restore this version?</span>
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={restoringId !== null}
                        onClick={() => void handleRestore(snap.id)}
                      >
                        {restoringId === snap.id ? 'Restoring…' : 'Yes, restore'}
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={restoringId !== null}
                        onClick={() => setConfirmId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      className="btn btn-secondary btn-sm vh-modal__restore"
                      disabled={restoringId !== null}
                      onClick={() => setConfirmId(snap.id)}
                    >
                      Restore
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {error && <p className="error-msg mt-12">{error}</p>}
        </div>
      </div>
    </div>
  );
}
