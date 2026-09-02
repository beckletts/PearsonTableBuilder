import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { isAllowedEmailDomain, ALLOWED_DOMAINS_LABEL } from '../../lib/allowedDomains';
import './TransferOwnershipModal.css';

interface Props {
  kind: 'table' | 'dashboard' | 'course_plan';
  id: string;
  title: string;
  /** Set when the transfer is initiated by a super admin on someone else's behalf. */
  asAdmin?: boolean;
  onClose: () => void;
  onDone: () => void;
}

export default function TransferOwnershipModal({ kind, id, title, asAdmin, onClose, onDone }: Props) {
  const [email, setEmail] = useState('');
  const [keepAccess, setKeepAccess] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const noun = kind === 'table' ? 'table' : kind === 'dashboard' ? 'dashboard' : 'course builder';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const trimmed = email.trim().toLowerCase();
    if (!isAllowedEmailDomain(trimmed)) {
      setError(`Enter a valid email address (${ALLOWED_DOMAINS_LABEL}).`);
      return;
    }
    setBusy(true);
    const fn =
      kind === 'table'     ? 'transfer_table_ownership' :
      kind === 'dashboard' ? 'transfer_dashboard_ownership' :
                             'transfer_course_plan_ownership';
    const idParam =
      kind === 'table'     ? 'p_table_id' :
      kind === 'dashboard' ? 'p_dashboard_id' :
                             'p_plan_id';
    const { error: rpcError } = await supabase.rpc(fn, {
      [idParam]: id,
      p_new_owner_email: trimmed,
      p_keep_access: keepAccess,
    });
    setBusy(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    onDone();
    onClose();
  };

  return (
    <div className="transfer-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="transfer-modal">
        <div className="transfer-modal__header">
          <div>
            <h2 className="transfer-modal__title">Transfer ownership</h2>
            <p className="transfer-modal__sub">{title}</p>
          </div>
          <button className="transfer-modal__close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <p className="transfer-modal__note">
          The new owner gets full control of this {noun}
          {kind === 'table' ? ' and all of its tabs' : ''}. Its public link and any
          embeds stay the same. {asAdmin ? '' : 'You will lose owner access unless you keep it below.'}
        </p>

        <form onSubmit={(e) => void submit(e)}>
          <label className="transfer-modal__label" htmlFor="transfer-email">New owner’s Pearson email</label>
          <input
            id="transfer-email"
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="colleague@pearson.com"
            autoFocus
            required
          />
          <p className="transfer-modal__hint">
            They must have signed in to the platform at least once.
          </p>

          {!asAdmin && (
            <label className="transfer-modal__checkbox">
              <input
                type="checkbox"
                checked={keepAccess}
                onChange={(e) => setKeepAccess(e.target.checked)}
              />
              <span>Keep my access as a collaborator (I can still edit)</span>
            </label>
          )}

          {error && <p className="error-msg mt-8">{error}</p>}

          <div className="transfer-modal__actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Transferring…' : 'Transfer ownership'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
