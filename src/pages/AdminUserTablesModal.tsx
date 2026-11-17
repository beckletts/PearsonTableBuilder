import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { isAllowedEmailDomain, ALLOWED_DOMAINS_LABEL } from '../lib/allowedDomains';
import './AdminUserTablesModal.css';

interface AdminTable {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  is_published: boolean;
  tab_group_id: string | null;
  column_count: number;
  row_count: number;
  views_all_time: number;
  views_90d: number;
  last_viewed_at: string | null;
  updated_at: string;
  shared_with: string[];
}

interface Props {
  userId: string;
  userLabel: string;
  onClose: () => void;
}

function formatDate(iso: string | null): string {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function AdminUserTablesModal({ userId, userLabel, onClose }: Props) {
  const [tables, setTables] = useState<AdminTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sharingFor, setSharingFor] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error: rpcError } = await supabase.rpc('admin_list_user_tables', { p_user_id: userId });
    if (rpcError) setError(rpcError.message);
    else setTables((data as AdminTable[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { void load(); }, [userId]);

  const share = async (tableId: string) => {
    setError('');
    const trimmed = email.trim().toLowerCase();
    if (!isAllowedEmailDomain(trimmed)) {
      setError(`Only ${ALLOWED_DOMAINS_LABEL} email addresses can be given access.`);
      return;
    }
    setBusy(true);
    const { error: rpcError } = await supabase.rpc('admin_share_table', {
      p_table_id: tableId,
      p_email: trimmed,
    });
    setBusy(false);
    if (rpcError) { setError(rpcError.message); return; }
    setEmail('');
    setSharingFor(null);
    await load();
  };

  const unshare = async (tableId: string, collaborator: string) => {
    if (!confirm(`Remove ${collaborator}'s access to this table?`)) return;
    setBusy(true);
    const { error: rpcError } = await supabase.rpc('admin_unshare_table', {
      p_table_id: tableId,
      p_email: collaborator,
    });
    setBusy(false);
    if (rpcError) { setError(rpcError.message); return; }
    await load();
  };

  const published = tables.filter((t) => t.is_published).length;
  const used = tables.filter((t) => t.views_90d > 0).length;

  return (
    <div className="aut-overlay" onClick={onClose}>
      <div className="aut-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Tables owned by ${userLabel}`}>
        <div className="aut-header">
          <div>
            <h2 className="aut-title">{userLabel}</h2>
            <p className="aut-sub">
              {loading ? 'Loading…' : (
                <>
                  {tables.length} {tables.length === 1 ? 'table' : 'tables'} · {published} published ·{' '}
                  {used} viewed in the last 90 days
                </>
              )}
            </p>
          </div>
          <button className="aut-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {error && <p className="error-msg" style={{ margin: '0 20px 12px' }}>{error}</p>}

        <div className="aut-body">
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
              <div className="spinner spinner-lg" />
            </div>
          ) : tables.length === 0 ? (
            <p className="aut-empty">This person doesn’t own any tables.</p>
          ) : (
            tables.map((t) => (
              <div key={t.id} className="aut-row">
                <div className="aut-row__main">
                  <div className="aut-row__head">
                    <span className="aut-row__title">{t.title}</span>
                    <span className={`badge ${t.is_published ? 'badge-green' : 'badge-grey'}`}>
                      {t.is_published ? 'Published' : 'Draft'}
                    </span>
                    {t.tab_group_id && <span className="badge badge-purple">Tab</span>}
                  </div>

                  {/* Views over 90 days say what is in use; all-time rewards age */}
                  <div className="aut-row__stats">
                    <span className="aut-stat">
                      <strong>{Number(t.views_90d).toLocaleString()}</strong> views · 90 days
                    </span>
                    <span className="aut-stat">{Number(t.views_all_time).toLocaleString()} all time</span>
                    <span className="aut-stat">Last viewed {formatDate(t.last_viewed_at)}</span>
                    <span className="aut-stat">{Number(t.row_count).toLocaleString()} rows · {t.column_count} columns</span>
                    <span className="aut-stat">Updated {formatDate(t.updated_at)}</span>
                  </div>

                  {t.shared_with.length > 0 && (
                    <div className="aut-row__shares">
                      <span className="aut-shares__label">Shared with</span>
                      {t.shared_with.map((collaborator) => (
                        <span key={collaborator} className="aut-chip">
                          {collaborator}
                          <button
                            className="aut-chip__remove"
                            onClick={() => void unshare(t.id, collaborator)}
                            disabled={busy}
                            aria-label={`Remove ${collaborator}`}
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  {sharingFor === t.id && (
                    <form
                      className="aut-row__share-form"
                      onSubmit={(e) => { e.preventDefault(); void share(t.id); }}
                    >
                      <input
                        className="input"
                        type="email"
                        value={email}
                        autoFocus
                        placeholder="colleague@pearson.com"
                        onChange={(e) => setEmail(e.target.value)}
                        aria-label="Email address to give access to"
                      />
                      <button className="btn btn-primary btn-sm" type="submit" disabled={busy}>
                        {busy ? 'Adding…' : 'Give access'}
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        type="button"
                        onClick={() => { setSharingFor(null); setEmail(''); setError(''); }}
                      >
                        Cancel
                      </button>
                    </form>
                  )}
                </div>

                <div className="aut-row__actions">
                  {t.is_published && (
                    <a className="btn btn-secondary btn-sm" href={`/t/${t.slug}`} target="_blank" rel="noreferrer">
                      View ↗
                    </a>
                  )}
                  {sharingFor !== t.id && (
                    <button className="btn btn-ghost btn-sm" onClick={() => { setSharingFor(t.id); setError(''); }}>
                      Give access
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <p className="aut-foot">
          Giving access lets that person edit and republish the table, and it is recorded against
          your account in the table’s history. The owner keeps control and can remove it themselves.
        </p>
      </div>
    </div>
  );
}
