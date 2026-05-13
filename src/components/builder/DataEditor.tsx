import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { TableConfig, TableRow } from '../../lib/types';
import { parseFile, getSheetNames } from '../../utils/parseFile';
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
      ...Object.fromEntries(allCols.map((c) => [c.key, String(r.data[c.key] ?? '').replace(/​/g, '').trim()])),
    })),
  );

  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [showHidden, setShowHidden] = useState(false);

  // Selection state
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Bulk edit state
  const [bulkCol, setBulkCol] = useState('');
  const [bulkVal, setBulkVal] = useState('');

  // File import state
  const [importSheetPick, setImportSheetPick] = useState<{ file: File; sheets: string[] } | null>(null);
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const tableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setRows(
      initialRows.map((r) => ({
        _id: r.id,
        ...Object.fromEntries(config.columns.map((c) => [c.key, String(r.data[c.key] ?? '').replace(/​/g, '').trim()])),
      })),
    );
    setDirty(false);
    setSaved(false);
    setSelected(new Set());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRows]);

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
    setSelected(new Set());
    setDirty(true);
    setSaved(false);
  };

  // Selection
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

  // Bulk edit
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

  // File import
  const handleImportSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (importInputRef.current) importInputRef.current.value = '';
    const sheets = await getSheetNames(file);
    if (sheets.length > 1) {
      setImportSheetPick({ file, sheets });
    } else {
      await doImport(file, sheets[0]);
    }
  };

  const doImport = async (file: File, sheetName?: string) => {
    setImporting(true);
    try {
      const parsed = await parseFile(file, sheetName);
      const newRows: EditRow[] = parsed.rows.map((r) => {
        const er: EditRow = { _new: true };
        for (const col of allCols) {
          const matchHeader = parsed.headers.find(
            (h) => h.toLowerCase().trim() === col.key.toLowerCase().trim(),
          );
          er[col.key] = matchHeader ? (r[matchHeader] ?? '') : '';
        }
        return er;
      });
      setRows((prev) => [...prev, ...newRows]);
      setDirty(true);
      setSaved(false);
      setImportSheetPick(null);
      setTimeout(() => {
        tableRef.current?.scrollTo({ top: tableRef.current.scrollHeight, behavior: 'smooth' });
      }, 50);
    } finally {
      setImporting(false);
    }
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
            const num = col.type === 'number' && v !== '' ? Number(v) : NaN;
            data[col.key] = !isNaN(num) ? num : v || null;
          }
          return { table_id: tableId, data, row_index: i + j };
        });
        const { error: insertErr } = await supabase.from('table_rows').insert(batch);
        if (insertErr) throw insertErr;
      }

      const now = new Date().toISOString();
      const updatedConfig = config.dataRefresh?.enabled
        ? { ...config, dataRefresh: { ...config.dataRefresh, lastUpdated: now } }
        : config;
      await supabase.from('tables').update({ config: updatedConfig, updated_at: now }).eq('id', tableId);
      setDirty(false);
      setSaved(true);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const markRefreshed = async () => {
    setSaving(true);
    setError('');
    try {
      const now = new Date().toISOString();
      const updatedConfig = { ...config, dataRefresh: { ...config.dataRefresh!, lastUpdated: now } };
      const { error: upErr } = await supabase.from('tables').update({ config: updatedConfig }).eq('id', tableId);
      if (upErr) throw upErr;
      setSaved(true);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed.');
    } finally {
      setSaving(false);
    }
  };

  const allSelected = rows.length > 0 && selected.size === rows.length;
  const someSelected = selected.size > 0 && selected.size < rows.length;

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
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <label className="data-editor__toggle-hidden">
            <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} />
            Show hidden columns
          </label>
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            style={{ display: 'none' }}
            onChange={(e) => void handleImportSelect(e)}
          />
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => importInputRef.current?.click()}
            disabled={importing}
            title="Append rows from a CSV or Excel file to the existing data"
          >
            {importing ? 'Importing…' : '+ Import rows'}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={addRow}>+ Add row</button>
          {config.dataRefresh?.enabled && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => void markRefreshed()}
              disabled={saving}
              title="Update the 'data last refreshed' timestamp to right now without changing any rows"
            >
              Mark as refreshed now
            </button>
          )}
          <button className="btn btn-primary" onClick={() => void save()} disabled={saving || !dirty}>
            {saving ? 'Saving…' : 'Save & publish'}
          </button>
        </div>
      </div>

      {/* Sheet picker — shown when multi-sheet XLSX is selected */}
      {importSheetPick && (
        <div className="data-editor__sheet-pick">
          <span className="text-sm font-600">Select sheet to import:</span>
          <select
            className="input"
            style={{ width: 'auto', minWidth: 180 }}
            defaultValue=""
            onChange={(e) => { if (e.target.value) void doImport(importSheetPick.file, e.target.value); }}
          >
            <option value="" disabled>Pick a sheet…</option>
            {importSheetPick.sheets.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <button className="btn btn-ghost btn-sm" onClick={() => setImportSheetPick(null)}>Cancel</button>
        </div>
      )}

      {/* Bulk action bar — shown when rows are selected */}
      {selected.size > 0 && (
        <div className="data-editor__bulk-bar">
          <span className="data-editor__bulk-label">
            {selected.size} {selected.size === 1 ? 'row' : 'rows'} selected
          </span>
          <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>Clear</button>
          <div className="data-editor__bulk-edit">
            <select
              className="input data-editor__bulk-col"
              value={bulkCol}
              onChange={(e) => setBulkCol(e.target.value)}
            >
              <option value="">Edit column…</option>
              {displayCols.map((col) => (
                <option key={col.key} value={col.key}>{col.label}</option>
              ))}
            </select>
            <input
              className="input data-editor__bulk-val"
              value={bulkVal}
              onChange={(e) => setBulkVal(e.target.value)}
              placeholder="New value"
              disabled={!bulkCol}
              onKeyDown={(e) => { if (e.key === 'Enter') applyBulk(); }}
            />
            <button
              className="btn btn-primary btn-sm"
              onClick={applyBulk}
              disabled={!bulkCol}
            >
              Apply to {selected.size} row{selected.size !== 1 ? 's' : ''}
            </button>
          </div>
          <button className="btn btn-danger btn-sm" onClick={deleteSelected}>
            Delete {selected.size} row{selected.size !== 1 ? 's' : ''}
          </button>
        </div>
      )}

      {error && <p className="error-msg" style={{ margin: '0 0 12px' }}>{error}</p>}

      <div className="data-editor__scroll" ref={tableRef}>
        <table className="data-editor__table">
          <thead>
            <tr>
              <th className="data-editor__th--check">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = someSelected; }}
                  onChange={toggleSelectAll}
                  title="Select all rows"
                />
              </th>
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
                <td colSpan={displayCols.length + 2} className="data-editor__empty">
                  No rows yet. Click "+ Add row" to start.
                </td>
              </tr>
            ) : (
              rows.map((row, rowIdx) => (
                <tr
                  key={rowIdx}
                  className={`${row._new ? 'data-editor__row--new' : ''} ${selected.has(rowIdx) ? 'data-editor__row--selected' : ''}`}
                >
                  <td className="data-editor__td--check">
                    <input
                      type="checkbox"
                      checked={selected.has(rowIdx)}
                      onChange={() => toggleSelect(rowIdx)}
                    />
                  </td>
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
                        type="text"
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
