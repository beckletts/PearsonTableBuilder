import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import PearsonNav from '../components/layout/PearsonNav';
import StepCustomise from '../components/builder/StepCustomise';
import StepUpload from '../components/builder/StepUpload';
import type { ParsedFile, TableRecord, TableRow } from '../lib/types';
import './BuilderPage.css';

export default function BuilderEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [table, setTable] = useState<TableRecord | null>(null);
  const [existingRows, setExistingRows] = useState<TableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reupload, setReupload] = useState(false);
  const [newParsed, setNewParsed] = useState<ParsedFile | null>(null);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      const [{ data: t }, { data: rows }] = await Promise.all([
        supabase.from('tables').select('*').eq('id', id).single(),
        supabase.from('table_rows').select('*').eq('table_id', id).order('row_index'),
      ]);
      if (!t) { setError('Table not found.'); setLoading(false); return; }
      setTable(t as TableRecord);
      setExistingRows((rows as TableRow[]) ?? []);
      setLoading(false);
    };
    void load();
  }, [id]);

  if (loading) return (
    <div>
      <PearsonNav />
      <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
        <div className="spinner spinner-lg" />
      </div>
    </div>
  );

  if (error || !table) return (
    <div>
      <PearsonNav />
      <div style={{ maxWidth: 600, margin: '80px auto', padding: '0 24px' }}>
        <p className="error-msg">{error || 'Table not found.'}</p>
        <button className="btn btn-secondary mt-16" onClick={() => navigate('/dashboard')}>← Dashboard</button>
      </div>
    </div>
  );

  const existingParsed: ParsedFile = {
    headers: table.config.columns.map((c) => c.key),
    rows: existingRows.map((r) => Object.fromEntries(Object.entries(r.data).map(([k, v]) => [k, String(v ?? '')]))),
  };

  const activeParsed = newParsed ?? existingParsed;

  return (
    <div>
      <PearsonNav />
      <main className="builder-page">
        {reupload && !newParsed ? (
          <div className="builder-page__content card">
            <div style={{ marginBottom: 20 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setReupload(false)}>← Cancel re-upload</button>
            </div>
            <StepUpload onParsed={(data) => { setNewParsed(data); setReupload(false); }} />
          </div>
        ) : (
          <div className="builder-page__content card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('/dashboard')}>← Dashboard</button>
              <button className="btn btn-secondary btn-sm" onClick={() => setReupload(true)}>
                Replace data
              </button>
            </div>
            <StepCustomise
              parsed={activeParsed}
              config={table.config}
              onBack={() => navigate('/dashboard')}
              editingId={table.id}
            />
          </div>
        )}
      </main>
    </div>
  );
}
