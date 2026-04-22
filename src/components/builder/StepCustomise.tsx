import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { generateUniqueSlug } from '../../utils/generateSlug';
import type { ColumnConfig, ParsedFile, TableConfig, Widget } from '../../lib/types';
import ColumnEditor from './ColumnEditor';
import WidgetBuilder from './WidgetBuilder';
import InteractiveTable from '../table/InteractiveTable';
import './StepCustomise.css';

interface Props {
  parsed: ParsedFile;
  config: TableConfig;
  onBack: () => void;
  editingId?: string;
  groupId?: string;
  tabOrder?: number;
}

export default function StepCustomise({ parsed, config: initialConfig, onBack, editingId, groupId, tabOrder = 0 }: Props) {
  const navigate = useNavigate();
  const [config, setConfig] = useState<TableConfig>(initialConfig);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const previewRows = parsed.rows.map((r, i) => ({
    id: String(i),
    table_id: 'preview',
    data: r as Record<string, string | number | null>,
    row_index: i,
    created_at: '',
  }));

  const updateColumn = (i: number, updated: ColumnConfig) => {
    setConfig((c) => {
      const cols = [...c.columns];
      cols[i] = updated;
      return { ...c, columns: cols };
    });
  };

  const reorderColumns = (fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;
    setConfig((c) => {
      const cols = [...c.columns];
      const [moved] = cols.splice(fromIdx, 1);
      cols.splice(toIdx, 0, moved);
      return { ...c, columns: cols };
    });
  };

  const updateWidgets = (widgets: Widget[]) => setConfig((c) => ({ ...c, widgets }));

  const save = async (publish: boolean) => {
    setSaving(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Your session has expired. Please refresh the page and log in again — your column settings will be preserved.');
        setSaving(false);
        return;
      }
      const user = session.user;

      const finalConfig = { ...config, title: config.title.trim() || 'Untitled Table' };

      if (editingId) {
        const { error: upErr } = await supabase
          .from('tables')
          .update({ title: finalConfig.title, description: finalConfig.description, config: finalConfig, is_published: publish })
          .eq('id', editingId);
        if (upErr) throw upErr;

        await supabase.from('table_rows').delete().eq('table_id', editingId);
        await insertRows(editingId, parsed.rows);
        navigate('/dashboard');
      } else {
        const slug = await generateUniqueSlug(finalConfig.title);
        const { data: table, error: tErr } = await supabase
          .from('tables')
          .insert({ owner_id: user.id, title: finalConfig.title, description: finalConfig.description, slug, config: finalConfig, is_published: publish, tab_group_id: groupId ?? null, tab_order: tabOrder })
          .select()
          .single();
        if (tErr) throw tErr;

        await insertRows(table.id, parsed.rows);

        if (publish) {
          await navigator.clipboard.writeText(`${window.location.origin}/t/${slug}`).catch(() => null);
        }
        navigate('/dashboard');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : (e as { message?: string })?.message;
      setError(msg || 'Save failed. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="step-customise">
      <div className="step-customise__layout">
        <div className="step-customise__sidebar">
          <h2 className="step-customise__heading">Customise your table</h2>

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="input-group" style={{ marginBottom: 14 }}>
              <label className="input-label">Table title</label>
              <input
                className="input"
                value={config.title}
                onChange={(e) => setConfig((c) => ({ ...c, title: e.target.value }))}
                placeholder="e.g. Pearson BTEC Qualifications"
              />
            </div>
            <div className="input-group">
              <label className="input-label">Description <span className="text-muted">(optional)</span></label>
              <textarea
                className="input"
                value={config.description}
                onChange={(e) => setConfig((c) => ({ ...c, description: e.target.value }))}
                placeholder="Brief description shown above the table"
                rows={2}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <p className="text-sm font-600 text-soft">Columns <span className="text-muted font-600" style={{ fontSize: 11 }}>— drag to reorder</span></p>
            <p className="text-xs text-muted">{config.columns.filter((c) => c.visible).length} visible</p>
          </div>
          <div className="step-customise__cols">
            {config.columns.map((col, i) => (
              <ColumnEditor
                key={col.key}
                column={col}
                onChange={(u) => updateColumn(i, u)}
                isDragging={dragIdx === i}
                onDragStart={() => setDragIdx(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragIdx !== null) reorderColumns(dragIdx, i);
                  setDragIdx(null);
                }}
              />
            ))}
          </div>

          <WidgetBuilder config={config} parsed={parsed} onChange={updateWidgets} />

          {error && <p className="error-msg mt-16">{error}</p>}

          <div style={{ display: 'flex', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" onClick={onBack} disabled={saving}>← Back</button>
            <button className="btn btn-secondary" onClick={() => save(false)} disabled={saving}>
              {saving ? 'Saving…' : 'Save draft'}
            </button>
            <button className="btn btn-primary" onClick={() => save(true)} disabled={saving}>
              {saving ? 'Publishing…' : 'Publish →'}
            </button>
          </div>
        </div>

        <div className="step-customise__preview">
          <div style={{ padding: 24 }}>
            <p className="text-sm font-600 text-soft" style={{ marginBottom: 12 }}>Live preview</p>
            <InteractiveTable config={config} rows={previewRows} />
          </div>
        </div>
      </div>
    </div>
  );
}

async function insertRows(tableId: string, rows: Record<string, string>[]): Promise<void> {
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH).map((data, j) => ({
      table_id: tableId,
      data: data as Record<string, string | number | null>,
      row_index: i + j,
    }));
    const { error } = await supabase.from('table_rows').insert(batch);
    if (error) throw error;
  }
}
