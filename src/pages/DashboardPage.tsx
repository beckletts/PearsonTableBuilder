import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';
import type { TableRecord } from '../lib/types';
import PearsonNav from '../components/layout/PearsonNav';
import TableCard from '../components/dashboard/TableCard';
import './DashboardPage.css';

interface Props { user: User }

export default function DashboardPage({ user }: Props) {
  const [tables, setTables] = useState<TableRecord[]>([]);
  const [sharedTables, setSharedTables] = useState<TableRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const userEmail = user.email ?? '';

    const [{ data: ownData }, { data: shareData }] = await Promise.all([
      supabase.from('tables').select('*').eq('owner_id', user.id).order('updated_at', { ascending: false }),
      supabase.from('table_shares').select('table_id').eq('collaborator_email', userEmail),
    ]);

    setTables((ownData as TableRecord[]) ?? []);

    if (shareData && shareData.length > 0) {
      const ids = shareData.map((s: { table_id: string }) => s.table_id);
      const { data: sharedData } = await supabase
        .from('tables')
        .select('*')
        .in('id', ids)
        .order('updated_at', { ascending: false });
      setSharedTables((sharedData as TableRecord[]) ?? []);
    } else {
      setSharedTables([]);
    }

    setLoading(false);
  };

  useEffect(() => { void load(); }, [user.id]);

  return (
    <div>
      <PearsonNav user={user} />
      <main className="dashboard">
        <div className="dashboard__header">
          <div>
            <h1 className="dashboard__title">My tables</h1>
            <p className="text-soft mt-4">Create and manage your Pearson interactive tables</p>
          </div>
          <Link to="/builder/new" className="btn btn-primary">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
            New table
          </Link>
        </div>

        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
            <div className="spinner spinner-lg" />
          </div>
        )}

        {!loading && tables.length === 0 && sharedTables.length === 0 && (
          <div className="dashboard__empty card">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18M3 15h18M9 3v18" />
            </svg>
            <h2 style={{ marginTop: 16, fontSize: 20, fontWeight: 700 }}>No tables yet</h2>
            <p className="text-soft mt-8">Upload a spreadsheet to create your first interactive table.</p>
            <Link to="/builder/new" className="btn btn-primary" style={{ marginTop: 20 }}>Create first table →</Link>
          </div>
        )}

        {!loading && tables.length > 0 && (
          <div className="dashboard__grid">
            {tables.map((t) => (
              <TableCard key={t.id} table={t} isOwner={true} onUpdate={() => void load()} />
            ))}
          </div>
        )}

        {!loading && sharedTables.length > 0 && (
          <>
            <div className="dashboard__section-heading">
              <h2>Shared with me</h2>
              <p className="text-soft text-sm">Tables others have shared with your account</p>
            </div>
            <div className="dashboard__grid">
              {sharedTables.map((t) => (
                <TableCard key={t.id} table={t} isOwner={false} onUpdate={() => void load()} />
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
