import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { isAllowedEmailDomain, ALLOWED_DOMAINS_LABEL } from '../lib/allowedDomains';
import '../components/dashboard/TransferOwnershipModal.css';

interface Props {
  fromUserId: string;
  fromLabel: string;
  tableCount: number;
  dashboardCount: number;
  onClose: () => void;
  onDone: () => void;
}

export default function AdminReassignModal({
  fromUserId, fromLabel, tableCount, dashboardCount, onClose, onDone,
}: Props) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tables: number; dashboards: number } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const trimmed = email.trim().toLowerCase();
    if (!isAllowedEmailDomain(trimmed)) {
      setError(`Enter a valid email address (${ALLOWED_DOMAINS_LABEL}).`);
      return;
    }
    setBusy(true);
    const { data, error: rpcError } = await supabase.rpc('admin_transfer_all_ownership', {
      p_from_user: fromUserId,
      p_new_owner_email: trimmed,
    });
    setBusy(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    setResult({ tables: row?.tables_moved ?? 0, dashboards: row?.dashboards_moved ?? 0 });
    onDone();
  };

  return (
    <div className="transfer-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="transfer-modal">
        <div className="transfer-modal__header">
          <div>
            <h2 className="transfer-modal__title">Reassign all content</h2>
            <p className="transfer-modal__sub">{fromLabel}</p>
          </div>
          <button className="transfer-modal__close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {result ? (
          <div style={{ padding: '16px 24px 24px' }}>
            <p className="transfer-modal__note" style={{ padding: 0 }}>
              Moved <strong>{result.tables}</strong> table{result.tables === 1 ? '' : 's'} and{' '}
              <strong>{result.dashboards}</strong> dashboard{result.dashboards === 1 ? '' : 's'} to {email.trim().toLowerCase()}.
            </p>
            <div className="transfer-modal__actions">
              <button type="button" className="btn btn-primary" onClick={onClose}>Done</button>
            </div>
          </div>
        ) : (
          <>
            <p className="transfer-modal__note">
              Transfers every table ({tableCount}) and linked dashboard ({dashboardCount}) owned by
              this user to a new owner. Public links and embeds are unaffected. Use this when someone
              leaves the business.
            </p>
            <form onSubmit={(e) => void submit(e)}>
              <label className="transfer-modal__label" htmlFor="reassign-email">New owner’s Pearson email</label>
              <input
                id="reassign-email"
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="colleague@pearson.com"
                autoFocus
                required
              />
              <p className="transfer-modal__hint">They must have signed in to the platform at least once.</p>

              {error && <p className="error-msg mt-8">{error}</p>}

              <div className="transfer-modal__actions">
                <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {busy ? 'Reassigning…' : 'Reassign everything'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
