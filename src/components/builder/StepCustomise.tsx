import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { generateUniqueSlug } from '../../utils/generateSlug';
import { createSnapshot } from '../../utils/snapshots';
import type { ColumnConfig, ParsedFile, TableConfig, Widget } from '../../lib/types';
import { ORIGINAL_ORDER } from '../../lib/types';
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
  const [filterDragKey, setFilterDragKey] = useState<string | null>(null);
  const filterDragOverKey = useRef<string | null>(null);

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
      const prev = cols[i];
      cols[i] = updated;
      const fCols = cols.filter((col) => col.filterable);
      const raw = c.filterOrder ?? c.columns.filter((col) => col.filterable).map((col) => col.key);
      let nextOrder = raw;
      if (!prev.filterable && updated.filterable) {
        nextOrder = [...raw.filter((k) => k !== updated.key), updated.key];
      } else if (prev.filterable && !updated.filterable) {
        nextOrder = raw.filter((k) => k !== updated.key);
      }
      // Remove any keys no longer present in filterable cols
      nextOrder = nextOrder.filter((k) => fCols.some((col) => col.key === k));
      return { ...c, columns: cols, filterOrder: nextOrder };
    });
  };

  const reorderFilters = (fromKey: string, toKey: string) => {
    if (fromKey === toKey) return;
    setConfig((c) => {
      const fCols = c.columns.filter((col) => col.filterable);
      const raw = c.filterOrder ?? fCols.map((col) => col.key);
      const fo = [
        ...raw.filter((k) => fCols.some((col) => col.key === k)),
        ...fCols.filter((col) => !raw.includes(col.key)).map((col) => col.key),
      ];
      const fromIdx = fo.indexOf(fromKey);
      const toIdx   = fo.indexOf(toKey);
      if (fromIdx < 0 || toIdx < 0) return c;
      fo.splice(fromIdx, 1);
      fo.splice(toIdx, 0, fromKey);
      return { ...c, filterOrder: fo };
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

  const markRefreshed = async () => {
    if (!editingId || !config.dataRefresh?.enabled) return;
    setSaving(true);
    setError('');
    try {
      const now = new Date().toISOString();
      const updatedConfig = { ...config, dataRefresh: { ...config.dataRefresh, lastUpdated: now } };
      const { error: upErr } = await supabase.from('tables').update({ config: updatedConfig }).eq('id', editingId);
      if (upErr) throw upErr;
      setConfig(updatedConfig);
    } catch (e) {
      const msg = e instanceof Error ? e.message : (e as { message?: string })?.message;
      setError(msg || 'Update failed.');
    } finally {
      setSaving(false);
    }
  };

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

      const finalConfig = {
        ...config,
        title: config.title.trim() || 'Untitled Table',
        dataRefresh: config.dataRefresh?.enabled
          ? { ...config.dataRefresh, lastUpdated: new Date().toISOString() }
          : config.dataRefresh,
      };

      let savedTableId: string;

      if (editingId) {
        const { error: upErr } = await supabase
          .from('tables')
          .update({ title: finalConfig.title, description: finalConfig.description, config: finalConfig, is_published: publish })
          .eq('id', editingId);
        if (upErr) throw upErr;

        // Capture the live state before we overwrite it, so it can be rolled back.
        // Best-effort: a snapshot failure must not block the save itself.
        try {
          await createSnapshot(editingId, publish ? 'Before republish' : 'Before save');
        } catch (snapErr) {
          console.warn('Snapshot before overwrite failed:', snapErr);
        }

        await supabase.from('table_rows').delete().eq('table_id', editingId);

        // Remap rows so keys match existing config column keys, not raw file headers
        const remappedRows = parsed.rows.map((r) => {
          const mapped: Record<string, string> = {};
          for (const col of finalConfig.columns) {
            const matchHeader = parsed.headers.find(
              (h) =>
                h.toLowerCase().trim() === col.key.toLowerCase().trim() ||
                h.toLowerCase().trim() === col.label.toLowerCase().trim()
            );
            mapped[col.key] = matchHeader ? String(r[matchHeader] ?? '') : '';
          }
          return mapped;
        });
        await insertRows(editingId, remappedRows);
        savedTableId = editingId;
      } else {
        const slug = await generateUniqueSlug(finalConfig.title);
        const { data: table, error: tErr } = await supabase
          .from('tables')
          .insert({ owner_id: user.id, title: finalConfig.title, description: finalConfig.description, slug, config: finalConfig, is_published: publish, tab_group_id: groupId ?? null, tab_order: tabOrder })
          .select()
          .single();
        if (tErr) throw tErr;

        await insertRows(table.id, parsed.rows);
        savedTableId = table.id;

        if (publish) {
          await navigator.clipboard.writeText(`${window.location.origin}/t/${slug}`).catch(() => null);
        }
      }

      void supabase.from('table_audit_log').insert({
        table_id: savedTableId,
        user_id: user.id,
        user_email: user.email ?? '',
        action: publish ? 'publish' : 'save_draft',
        row_count: parsed.rows.length,
      });

      navigate('/dashboard');
    } catch (e) {
      const msg = e instanceof Error ? e.message : (e as { message?: string })?.message;
      setError(msg || 'Save failed. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const filterableCols = config.columns.filter((c) => c.filterable);
  const rawFilterOrder = config.filterOrder ?? filterableCols.map((c) => c.key);
  const syncedFilterOrder = [
    ...rawFilterOrder.filter((k) => filterableCols.some((c) => c.key === k)),
    ...filterableCols.filter((c) => !rawFilterOrder.includes(c.key)).map((c) => c.key),
  ];

  return (
    <div className="step-customise">
      <div className="step-customise__layout">
        <div className="step-customise__sidebar">
          <h2 className="step-customise__heading">Customise your table</h2>

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="input-group" style={{ marginBottom: 14 }}>
              <label className="input-label" data-tooltip="The name displayed at the top of your published table page">Table title</label>
              <input
                className="input"
                value={config.title}
                onChange={(e) => setConfig((c) => ({ ...c, title: e.target.value }))}
                placeholder="e.g. Pearson BTEC Qualifications"
              />
            </div>
            <div className="input-group" style={{ marginBottom: 14 }}>
              <label className="input-label" data-tooltip="A short summary shown beneath the title to help users understand the data">Description <span className="text-muted">(optional)</span></label>
              <textarea
                className="input"
                value={config.description}
                onChange={(e) => setConfig((c) => ({ ...c, description: e.target.value }))}
                placeholder="Brief description shown above the table"
                rows={2}
              />
            </div>
            <div className="input-group">
              <label className="input-label" data-tooltip="The placeholder text shown inside the search box">Search bar placeholder <span className="text-muted">(optional)</span></label>
              <input
                className="input"
                value={config.searchPlaceholder ?? ''}
                onChange={(e) => setConfig((c) => ({ ...c, searchPlaceholder: e.target.value || undefined }))}
                placeholder={`e.g. Search ${config.columns.find((c) => c.key === config.primarySearchColumn)?.label ?? ''}…`}
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
                onDragEnd={() => setDragIdx(null)}
              />
            ))}
          </div>

          <WidgetBuilder config={config} parsed={parsed} onChange={updateWidgets} />

          {syncedFilterOrder.length >= 2 && (
            <div className="card" style={{ marginTop: 16, padding: 16 }}>
              <p className="text-sm font-600" style={{ marginBottom: 10 }}>
                Filter order <span className="text-muted" style={{ fontSize: 11, fontWeight: 400 }}>— drag to rearrange</span>
              </p>
              <div className="sc-filter-order">
                {syncedFilterOrder.map((key) => {
                  const col = config.columns.find((c) => c.key === key);
                  if (!col) return null;
                  return (
                    <div
                      key={key}
                      className={`sc-filter-chip ${filterDragKey === key ? 'sc-filter-chip--dragging' : ''}`}
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
                      <span className="sc-filter-chip__drag">⠿</span>
                      <span className="sc-filter-chip__label">{col.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="card" style={{ marginTop: 16, padding: 16 }}>
            <p className="text-sm font-600" style={{ marginBottom: 10 }}>Default sort</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <select
                className="input"
                value={config.defaultSort.column}
                onChange={(e) => setConfig((c) => ({ ...c, defaultSort: { ...c.defaultSort, column: e.target.value } }))}
                data-tooltip="Which order rows appear in by default, before a viewer sorts or filters"
              >
                <option value={ORIGINAL_ORDER}>Original order (as uploaded)</option>
                {config.columns.map((c) => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
              {config.defaultSort.column !== ORIGINAL_ORDER && (
                <select
                  className="input"
                  style={{ width: 'auto' }}
                  value={config.defaultSort.direction}
                  onChange={(e) => setConfig((c) => ({ ...c, defaultSort: { ...c.defaultSort, direction: e.target.value as 'asc' | 'desc' } }))}
                >
                  <option value="asc">Ascending</option>
                  <option value="desc">Descending</option>
                </select>
              )}
            </div>
            {config.columns.some((c) => c.key === config.defaultSort.column && c.merge) && (
              <p className="text-xs" style={{ color: '#C25100', marginTop: 8 }}>
                ⚠ This column has merged blank cells — sorting by it will split merged row pairs apart. "Original order" keeps them together.
              </p>
            )}
          </div>

          <div className="card" style={{ marginTop: 16, padding: 16 }}>
            <label className="col-editor__check" style={{ marginBottom: 10 }} data-tooltip="Pin the column headers to the top of the table so they stay visible as users scroll down">
              <input
                type="checkbox"
                checked={config.stickyHeader ?? false}
                onChange={(e) => setConfig((c) => ({ ...c, stickyHeader: e.target.checked }))}
              />
              <span className="text-sm font-600">Sticky column headers</span>
            </label>
            <label className="col-editor__check" style={{ marginBottom: 10 }} data-tooltip="Hide the Pearson logo header and footer — useful when embedding on a page that already has Pearson branding">
              <input
                type="checkbox"
                checked={config.hideLogo ?? false}
                onChange={(e) => setConfig((c) => ({ ...c, hideLogo: e.target.checked }))}
              />
              <span className="text-sm font-600">Hide Pearson logo</span>
            </label>
            <label className="col-editor__check" style={{ marginBottom: 10 }} data-tooltip="Hide the table title on the published page — useful when the title is already shown on the surrounding page">
              <input
                type="checkbox"
                checked={config.hideTitle ?? false}
                onChange={(e) => setConfig((c) => ({ ...c, hideTitle: e.target.checked }))}
              />
              <span className="text-sm font-600">Hide table title</span>
            </label>
            <label className="col-editor__check" style={{ marginBottom: 10 }} data-tooltip="Hide results until the viewer makes a search or filter selection — useful for large tables where showing everything at once is overwhelming">
              <input
                type="checkbox"
                checked={config.requireFilter ?? false}
                onChange={(e) => setConfig((c) => ({ ...c, requireFilter: e.target.checked }))}
              />
              <span className="text-sm font-600">Show results only after a search or filter</span>
            </label>
            <label className="col-editor__check" style={{ marginBottom: config.dataRefresh?.enabled ? 10 : 0 }}>
              <input
                type="checkbox"
                checked={config.dataRefresh?.enabled ?? false}
                onChange={(e) => setConfig((c) => ({
                  ...c,
                  dataRefresh: {
                    enabled: e.target.checked,
                    customText: c.dataRefresh?.customText ?? '',
                    lastUpdated: c.dataRefresh?.lastUpdated,
                  },
                }))}
              />
              <span className="text-sm font-600">Show "data last refreshed" notice</span>
            </label>
            {config.dataRefresh?.enabled && (
              <>
                <input
                  className="input"
                  value={config.dataRefresh.customText}
                  onChange={(e) => setConfig((c) => ({
                    ...c,
                    dataRefresh: { ...c.dataRefresh!, enabled: true, customText: e.target.value },
                  }))}
                  placeholder="e.g. Assessment dates may be updated — please check this page for the latest information"
                />
                {editingId && (
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ marginTop: 8 }}
                    onClick={() => void markRefreshed()}
                    disabled={saving}
                    title="Update the 'data last refreshed' timestamp to right now without republishing"
                  >
                    Mark as refreshed now
                  </button>
                )}
              </>
            )}
          </div>

          {/* ── Analytics & cookie consent ── */}
          <div className="card" style={{ marginTop: 16, padding: 16 }}>
            <label className="col-editor__check" style={{ marginBottom: config.tracking !== undefined ? 10 : 0 }}>
              <input
                type="checkbox"
                checked={config.tracking !== undefined}
                onChange={(e) => setConfig((c) => ({
                  ...c,
                  tracking: e.target.checked ? { gaTrackingId: c.tracking?.gaTrackingId ?? '' } : undefined,
                }))}
              />
              <span className="text-sm font-600">Enable Google Analytics tracking</span>
            </label>
            {config.tracking !== undefined && (
              <>
                <input
                  className="input"
                  value={config.tracking.gaTrackingId ?? ''}
                  onChange={(e) => setConfig((c) => ({
                    ...c,
                    tracking: { ...c.tracking, gaTrackingId: e.target.value },
                  }))}
                  placeholder="G-XXXXXXXXXX"
                  style={{ marginBottom: 8 }}
                />
                <details style={{ marginBottom: 12 }}>
                  <summary className="text-xs" style={{ cursor: 'pointer', color: '#5B2D86', userSelect: 'none' }}>
                    How do I find my Google Analytics ID?
                  </summary>
                  <ol className="text-xs text-soft" style={{ margin: '8px 0 0 16px', lineHeight: 1.7 }}>
                    <li>Go to <strong>analytics.google.com</strong> and sign in with a Google account.</li>
                    <li>Click <strong>Admin</strong> (gear icon, bottom left) → <strong>Create property</strong>.</li>
                    <li>Name it after your table (e.g. "BTEC Results 2026"), select your country and timezone.</li>
                    <li>Choose <strong>Web</strong> as the platform and enter your table's published URL.</li>
                    <li>Your Measurement ID (starting with <strong>G-</strong>) appears on the next screen — copy and paste it into the field above.</li>
                  </ol>
                </details>
                <label className="col-editor__check" style={{ marginBottom: config.tracking.cookieConsent?.enabled ? 10 : 0 }}>
                  <input
                    type="checkbox"
                    checked={config.tracking.cookieConsent?.enabled ?? false}
                    onChange={(e) => setConfig((c) => ({
                      ...c,
                      tracking: {
                        ...c.tracking,
                        cookieConsent: {
                          enabled: e.target.checked,
                          message: c.tracking?.cookieConsent?.message ?? '',
                        },
                      },
                    }))}
                  />
                  <span className="text-sm font-600">Show cookie consent banner</span>
                </label>
                {config.tracking.cookieConsent?.enabled && (
                  <input
                    className="input"
                    value={config.tracking.cookieConsent.message ?? ''}
                    onChange={(e) => setConfig((c) => ({
                      ...c,
                      tracking: {
                        ...c.tracking,
                        cookieConsent: { ...c.tracking!.cookieConsent!, message: e.target.value },
                      },
                    }))}
                    placeholder="This page uses cookies to understand how it is used. Do you accept?"
                  />
                )}
              </>
            )}
          </div>

          {/* ── Pagination ── */}
          <div className="card" style={{ marginTop: 16, padding: 16 }}>
            <label className="col-editor__check" style={{ marginBottom: config.pagination ? 10 : 0 }} data-tooltip="Replace infinite scroll with Previous / Next page controls — useful for large tables">
              <input
                type="checkbox"
                checked={!!config.pagination}
                onChange={(e) => setConfig((c) => ({
                  ...c,
                  pagination: e.target.checked ? { pageSize: 50 } : undefined,
                }))}
              />
              <span className="text-sm font-600">Page-by-page navigation</span>
            </label>
            {config.pagination && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="text-sm text-soft">Show</span>
                <select
                  className="input"
                  style={{ width: 'auto' }}
                  value={config.pagination.pageSize}
                  onChange={(e) => setConfig((c) => ({
                    ...c,
                    pagination: { pageSize: Number(e.target.value) },
                  }))}
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={250}>250</option>
                </select>
                <span className="text-sm text-soft">results per page</span>
              </div>
            )}
          </div>

          {error && <p className="error-msg mt-16">{error}</p>}

          <div style={{ display: 'flex', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" onClick={onBack} disabled={saving} data-tooltip="Go back to the upload step">← Back</button>
            <button className="btn btn-secondary" onClick={() => save(false)} disabled={saving} data-tooltip="Save your settings without making the table visible to others yet">
              {saving ? 'Saving…' : 'Save draft'}
            </button>
            <button className="btn btn-primary" onClick={() => save(true)} disabled={saving} data-tooltip="Make this table live and copy the shareable link to your clipboard">
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
