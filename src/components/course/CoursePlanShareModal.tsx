/**
 * Share a course plan with colleagues, to view or to edit.
 *
 * This is the private, named-colleague route. The public link is separate —
 * publishing the plan is what makes /cp/<slug> readable by anyone.
 */
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { ALLOWED_DOMAINS_LABEL, isAllowedEmailDomain } from '../../lib/allowedDomains';
import type { CoursePlanAccess, CoursePlanShare } from '../../lib/courseBuilder';
import '../dashboard/ShareModal.css';

interface Props {
  planId: string;
  planTitle: string;
  onClose: () => void;
}

export default function CoursePlanShareModal({ planId, planTitle, onClose }: Props) {
  const [email, setEmail] = useState('');
  const [accessLevel, setAccessLevel] = useState<CoursePlanAccess>('view');
  const [shares, setShares] = useState<CoursePlanShare[]>([]);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data } = await supabase
      .from('course_plan_shares')
      .select('*')
      .eq('plan_id', planId)
      .order('created_at');
    setShares((data as CoursePlanShare[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { void load(); }, [planId]);

  const addShare = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const trimmed = email.trim().toLowerCase();
    if (!isAllowedEmailDomain(trimmed)) {
      setError(`Only ${ALLOWED_DOMAINS_LABEL} email addresses can be added.`);
      return;
    }
    if (shares.find((s) => s.collaborator_email === trimmed)) {
      setError('This person already has access.');
      return;
    }
    setAdding(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error: insertErr } = await supabase.from('course_plan_shares').insert({
      plan_id: planId,
      owner_id: user!.id,
      collaborator_email: trimmed,
      access_level: accessLevel,
    });
    if (insertErr) {
      setError(insertErr.message);
    } else {
      setEmail('');
      setAccessLevel('view');
      void load();
    }
    setAdding(false);
  };

  const updateAccessLevel = async (id: string, level: CoursePlanAccess) => {
    await supabase.from('course_plan_shares').update({ access_level: level }).eq('id', id);
    setShares((prev) => prev.map((s) => (s.id === id ? { ...s, access_level: level } : s)));
  };

  const removeShare = async (id: string) => {
    await supabase.from('course_plan_shares').delete().eq('id', id);
    void load();
  };

  return (
    <div className="share-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="share-modal">
        <div className="share-modal__header">
          <div>
            <h2 className="share-modal__title">Share course plan</h2>
            <p className="share-modal__sub">{planTitle}</p>
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
            <select
              className="input"
              value={accessLevel}
              onChange={(e) => setAccessLevel(e.target.value as CoursePlanAccess)}
              style={{ width: 'auto', flexShrink: 0 }}
            >
              <option value="view">Can view</option>
              <option value="edit">Can edit</option>
            </select>
            <button className="btn btn-primary" type="submit" disabled={adding}>
              {adding ? 'Adding…' : 'Share'}
            </button>
          </div>
          {error && <p className="error-msg mt-8">{error}</p>}
        </form>

        <div className="share-modal__list">
          <p className="text-sm font-600 text-soft" style={{ marginBottom: 8 }}>
            {loading
              ? 'Loading…'
              : shares.length === 0
                ? 'No one else has access yet.'
                : `${shares.length} ${shares.length === 1 ? 'person' : 'people'} have access`}
          </p>
          {shares.map((share) => (
            <div key={share.id} className="share-modal__person">
              <div className="share-modal__avatar">{share.collaborator_email[0].toUpperCase()}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="share-modal__email">{share.collaborator_email}</p>
                <p className="text-xs text-muted">
                  Added {new Date(share.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
              <select
                className="input"
                value={share.access_level ?? 'view'}
                onChange={(e) => void updateAccessLevel(share.id, e.target.value as CoursePlanAccess)}
                style={{ width: 'auto', flexShrink: 0, fontSize: 12, padding: '4px 8px' }}
              >
                <option value="view">Can view</option>
                <option value="edit">Can edit</option>
              </select>
              <button className="btn btn-danger btn-sm" style={{ marginLeft: 8 }} onClick={() => void removeShare(share.id)}>
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
