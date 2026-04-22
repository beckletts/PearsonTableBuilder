import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import PearsonNav from '../components/layout/PearsonNav';
import StepCustomise from '../components/builder/StepCustomise';
import StepUpload from '../components/builder/StepUpload';
import DataEditor from '../components/builder/DataEditor';
import type { ParsedFile, TableRecord, TableRow } from '../lib/types';
import './BuilderPage.css';
import './BuilderEditPage.css';

type Tab = 'configure' | 'data';

export default function BuilderEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [table, setTable] = useState<TableRecord | null>(null);
  const [existingRows, setExistingRows] = useState<TableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('configure');
  const [reupload, setReupload] = useState(false);
  const [newParsed, setNewParsed] = useState<ParsedFile | null>(null);

  const loadTable = async () => {
    if (!id) return;
    const [{ data: t }, { data: rows }] = await Promise.all([
      supabase.from('tables').select('*').eq('id', id).single(),
      supabase.from('table_rows').select('*').eq('table_id', id).order('row_index'),
    ]);
    if (!t) { setError('Table not found.'); setLoading(false); return; }
    setTable(t as TableRecord);
    setExistingRows((rows as TableRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { void loadTable(); }, [id]);

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
    rows: existingRows.map((r) =>
      Object.fromEntries(Object.entries(r.data).map(([k, v]) => [k, String(v ?? '')])),
    ),
  };
  const activeParsed = newParsed ?? existingParsed;

  return (
    <div>
      <PearsonNav />
      <main className="builder-page">
        <div className="builder-edit__header">
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/dashboard')}>← Dashboard</button>
          <div className="builder-edit__tabs">
            <button
              className={`builder-edit__tab ${tab === 'configure' ? 'builder-edit__tab--active' : ''}`}
              onClick={() => setTab('configure')}
            >
              Configure
            </button>
            <button
              className={`builder-edit__tab ${tab === 'data' ? 'builder-edit__tab--active' : ''}`}
              onClick={() => setTab('data')}
            >
              Edit data
              {existingRows.length > 0 && (
                <span className="builder-edit__tab-count">{existingRows.length.toLocaleString()}</span>
              )}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {tab === 'configure' && (
              <button className="btn btn-secondary btn-sm" onClick={() => setReupload(true)}>
                Replace data file
              </button>
            )}
            {!table.tab_group_id && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => navigate(`/builder/new?groupId=${table.id}&tabOrder=${existingRows.length > 0 ? 1 : 1}`)}
                title="Add a second dataset as a tab on the same published page"
              >
                + Add tab
              </button>
            )}
            {table.is_published && (
              <a
                href={`/t/${table.slug}`}
                target="_blank"
                rel="noreferrer"
                className="btn btn-secondary btn-sm"
              >
                View live ↗
              </a>
            )}
          </div>
        </div>

        <div className="builder-page__content card">
          {tab === 'configure' && (
            reupload && !newParsed ? (
              <div>
                <button className="btn btn-ghost btn-sm" style={{ marginBottom: 20 }} onClick={() => setReupload(false)}>
                  ← Cancel
                </button>
                <StepUpload onParsed={(data) => { setNewParsed(data); setReupload(false); }} />
              </div>
            ) : (
              <StepCustomise
                parsed={activeParsed}
                config={table.config}
                onBack={() => navigate('/dashboard')}
                editingId={table.id}
              />
            )
          )}

          {tab === 'data' && (
            <DataEditor
              tableId={table.id}
              config={table.config}
              initialRows={existingRows}
              onSaved={() => void loadTable()}
            />
          )}
        </div>
      </main>
    </div>
  );
}
