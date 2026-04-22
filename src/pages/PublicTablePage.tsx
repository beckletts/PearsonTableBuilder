import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { TableRecord, TableRow } from '../lib/types';
import InteractiveTable from '../components/table/InteractiveTable';
import PearsonNav from '../components/layout/PearsonNav';
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
    <div>
      <PearsonNav />
      <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
        <div className="spinner spinner-lg" />
      </div>
    </div>
  );

  if (notFound || !table) return (
    <div>
      <PearsonNav />
      <div className="public-table__not-found">
        <h1>Table not found</h1>
        <p className="text-soft mt-8">This table doesn't exist or hasn't been published yet.</p>
      </div>
    </div>
  );

  return (
    <div>
      <PearsonNav />
      <main className="public-table">
        <div className="public-table__header">
          <h1 className="public-table__title">{table.title}</h1>
          {table.description && <p className="public-table__desc">{table.description}</p>}
          <p className="text-xs text-muted mt-8">
            {rows.length.toLocaleString()} records · Last updated {new Date(table.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <InteractiveTable config={table.config} rows={rows} />
        <div className="public-table__footer">
          <span>Built with Pearson Table Builder</span>
        </div>
      </main>
    </div>
  );
}
