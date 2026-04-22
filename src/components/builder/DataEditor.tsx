import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { TableConfig, TableRow } from '../../lib/types';
import './DataEditor.css';

interface Props {
  tableId: string;
  config: TableConfig;
  initialRows: TableRow[];
  onSaved: () => void;
}

interface EditRow {
  _id?: string;
  _new?: boolean;
  [key: string]: string | boolean | undefined;
}

export default function DataEditor({ tableId, config, initialRows, onSaved }: Props) {
  const visibleCols = config.columns.filter((c) => c.visible);
  const allCols = config.columns;

  const [rows, setRows] = useState<EditRow[]>(() =>
    initialRows.map((r) => ({
      _id: r.id,
      ...Object.fromEntries(allCols.map((c) => [c.key, String(r.data[c.key] ?? '')])),
    })),
  );

  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setDirty(false); setSaved(false); }, [initialRows]);

  const displayCols = showHidden ? allCols : visibleCols;

  const updateCell = (rowIdx: number, key: string, val: string) => {
    setRows((prev) => {
      const next = [...prev];
      next[rowIdx] = { ...next[rowIdx], [key]: val };
      return next;
    });
    setDirty(true);
    setSaved(false);
  };

  const addRow = () => {
    const blank: EditRow = { _new: true };
    for (const col of allCols) blank[col.key] = '';
    setRows((r) => [...r, blank]);
    setDirty(true);
    setSaved(false);
    setTimeout(() => {
      tableRef.current?.scrollTo({ top: tableRef.current.scrollHeight, behavior: 'smooth' });
    }, 50);
  };

  const deleteRow = (idx: number) => {
    setRows((prev) => prev.filter((_, i) => i !== idx));
    setDirty(true);
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await supabase.from('table_rows').delete().eq('table_id', tableId);

      const BATCH = 500;
      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH).map((row, j) => {
          const data: Record<string, string | number | null> = {};
          for (const col of allCols) {
            const v = String(row[col.key] ?? '');
            data[col.key] = col.type === 'number' && v !== '' ? Number(v) : v || null;
          }
          return { table_id: tableId, data, row_index: i + j };
        });
        const { error: insertErr } = await supabase.from('table_rows').insert(batch);
        if (insertErr) throw insertErr;
      }

      await supabase.from('tables').update({ updated_at: new Date().toISOString() }).eq('id', tableId);
      setDirty(false);
      setSaved(true);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="data-editor">
      <div className="data-editor__toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h3 className="data-editor__title">
            Edit data
            <span className="data-editor__count">{rows.length.toLocaleString()} rows</span>
          </h3>
          {dirty && <span className="badge badge-yellow">Unsaved changes</span>}
          {saved && !dirty && <span className="badge badge-green">Saved</span>}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label className="data-editor__toggle-hidden">
            <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} />
            Show hidden columns
          </label>
          <button className="btn btn-secondary btn-sm" onClick={addRow}>+ Add row</button>
          <button className="btn btn-primary" onClick={() => void save()} disabled={saving || !dirty}>
            {saving ? 'Saving…' : 'Save & publish'}
          </button>
        </div>
      </div>

      {error && <p className="error-msg" style={{ margin: '0 0 12px' }}>{error}</p>}

      <div className="data-editor__scroll" ref={tableRef}>
        <table className="data-editor__table">
          <thead>
            <tr>
              <th className="data-editor__th--action" />
              {displayCols.map((col) => (
                <th key={col.key} className={col.type === 'number' ? 'data-editor__th--num' : ''}>
                  <span>{col.label}</span>
                  {!col.visible && <span className="data-editor__hidden-tag">hidden</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={displayCols.length + 1} className="data-editor__empty">
                  No rows yet. Click "+ Add row" to start.
                </td>
              </tr>
            ) : (
              rows.map((row, rowIdx) => (
                <tr key={rowIdx} className={row._new ? 'data-editor__row--new' : ''}>
                  <td className="data-editor__td--action">
                    <button
                      className="data-editor__delete-btn"
                      onClick={() => deleteRow(rowIdx)}
                      title="Delete row"
                    >
                      ✕
                    </button>
                  </td>
                  {displayCols.map((col) => (
                    <td key={col.key}>
                      <input
                        className="data-editor__cell-input"
                        type={col.type === 'number' ? 'number' : 'text'}
                        value={String(row[col.key] ?? '')}
                        onChange={(e) => updateCell(rowIdx, col.key, e.target.value)}
                      />
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="data-editor__footer">
        <button className="btn btn-secondary btn-sm" onClick={addRow}>+ Add row</button>
        {rows.length > 100 && (
          <span className="text-xs text-muted">Large datasets may take a few seconds to save.</span>
        )}
      </div>
    </div>
  );
}
