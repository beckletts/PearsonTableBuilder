import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { LinkedRow, LinkedSource } from '../../lib/types';
import './LinkedSourceEditor.css';

interface Props {
  source: LinkedSource;
  dashboardId: string;
  onClose: () => void;
  onSaved: (newRowCount: number) => void;
}

interface EditRow {
  _rowId?: string;
  _new?: boolean;
  [key: string]: string | boolean | undefined;
}

export default function LinkedSourceEditor({ source, dashboardId, onClose, onSaved }: Props) {
  const [rows, setRows]       = useState<EditRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty]     = useState(false);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [error, setError]     = useState('');

  // Selection + bulk edit
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkCol, setBulkCol]   = useState('');
  const [bulkVal, setBulkVal]   = useState('');

  const tableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      let allRows: LinkedRow[] = [];
      let from = 0;
      const BATCH = 1000;
      while (true) {
        const { data: batch } = await supabase
          .from('linked_rows')
          .select('*')
          .eq('source_id', source.id)
          .range(from, from + BATCH - 1)
          .order('row_index', { ascending: true });
        if (!batch || batch.length === 0) break;
        allRows = [...allRows, ...(batch as LinkedRow[])];
        if (batch.length < BATCH) break;
        from += BATCH;
      }

      // Union of all data keys across rows
      const headerSet = new Set<string>();
      for (const row of allRows) {
        for (const key of Object.keys(row.data)) headerSet.add(key);
      }
      const hdrs = Array.from(headerSet);
      setHeaders(hdrs);
      setRows(
        allRows.map((r) => ({
          _rowId: r.id,
          ...Object.fromEntries(hdrs.map((h) => [h, String(r.data[h] ?? '')])),
        })),
      );
      setLoading(false);
    };
    void load();
  }, [source.id]);

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
    for (const h of headers) blank[h] = '';
    setRows((r) => [...r, blank]);
    setDirty(true);
    setSaved(false);
    setTimeout(() => tableRef.current?.scrollTo({ top: tableRef.current.scrollHeight, behavior: 'smooth' }), 50);
  };

  const deleteRow = (idx: number) => {
    setRows((prev) => prev.filter((_, i) => i !== idx));
    setSelected(new Set());
    setDirty(true);
    setSaved(false);
  };

  const toggleSelect = (idx: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelected(selected.size === rows.length ? new Set() : new Set(rows.map((_, i) => i)));
  };

  const applyBulk = () => {
    if (!bulkCol || selected.size === 0) return;
    setRows((prev) => prev.map((r, i) => selected.has(i) ? { ...r, [bulkCol]: bulkVal } : r));
    setDirty(true);
    setSaved(false);
    setSelected(new Set());
    setBulkVal('');
  };

  const deleteSelected = () => {
    setRows((prev) => prev.filter((_, i) => !selected.has(i)));
    setDirty(true);
    setSaved(false);
    setSelected(new Set());
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await supabase.from('linked_rows').delete().eq('source_id', source.id);

      const BATCH = 500;
      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH).map((row, j) => ({
          dashboard_id: dashboardId,
          source_id: source.id,
          join_value: String(row[source.join_key_column] ?? '').trim(),
          data: Object.fromEntries(headers.map((h) => [h, row[h] ?? ''])),
          row_index: i + j,
        }));
        const { error: insertErr } = await supabase.from('linked_rows').insert(batch);
        if (insertErr) throw insertErr;
      }

      await supabase.from('linked_sources').update({ row_count: rows.length }).eq('id', source.id);
      setDirty(false);
      setSaved(true);
      onSaved(rows.length);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const allSelected  = rows.length > 0 && selected.size === rows.length;
  const someSelected = selected.size > 0 && selected.size < rows.length;

  if (loading) return (
    <div className="lse__loading">
      <div className="spinner" />
      <span className="text-sm text-muted">Loading {source.row_count.toLocaleString()} rows…</span>
    </div>
  );

  return (
    <div className="lse">
      {/* Toolbar */}
      <div className="lse__toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="lse__row-count">{rows.length.toLocaleString()} rows</span>
          {dirty && <span className="badge badge-yellow">Unsaved changes</span>}
          {saved && !dirty && <span className="badge badge-green">Saved</span>}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary btn-sm" onClick={addRow}>+ Add row</button>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => void save()}
            disabled={saving || !dirty}
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Close ✕</button>
        </div>
      </div>

      {/* Bulk edit bar */}
      {selected.size > 0 && (
        <div className="lse__bulk-bar">
          <span className="lse__bulk-label">{selected.size} row{selected.size !== 1 ? 's' : ''} selected</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>Clear</button>
          <div className="lse__bulk-edit">
            <select
              className="input lse__bulk-col"
              value={bulkCol}
              onChange={(e) => setBulkCol(e.target.value)}
            >
              <option value="">Edit column…</option>
              {headers.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
            <input
              className="input lse__bulk-val"
              value={bulkVal}
              onChange={(e) => setBulkVal(e.target.value)}
              placeholder="New value"
              disabled={!bulkCol}
              onKeyDown={(e) => { if (e.key === 'Enter') applyBulk(); }}
            />
            <button className="btn btn-primary btn-sm" onClick={applyBulk} disabled={!bulkCol}>
              Apply to {selected.size} row{selected.size !== 1 ? 's' : ''}
            </button>
          </div>
          <button className="btn btn-danger btn-sm" onClick={deleteSelected}>
            Delete {selected.size} row{selected.size !== 1 ? 's' : ''}
          </button>
        </div>
      )}

      {error && <p className="error-msg" style={{ margin: '0 0 10px' }}>{error}</p>}

      {/* Spreadsheet table */}
      <div className="lse__scroll" ref={tableRef}>
        <table className="lse__table">
          <thead>
            <tr>
              <th className="lse__th--check">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = someSelected; }}
                  onChange={toggleSelectAll}
                  title="Select all"
                />
              </th>
              <th className="lse__th--action" />
              {headers.map((h) => (
                <th key={h} className={h === source.join_key_column ? 'lse__th--join' : ''}>
                  {h}
                  {h === source.join_key_column && <span className="lse__join-tag">join key</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={headers.length + 2} className="lse__empty">
                  No rows. Click "+ Add row" to start.
                </td>
              </tr>
            ) : (
              rows.map((row, rowIdx) => (
                <tr
                  key={rowIdx}
                  className={`${row._new ? 'lse__row--new' : ''} ${selected.has(rowIdx) ? 'lse__row--selected' : ''}`}
                >
                  <td className="lse__td--check">
                    <input type="checkbox" checked={selected.has(rowIdx)} onChange={() => toggleSelect(rowIdx)} />
                  </td>
                  <td className="lse__td--action">
                    <button className="lse__delete-btn" onClick={() => deleteRow(rowIdx)} title="Delete row">✕</button>
                  </td>
                  {headers.map((h) => (
                    <td key={h}>
                      <input
                        className="lse__cell-input"
                        type="text"
                        value={String(row[h] ?? '')}
                        onChange={(e) => updateCell(rowIdx, h, e.target.value)}
                      />
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="lse__footer">
        <button className="btn btn-secondary btn-sm" onClick={addRow}>+ Add row</button>
        {rows.length > 200 && (
          <span className="text-xs text-muted">Large datasets may take a few seconds to save.</span>
        )}
      </div>
    </div>
  );
}
