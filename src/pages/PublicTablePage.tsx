import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { TableRecord, TableRow } from '../lib/types';
import InteractiveTable from '../components/table/InteractiveTable';
import './PublicTablePage.css';

export default function PublicTablePage() {
  const { slug } = useParams<{ slug: string }>();
  const [table, setTable] = useState<TableRecord | null>(null);
  const [rows, setRows] = useState<TableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    const load = async () => {
      const { data: t } = await supabase
        .from('tables')
        .select('*')
        .eq('slug', slug)
        .eq('is_published', true)
        .single();

      if (!t) { setNotFound(true); setLoading(false); return; }

      const { data: rowData } = await supabase
        .from('table_rows')
        .select('*')
        .eq('table_id', t.id)
        .order('row_index');

      setTable(t as TableRecord);
      setRows((rowData as TableRow[]) ?? []);
      setLoading(false);
    };
    void load();
  }, [slug]);

  if (loading) return (
    <div className="public-page">
      <div className="public-page__header-bar" />
      <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
        <div className="spinner spinner-lg" style={{ borderTopColor: 'var(--pearson-purple)' }} />
      </div>
    </div>
  );

  if (notFound || !table) return (
    <div className="public-page">
      <div className="public-page__header-bar" />
      <div className="public-page__not-found">
        <h1>Table not found</h1>
        <p>This table doesn't exist or hasn't been published yet.</p>
      </div>
    </div>
  );

  return (
    <div className="public-page">
      <header className="public-page__header">
        <div className="public-page__header-inner">
          <PearsonLogo />
          <div className="public-page__header-text">
            <h1 className="public-page__title">{table.title}</h1>
            {table.description && (
              <p className="public-page__desc">{table.description}</p>
            )}
          </div>
        </div>
      </header>

      <main className="public-page__main">
        <div className="public-page__meta">
          <span>{rows.length.toLocaleString()} records</span>
          <span>·</span>
          <span>Updated {new Date(table.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
        </div>
        <InteractiveTable config={table.config} rows={rows} variant="pearson" />
      </main>

      <footer className="public-page__footer">
        <PearsonLogo small />
        <p>© {new Date().getFullYear()} Pearson plc. All rights reserved.</p>
      </footer>
    </div>
  );
}

function PearsonLogo({ small }: { small?: boolean }) {
  const size = small ? 28 : 48;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Pearson">
      <rect width="48" height="48" rx="8" fill="white" fillOpacity="0.15" />
      <path d="M12 10h14c5.523 0 10 4.477 10 10s-4.477 10-10 10H12V10z" fill="white" />
      <rect x="12" y="32" width="8" height="6" rx="2" fill="white" />
    </svg>
  );
}
