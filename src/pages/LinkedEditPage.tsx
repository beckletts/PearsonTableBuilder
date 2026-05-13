import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';
import type { LinkedDashboard, LinkedColumnConfig, LinkedSource } from '../lib/types';
import { parseFile, getSheetNames } from '../utils/parseFile';
import LinkedSourceEditor from '../components/linked/LinkedSourceEditor';
import PearsonNav from '../components/layout/PearsonNav';
import './LinkedEditPage.css';

interface Props { user: User }

const TYPE_OPTIONS = [
  { value: 'text',   label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date',   label: 'Date' },
  { value: 'url',    label: 'URL / Link' },
  { value: 'badge',  label: 'Badge' },
] as const;

type Tab = 'configure' | 'data';

type SourceAction =
  | { type: 'replace'; sourceId: string }
  | { type: 'add' };

export default function LinkedEditPage({ user }: Props) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [dashboard, setDashboard] = useState<LinkedDashboard | null>(null);
  const [loading, setLoading]     = useState(true);
  const [notFound, setNotFound]   = useState(false);

  const [tab, setTab]             = useState<Tab>('configure');
  const [title, setTitle]         = useState('');
  const [description, setDescription] = useState('');
  const [columns, setColumns]     = useState<LinkedColumnConfig[]>([]);
  const [filterOrder, setFilterOrder] = useState<string[]>([]);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');

  // Sources (data tab)
  const [sources, setSources]     = useState<LinkedSource[]>([]);

  // Column drag-to-reorder
  const dragIdx     = useRef<number | null>(null);
  const dragOverIdx = useRef<number | null>(null);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);

  // Filter order drag
  const [filterDragKey, setFilterDragKey] = useState<string | null>(null);
  const filterDragOverKey = useRef<string | null>(null);

  // Source action state
  const [sourceAction, setSourceAction] = useState<SourceAction | null>(null);
  const [pendingSheets, setPendingSheets] = useState<{ file: File; sheets: string[] } | null>(null);
  const [parsedHeaders, setParsedHeaders] = useState<string[]>([]);
  const [parsedRows, setParsedRows]       = useState<Record<string, string>[] | null>(null);
  const [newSourceName, setNewSourceName] = useState('');
  const [newSourceJoinCol, setNewSourceJoinCol] = useState('');
  const [actionSaving, setActionSaving]   = useState(false);
  const [actionError, setActionError]     = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const sourceFileInputRef = useRef<HTMLInputElement>(null);

  // Inline data editor
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);

  // Inline rename
  const [renamingSourceId, setRenamingSourceId] = useState<string | null>(null);
  const [renameValue, setRenameValue]           = useState('');

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      const { data } = await supabase
        .from('linked_dashboards')
        .select('*')
        .eq('id', id)
        .eq('owner_id', user.id)
        .single();

      if (!data) { setNotFound(true); setLoading(false); return; }
      const dash = data as LinkedDashboard;
      setDashboard(dash);
      setTitle(dash.title);
      setDescription(dash.description ?? '');
      setColumns(dash.config.columns);
      setFilterOrder(dash.config.filterOrder ?? []);

      const { data: srcData } = await supabase
        .from('linked_sources')
        .select('*')
        .eq('dashboard_id', dash.id)
        .order('created_at', { ascending: true });
      setSources((srcData ?? []) as LinkedSource[]);

      setLoading(false);
    };
    void load();
  }, [id, user.id]);

  // ── Column helpers ──────────────────────────────────────────────────────────

  const setCol = (i: number, patch: Partial<LinkedColumnConfig>) => {
    setColumns((cs) => {
      const prev = cs[i];
      const next = cs.map((c, idx) => idx === i ? { ...c, ...patch } : c);
      const updated = next[i];
      if (prev.filterable !== updated.filterable) {
        if (updated.filterable) {
          setFilterOrder((fo) => {
            const base = fo.length ? fo : next.filter((c) => c.filterable && c.key !== updated.key).map((c) => c.key);
            return [...base.filter((k) => k !== updated.key), updated.key];
          });
        } else {
          setFilterOrder((fo) => fo.filter((k) => k !== updated.key));
        }
      }
      return next;
    });
  };

  const reorderCols = (fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;
    setColumns((cs) => {
      const next = [...cs];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
  };

  const handleColDragStart = (i: number) => { dragIdx.current = i; setDraggingIdx(i); };
  const handleColDragOver  = (e: React.DragEvent, i: number) => { e.preventDefault(); dragOverIdx.current = i; };
  const handleColDrop      = (i: number) => {
    if (dragIdx.current !== null) reorderCols(dragIdx.current, i);
    dragIdx.current = null; dragOverIdx.current = null; setDraggingIdx(null);
  };
  const handleColDragEnd   = () => { dragIdx.current = null; dragOverIdx.current = null; setDraggingIdx(null); };

  // ── Filter order helpers ────────────────────────────────────────────────────

  const filterableCols = columns.filter((c) => c.filterable);
  const rawFilterOrder = filterOrder.length ? filterOrder : filterableCols.map((c) => c.key);
  const syncedFilterOrder = [
    ...rawFilterOrder.filter((k) => filterableCols.some((c) => c.key === k)),
    ...filterableCols.filter((c) => !rawFilterOrder.includes(c.key)).map((c) => c.key),
  ];

  const reorderFilters = (fromKey: string, toKey: string) => {
    if (fromKey === toKey) return;
    const fo = [...syncedFilterOrder];
    const fromIdx = fo.indexOf(fromKey);
    const toIdx   = fo.indexOf(toKey);
    if (fromIdx < 0 || toIdx < 0) return;
    fo.splice(fromIdx, 1);
    fo.splice(toIdx, 0, fromKey);
    setFilterOrder(fo);
  };

  // ── Save ────────────────────────────────────────────────────────────────────

  const save = async (publish?: boolean) => {
    if (!dashboard) return;
    setSaving(true);
    setError('');
    try {
      const updatedConfig = {
        ...dashboard.config,
        columns,
        filterOrder: syncedFilterOrder,
      };
      const patch: Record<string, unknown> = {
        title: title.trim() || dashboard.title,
        description: description.trim() || null,
        config: updatedConfig,
        updated_at: new Date().toISOString(),
      };
      if (publish !== undefined) patch.is_published = publish;

      const { error: updateErr } = await supabase
        .from('linked_dashboards')
        .update(patch)
        .eq('id', dashboard.id);

      if (updateErr) throw updateErr;
      navigate('/dashboard');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // ── Source management ───────────────────────────────────────────────────────

  const handleSourceFile = async (file: File, action: SourceAction) => {
    setSourceAction(action);
    setActionError('');
    setParsedRows(null);
    setPendingSheets(null);
    const sheets = await getSheetNames(file);
    if (sheets.length > 1) {
      setPendingSheets({ file, sheets });
    } else {
      await parseSourceFile(file, action, sheets[0]);
    }
  };

  const parseSourceFile = async (file: File, action: SourceAction, sheetName?: string) => {
    try {
      const parsed = await parseFile(file, sheetName);
      setParsedHeaders(parsed.headers);
      setParsedRows(parsed.rows);
      setPendingSheets(null);
      const joinKeyLower = (dashboard?.join_key ?? '').toLowerCase();
      const autoMatch = parsed.headers.find(
        (h) => h.toLowerCase().includes(joinKeyLower) || joinKeyLower.includes(h.toLowerCase()),
      );
      setNewSourceJoinCol(autoMatch ?? parsed.headers[0] ?? '');
      if (action.type === 'add') {
        setNewSourceName(file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '));
      }
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to parse file.');
    }
  };

  const confirmSourceAction = async () => {
    if (!sourceAction || !parsedRows || !dashboard) return;
    setActionSaving(true);
    setActionError('');
    try {
      const BATCH = 500;
      if (sourceAction.type === 'replace') {
        const { sourceId } = sourceAction;
        await supabase.from('linked_rows').delete().eq('source_id', sourceId);
        for (let i = 0; i < parsedRows.length; i += BATCH) {
          const batch = parsedRows.slice(i, i + BATCH).map((row, j) => ({
            dashboard_id: dashboard.id,
            source_id: sourceId,
            join_value: String(row[newSourceJoinCol] ?? '').trim(),
            data: row,
            row_index: i + j,
          }));
          const { error: rowErr } = await supabase.from('linked_rows').insert(batch);
          if (rowErr) throw rowErr;
        }
        await supabase.from('linked_sources').update({ row_count: parsedRows.length }).eq('id', sourceId);
        setSources((prev) => prev.map((s) => s.id === sourceId ? { ...s, row_count: parsedRows.length } : s));
      } else {
        const { data: newSrc, error: srcErr } = await supabase
          .from('linked_sources')
          .insert({
            dashboard_id: dashboard.id,
            name: newSourceName.trim() || 'New source',
            join_key_column: newSourceJoinCol,
            row_count: parsedRows.length,
          })
          .select()
          .single();
        if (srcErr) throw srcErr;
        for (let i = 0; i < parsedRows.length; i += BATCH) {
          const batch = parsedRows.slice(i, i + BATCH).map((row, j) => ({
            dashboard_id: dashboard.id,
            source_id: (newSrc as LinkedSource).id,
            join_value: String(row[newSourceJoinCol] ?? '').trim(),
            data: row,
            row_index: i + j,
          }));
          const { error: rowErr } = await supabase.from('linked_rows').insert(batch);
          if (rowErr) throw rowErr;
        }
        setSources((prev) => [...prev, newSrc as LinkedSource]);
      }
      setSourceAction(null);
      setParsedRows(null);
      setParsedHeaders([]);
      setNewSourceName('');
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to save source.');
    } finally {
      setActionSaving(false);
    }
  };

  const deleteSource = async (sourceId: string) => {
    if (!dashboard) return;
    setActionSaving(true);
    setActionError('');
    try {
      await supabase.from('linked_rows').delete().eq('source_id', sourceId);
      const { error: delErr } = await supabase.from('linked_sources').delete().eq('id', sourceId);
      if (delErr) throw delErr;
      setSources((prev) => prev.filter((s) => s.id !== sourceId));
      setConfirmDeleteId(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Delete failed.');
    } finally {
      setActionSaving(false);
    }
  };

  const saveRename = async (sourceId: string) => {
    const name = renameValue.trim();
    setRenamingSourceId(null);
    if (!name) return;
    setSources((prev) => prev.map((s) => s.id === sourceId ? { ...s, name } : s));
    await supabase.from('linked_sources').update({ name }).eq('id', sourceId);
  };

  const cancelSourceAction = () => {
    setSourceAction(null);
    setParsedRows(null);
    setParsedHeaders([]);
    setPendingSheets(null);
    setNewSourceName('');
    setActionError('');
  };

  // ── Render guards ───────────────────────────────────────────────────────────

  if (loading) return (
    <div className="le-page">
      <PearsonNav user={user} />
      <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
        <div className="spinner spinner-lg" />
      </div>
    </div>
  );

  if (notFound || !dashboard) return (
    <div className="le-page">
      <PearsonNav user={user} />
      <div className="le-main"><p className="error-msg">Dashboard not found or you don't have permission to edit it.</p></div>
    </div>
  );

  const visibleCount = columns.filter((c) => c.visible).length;

  return (
    <div className="le-page">
      <PearsonNav user={user} />
      <main className="le-main">
        <div className="le-content">

          {/* Breadcrumb */}
          <div className="le-breadcrumb">
            <button className="le-breadcrumb__back" onClick={() => navigate('/dashboard')}>← Dashboard</button>
            <span className="le-breadcrumb__sep">/</span>
            <span className="le-breadcrumb__title">{dashboard.title}</span>
          </div>

          <h1 className="le-heading">Edit linked dashboard</h1>

          {/* Info bar */}
          <div className="le-info-bar">
            <span>🔗</span>
            <span className="text-sm">Linked via <strong>{dashboard.join_key}</strong> across {dashboard.config.sources.length} sheet{dashboard.config.sources.length !== 1 ? 's' : ''}</span>
            {dashboard.is_published && (
              <a href={`/ld/${dashboard.slug}`} target="_blank" rel="noreferrer" className="le-info-bar__link">
                View live ↗
              </a>
            )}
          </div>

          {/* Tabs */}
          <div className="le-tabs">
            <button
              className={`le-tab ${tab === 'configure' ? 'le-tab--active' : ''}`}
              onClick={() => setTab('configure')}
            >
              Configure
            </button>
            <button
              className={`le-tab ${tab === 'data' ? 'le-tab--active' : ''}`}
              onClick={() => setTab('data')}
            >
              Data sources
              <span className="le-tab__count">{sources.length}</span>
            </button>
          </div>

          {/* ── CONFIGURE TAB ─────────────────────────────────────────────── */}
          {tab === 'configure' && (
            <>
              {/* Title + description */}
              <div className="card le-card">
                <div className="input-group" style={{ marginBottom: 12 }}>
                  <label className="input-label">Dashboard title</label>
                  <input
                    className="input"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Dashboard title"
                  />
                </div>
                <div className="input-group">
                  <label className="input-label">Description <span className="text-muted">(optional)</span></label>
                  <textarea
                    className="input"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Brief description shown at the top of the published dashboard"
                    rows={2}
                  />
                </div>
              </div>

              {/* Column list */}
              <div className="le-cols-header">
                <p className="text-sm font-600 text-soft">Columns <span className="le-cols-hint">— drag to reorder</span></p>
                <p className="text-xs text-muted">{visibleCount} of {columns.length} visible</p>
              </div>

              <div className="le-cols">
                {columns.map((col, i) => (
                  <div
                    key={col.key}
                    className={`le-col card ${col.visible ? '' : 'le-col--hidden'} ${draggingIdx === i ? 'le-col--dragging' : ''}`}
                    draggable
                    onDragStart={() => handleColDragStart(i)}
                    onDragOver={(e) => handleColDragOver(e, i)}
                    onDrop={() => handleColDrop(i)}
                    onDragEnd={handleColDragEnd}
                  >
                    <div className="le-col__top">
                      <span className="le-col__drag" title="Drag to reorder">⠿</span>

                      <label className="toggle">
                        <input
                          type="checkbox"
                          checked={col.visible}
                          onChange={(e) => setCol(i, { visible: e.target.checked })}
                          disabled={col.key === '__join_value'}
                        />
                        <span className="toggle-track" />
                      </label>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span className="le-col__key">{col.key === '__join_value' ? '🔗 join key' : col.key}</span>
                        <input
                          className="input le-col__label-input"
                          value={col.label}
                          onChange={(e) => setCol(i, { label: e.target.value })}
                          placeholder="Column label"
                        />
                      </div>
                    </div>

                    {col.visible && (
                      <>
                        <div className="le-col__controls">
                          <select
                            className="input le-col__type"
                            value={col.type}
                            onChange={(e) => setCol(i, { type: e.target.value as LinkedColumnConfig['type'] })}
                          >
                            {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                          <label className="col-editor__check">
                            <input type="checkbox" checked={col.filterable} onChange={(e) => setCol(i, { filterable: e.target.checked })} />
                            <span className="text-sm">Filter</span>
                          </label>
                          <label className="col-editor__check">
                            <input type="checkbox" checked={col.searchable} onChange={(e) => setCol(i, { searchable: e.target.checked })} />
                            <span className="text-sm">Search</span>
                          </label>
                          <label className="col-editor__check">
                            <input type="checkbox" checked={col.inDetails !== false} onChange={(e) => setCol(i, { inDetails: e.target.checked })} />
                            <span className="text-sm">Details</span>
                          </label>
                        </div>
                        {col.filterable && (
                          <div className="le-col__filter-row">
                            <label className="le-col__filter-label">Filter label text</label>
                            <input
                              className="input le-col__filter-text"
                              value={col.filterPlaceholder ?? ''}
                              onChange={(e) => setCol(i, { filterPlaceholder: e.target.value || undefined })}
                              placeholder={`All ${col.label}s`}
                            />
                          </div>
                        )}
                      </>
                    )}

                    {!col.visible && (
                      <div className="le-col__controls">
                        <label className="col-editor__check" title="Show a filter dropdown for this column even though it's hidden from the table">
                          <input
                            type="checkbox"
                            checked={col.filterable}
                            onChange={(e) => setCol(i, { filterable: e.target.checked })}
                          />
                          <span className="text-sm">Filter only</span>
                        </label>
                        <label className="col-editor__check">
                          <input
                            type="checkbox"
                            checked={col.inDetails === true}
                            onChange={(e) => setCol(i, { inDetails: e.target.checked ? true : undefined })}
                          />
                          <span className="text-sm">Details only</span>
                        </label>
                      </div>
                    )}

                    {!col.visible && col.filterable && (
                      <div className="le-col__filter-row">
                        <label className="le-col__filter-label">Filter label text</label>
                        <input
                          className="input le-col__filter-text"
                          value={col.filterPlaceholder ?? ''}
                          onChange={(e) => setCol(i, { filterPlaceholder: e.target.value || undefined })}
                          placeholder={`All ${col.label}s`}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Filter order */}
              {syncedFilterOrder.length >= 2 && (
                <div className="card le-card">
                  <p className="text-sm font-600" style={{ marginBottom: 10 }}>
                    Filter order <span className="text-muted" style={{ fontSize: 11, fontWeight: 400 }}>— drag to rearrange</span>
                  </p>
                  <div className="le-filter-order">
                    {syncedFilterOrder.map((key) => {
                      const col = columns.find((c) => c.key === key);
                      if (!col) return null;
                      return (
                        <div
                          key={key}
                          className={`le-filter-chip ${filterDragKey === key ? 'le-filter-chip--dragging' : ''}`}
                          draggable
                          onDragStart={() => setFilterDragKey(key)}
                          onDragOver={(e) => { e.preventDefault(); filterDragOverKey.current = key; }}
                          onDrop={() => {
                            if (filterDragKey) reorderFilters(filterDragKey, key);
                            setFilterDragKey(null);
                            filterDragOverKey.current = null;
                          }}
                          onDragEnd={() => { setFilterDragKey(null); filterDragOverKey.current = null; }}
                        >
                          <span className="le-filter-chip__drag">⠿</span>
                          <span className="le-filter-chip__label">{col.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {error && <p className="error-msg mt-16">{error}</p>}

              <div className="le-actions">
                <button className="btn btn-secondary" onClick={() => navigate('/dashboard')} disabled={saving}>Cancel</button>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className={`btn btn-sm ${dashboard.is_published ? 'btn-secondary' : 'btn-ghost'}`}
                    onClick={() => void save(!dashboard.is_published)}
                    disabled={saving}
                  >
                    {dashboard.is_published ? 'Save & unpublish' : 'Save as draft'}
                  </button>
                  <button className="btn btn-primary" onClick={() => void save(dashboard.is_published ? undefined : true)} disabled={saving}>
                    {saving ? 'Saving…' : dashboard.is_published ? 'Save changes' : 'Save & publish →'}
                  </button>
                </div>
              </div>
            </>
          )}

          {/* ── DATA TAB ──────────────────────────────────────────────────── */}
          {tab === 'data' && (
            <div>
              <p className="text-sm text-soft" style={{ marginBottom: 16 }}>
                Manage the spreadsheet sources that make up this dashboard. Add next year's timetable, replace outdated data, or remove a source entirely.
              </p>

              {/* Source cards */}
              <div className="le-sources">
                {sources.map((src) => (
                  <div key={src.id} className="le-source card">
                    <div className="le-source__header">
                      <div className="le-source__icon">📄</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {/* Inline rename */}
                        {renamingSourceId === src.id ? (
                          <input
                            className="input le-source__rename-input"
                            value={renameValue}
                            autoFocus
                            onChange={(e) => setRenameValue(e.target.value)}
                            onBlur={() => void saveRename(src.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') void saveRename(src.id);
                              if (e.key === 'Escape') setRenamingSourceId(null);
                            }}
                          />
                        ) : (
                          <button
                            className="le-source__name-btn"
                            onClick={() => { setRenamingSourceId(src.id); setRenameValue(src.name); }}
                            title="Click to rename"
                          >
                            {src.name} <span className="le-source__rename-hint">✎</span>
                          </button>
                        )}
                        <p className="text-xs text-muted mt-4">
                          {src.row_count.toLocaleString()} rows · join column: <code>{src.join_key_column}</code> · added {new Date(src.created_at).toLocaleDateString('en-GB')}
                        </p>
                      </div>
                      <div className="le-source__actions">
                        {confirmDeleteId === src.id ? (
                          <>
                            <span className="text-sm text-soft">Delete this source?</span>
                            <button className="btn btn-danger btn-sm" onClick={() => void deleteSource(src.id)} disabled={actionSaving}>Yes, delete</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDeleteId(null)}>Cancel</button>
                          </>
                        ) : (
                          <>
                            <button
                              className={`btn btn-secondary btn-sm ${editingSourceId === src.id ? 'btn-active' : ''}`}
                              onClick={() => setEditingSourceId(editingSourceId === src.id ? null : src.id)}
                            >
                              {editingSourceId === src.id ? 'Close editor' : 'Edit data'}
                            </button>
                            <input
                              type="file"
                              accept=".csv,.xlsx,.xls"
                              style={{ display: 'none' }}
                              id={`replace-input-${src.id}`}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) void handleSourceFile(file, { type: 'replace', sourceId: src.id });
                                e.target.value = '';
                              }}
                            />
                            <label htmlFor={`replace-input-${src.id}`} className="btn btn-secondary btn-sm le-source__replace-btn">
                              Replace data
                            </label>
                            <button
                              className="btn btn-ghost btn-sm"
                              style={{ color: 'var(--color-danger)' }}
                              onClick={() => setConfirmDeleteId(src.id)}
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Inline data editor */}
                    {editingSourceId === src.id && (
                      <LinkedSourceEditor
                        source={src}
                        dashboardId={dashboard.id}
                        onClose={() => setEditingSourceId(null)}
                        onSaved={(count) => setSources((prev) => prev.map((s) => s.id === src.id ? { ...s, row_count: count } : s))}
                      />
                    )}
                  </div>
                ))}
              </div>

              {/* Sheet picker */}
              {pendingSheets && (
                <div className="card le-card">
                  <p className="font-600 text-sm" style={{ marginBottom: 10 }}>
                    This workbook has {pendingSheets.sheets.length} sheets — pick one to import:
                  </p>
                  <select
                    className="input"
                    style={{ width: 'auto', minWidth: 200, marginBottom: 10 }}
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value && sourceAction) {
                        void parseSourceFile(pendingSheets.file, sourceAction, e.target.value);
                      }
                    }}
                  >
                    <option value="" disabled>Choose sheet…</option>
                    {pendingSheets.sheets.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <button className="btn btn-ghost btn-sm" onClick={cancelSourceAction}>Cancel</button>
                </div>
              )}

              {/* Preview + confirm */}
              {parsedRows && sourceAction && !pendingSheets && (
                <div className="card le-card">
                  <p className="font-600 text-sm" style={{ marginBottom: 14 }}>
                    {sourceAction.type === 'add' ? 'Add new source' : 'Replace source data'} — {parsedRows.length.toLocaleString()} rows ready
                  </p>

                  {sourceAction.type === 'add' && (
                    <div className="input-group" style={{ marginBottom: 12 }}>
                      <label className="input-label">Source name</label>
                      <input
                        className="input"
                        value={newSourceName}
                        onChange={(e) => setNewSourceName(e.target.value)}
                        placeholder="e.g. Summer 2027 Timetable"
                      />
                    </div>
                  )}

                  <div className="input-group" style={{ marginBottom: 14 }}>
                    <label className="input-label">Column containing "{dashboard.join_key}"</label>
                    <select
                      className="input"
                      value={newSourceJoinCol}
                      onChange={(e) => setNewSourceJoinCol(e.target.value)}
                    >
                      {parsedHeaders.map((h) => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>

                  {actionError && <p className="error-msg" style={{ marginBottom: 10 }}>{actionError}</p>}

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-ghost btn-sm" onClick={cancelSourceAction}>Cancel</button>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => void confirmSourceAction()}
                      disabled={actionSaving || !newSourceJoinCol}
                    >
                      {actionSaving
                        ? 'Saving…'
                        : sourceAction.type === 'add'
                          ? `Add ${parsedRows.length.toLocaleString()} rows →`
                          : `Replace with ${parsedRows.length.toLocaleString()} rows →`}
                    </button>
                  </div>
                </div>
              )}

              {/* Add new source drop zone */}
              {!parsedRows && !pendingSheets && (
                <>
                  <div
                    className="le-source-drop"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const file = e.dataTransfer.files[0];
                      if (file) void handleSourceFile(file, { type: 'add' });
                    }}
                    onClick={() => sourceFileInputRef.current?.click()}
                  >
                    <input
                      ref={sourceFileInputRef}
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void handleSourceFile(file, { type: 'add' });
                        e.target.value = '';
                      }}
                    />
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--color-text-muted)' }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    <p className="text-sm font-600" style={{ marginTop: 8 }}>Add new source</p>
                    <p className="text-xs text-muted mt-4">Drop a CSV or Excel file, or click to browse</p>
                  </div>
                  {actionError && <p className="error-msg mt-12">{actionError}</p>}
                </>
              )}
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
