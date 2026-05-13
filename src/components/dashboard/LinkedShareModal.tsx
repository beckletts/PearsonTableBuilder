import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { LinkedDashboardShare } from '../../lib/types';
import './ShareModal.css';

interface Props {
  dashboardId: string;
  dashboardTitle: string;
  onClose: () => void;
}

export default function LinkedShareModal({ dashboardId, dashboardTitle, onClose }: Props) {
  const [email, setEmail]   = useState('');
  const [shares, setShares] = useState<LinkedDashboardShare[]>([]);
  const [error, setError]   = useState('');
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data } = await supabase
      .from('linked_dashboard_shares')
      .select('*')
      .eq('dashboard_id', dashboardId)
      .order('created_at');
    setShares((data as LinkedDashboardShare[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { void load(); }, [dashboardId]);

  const addShare = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const trimmed = email.trim().toLowerCase();
    if (!trimmed.endsWith('@pearson.com')) {
      setError('Only @pearson.com email addresses can be added.');
      return;
    }
    if (shares.find((s) => s.collaborator_email === trimmed)) {
      setError('This person already has access.');
      return;
    }
    setAdding(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error: insertErr } = await supabase.from('linked_dashboard_shares').insert({
      dashboard_id: dashboardId,
      owner_id: user!.id,
      collaborator_email: trimmed,
    });
    if (insertErr) {
      setError(insertErr.message);
    } else {
      setEmail('');
      void load();
    }
    setAdding(false);
  };

  const removeShare = async (id: string) => {
    await supabase.from('linked_dashboard_shares').delete().eq('id', id);
    void load();
  };

  return (
    <div className="share-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="share-modal">
        <div className="share-modal__header">
          <div>
            <h2 className="share-modal__title">Share dashboard</h2>
            <p className="share-modal__sub">{dashboardTitle}</p>
          </div>
          <button className="share-modal__close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <form onSubmit={(e) => void addShare(e)} className="share-modal__form">
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@pearson.com"
              required
            />
            <button className="btn btn-primary" type="submit" disabled={adding}>
              {adding ? 'Adding…' : 'Share'}
            </button>
          </div>
          {error && <p className="error-msg mt-8">{error}</p>}
        </form>

        <div className="share-modal__list">
          <p className="text-sm font-600 text-soft" style={{ marginBottom: 8 }}>
            {loading ? 'Loading…' : shares.length === 0 ? 'No one else has access yet.' : `${shares.length} ${shares.length === 1 ? 'person' : 'people'} have access`}
          </p>
          {shares.map((share) => (
            <div key={share.id} className="share-modal__person">
              <div className="share-modal__avatar">{share.collaborator_email[0].toUpperCase()}</div>
              <div>
                <p className="share-modal__email">{share.collaborator_email}</p>
                <p className="text-xs text-muted">
                  Added {new Date(share.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} · Can view
                </p>
              </div>
              <button className="btn btn-danger btn-sm" style={{ marginLeft: 'auto' }} onClick={() => void removeShare(share.id)}>
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
