import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';
import PearsonNav from '../components/layout/PearsonNav';
import './AdminPage.css';

interface UserStat {
  user_id: string;
  full_name: string | null;
  email: string | null;
  last_login_at: string | null;
  joined_at: string;
  table_count: number;
  dashboard_count: number;
  total_views: number;
}

interface Props { user: User }

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatRelative(iso: string | null): string {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 2) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

export default function AdminPage({ user }: Props) {
  const [stats, setStats] = useState<UserStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc('admin_user_stats');
    if (rpcError) {
      setError(rpcError.message);
    } else {
      setStats((data as UserStat[]) ?? []);
    }
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const filtered = stats.filter((u) => {
    const q = search.toLowerCase();
    return (
      (u.email ?? '').toLowerCase().includes(q) ||
      (u.full_name ?? '').toLowerCase().includes(q)
    );
  });

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const activeCount = stats.filter(
    (u) => u.last_login_at && new Date(u.last_login_at).getTime() > sevenDaysAgo
  ).length;
  const totalProjects = stats.reduce((acc, u) => acc + Number(u.table_count) + Number(u.dashboard_count), 0);
  const totalViews = stats.reduce((acc, u) => acc + Number(u.total_views), 0);

  return (
    <div>
      <PearsonNav user={user} />

      <main className="admin-page">
        <div className="admin-page__header">
          <div>
            <h1 className="admin-page__title">Admin panel</h1>
            <p className="text-soft mt-4">Platform overview and user management</p>
          </div>
          <button className="btn btn-secondary" onClick={() => void load()} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        {error && (
          <div className="admin-error">
            <strong>Error:</strong> {error}
          </div>
        )}

        <div className="admin-stats">
          <div className="admin-stat-card">
            <span className="admin-stat-card__value">{stats.length}</span>
            <span className="admin-stat-card__label">Total users</span>
          </div>
          <div className="admin-stat-card">
            <span className="admin-stat-card__value">{activeCount}</span>
            <span className="admin-stat-card__label">Active last 7 days</span>
          </div>
          <div className="admin-stat-card">
            <span className="admin-stat-card__value">{totalProjects}</span>
            <span className="admin-stat-card__label">Total projects</span>
          </div>
          <div className="admin-stat-card">
            <span className="admin-stat-card__value">{totalViews.toLocaleString()}</span>
            <span className="admin-stat-card__label">Total page views</span>
          </div>
        </div>

        <div className="admin-table-wrap">
          <div className="admin-table-toolbar">
            <input
              className="admin-search"
              type="search"
              placeholder="Search by name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <span className="admin-table-count">
              {filtered.length} {filtered.length === 1 ? 'user' : 'users'}
            </span>
          </div>

          {loading ? (
            <div className="admin-loading">Loading users…</div>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Joined</th>
                  <th>Last active</th>
                  <th className="admin-table__num">Tables</th>
                  <th className="admin-table__num">Dashboards</th>
                  <th className="admin-table__num">Views</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="admin-table__empty">No users found</td>
                  </tr>
                ) : (
                  filtered.map((u) => (
                    <tr key={u.user_id}>
                      <td>
                        <div className="admin-user-cell">
                          <div className="admin-avatar">
                            {(u.email ?? u.full_name ?? '?').charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="admin-user-name">{u.full_name || '—'}</div>
                            <div className="admin-user-email">{u.email ?? '—'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="admin-table__date">{formatDate(u.joined_at)}</td>
                      <td className="admin-table__date">
                        <span
                          className={
                            u.last_login_at && new Date(u.last_login_at).getTime() > sevenDaysAgo
                              ? 'admin-badge admin-badge--active'
                              : 'admin-badge'
                          }
                        >
                          {formatRelative(u.last_login_at)}
                        </span>
                      </td>
                      <td className="admin-table__num">{u.table_count}</td>
                      <td className="admin-table__num">{u.dashboard_count}</td>
                      <td className="admin-table__num">{Number(u.total_views).toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}
