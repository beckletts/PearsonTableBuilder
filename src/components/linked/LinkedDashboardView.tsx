import { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import type { LinkedDashboard, LinkedRow, LinkedColumnConfig } from '../../lib/types';
import { trackEvent } from '../../lib/analytics';
import PearsonLogo from '../layout/PearsonLogo';
import pearsonWave from '../../assets/pearson-wave.jpg';
import './LinkedDashboardView.css';

interface Props {
  dashboard: LinkedDashboard;
  rawRows: LinkedRow[];
  primarySourceId?: string;
}

// Normalize an examination code for cross-source matching.
// Tech Award timetable codes use "/01" suffixes (BAC03/01) while overview codes don't (BAC03).
function normalizeCode(code: string): string {
  return code.replace(/\/\d+$/, '').trim().toUpperCase();
}

// Normalize a column key for comparison: lowercase + collapse whitespace.
// Handles CSV headers with trailing spaces or inconsistent casing across sources.
function normalizeColKey(k: string): string {
  return k.toLowerCase().replace(/\s+/g, ' ').trim();
}

// Merge rows from multiple sources into display rows.
//
// Sources are classified per-pair against the primary:
//   "parallel"  — ≥50% column overlap (e.g. two timetables) → their rows are unioned
//   "lookup"    — <50% column overlap (e.g. an overview sheet) → used to enrich rows by join key
//
// Primary rows come first, then each parallel source's rows in creation order.
// Every row is optionally enriched with matching lookup data.
function mergeRows(rawRows: LinkedRow[], primarySourceId?: string): Record<string, unknown>[] {
  const sourceIds = [...new Set(rawRows.map((r) => r.source_id))];

  if (sourceIds.length === 1) {
    return rawRows
      .slice()
      .sort((a, b) => a.row_index - b.row_index)
      .map((r, i) => ({
        __join_value: r.join_value,
        __row_key: `${r.source_id}_${r.row_index}_${i}`,
        ...r.data,
      }));
  }

  const resolvedPrimaryId = primarySourceId && sourceIds.includes(primarySourceId)
    ? primarySourceId
    : sourceIds
        .map((id) => ({ id, count: rawRows.filter((r) => r.source_id === id).length }))
        .sort((a, b) => b.count - a.count)[0].id;

  const primaryRows = rawRows.filter((r) => r.source_id === resolvedPrimaryId);
  const primaryCols = new Set(primaryRows.flatMap((r) => Object.keys(r.data).map(normalizeColKey)));

  const parallelIds = new Set<string>();
  const lookupMap   = new Map<string, Record<string, unknown>>();

  for (const sid of sourceIds) {
    if (sid === resolvedPrimaryId) continue;
    const sRows = rawRows.filter((r) => r.source_id === sid);
    const sCols = new Set(sRows.flatMap((r) => Object.keys(r.data).map(normalizeColKey)));
    const overlap = [...sCols].filter((k) => primaryCols.has(k)).length;
    const ratio   = overlap / Math.max(primaryCols.size, sCols.size, 1);

    if (ratio >= 0.5) {
      parallelIds.add(sid);
    } else {
      for (const row of sRows) {
        const key = normalizeCode(row.join_value);
        if (!lookupMap.has(key)) lookupMap.set(key, {});
        Object.assign(lookupMap.get(key)!, row.data);
      }
    }
  }

  const orderedSourceIds = [resolvedPrimaryId, ...sourceIds.filter((id) => parallelIds.has(id))];
  const result: Record<string, unknown>[] = [];
  let i = 0;
  for (const sid of orderedSourceIds) {
    const sRows = rawRows
      .filter((r) => r.source_id === sid)
      .slice()
      .sort((a, b) => a.row_index - b.row_index);
    for (const row of sRows) {
      const key        = normalizeCode(row.join_value);
      const enrichment = lookupMap.get(key) ?? {};
      result.push({
        __join_value: row.join_value,
        __row_key:    `${row.source_id}_${row.row_index}_${i}`,
        ...enrichment,
        ...row.data,
      });
      i++;
    }
  }
  return result;
}

function getCellVal(row: Record<string, unknown>, key: string): string {
  if (key in row) {
    const v = row[key];
    return v !== null && v !== undefined ? String(v).trim() : '';
  }
  // Normalised fallback for existing rows stored with untrimmed/differently-cased CSV header keys
  const norm = normalizeColKey(key);
  const match = Object.keys(row).find((k) => normalizeColKey(k) === norm);
  if (match !== undefined) {
    const v = row[match];
    return v !== null && v !== undefined ? String(v).trim() : '';
  }
  return '';
}

const BATCH = 50;

const track = (event: string, params?: Record<string, unknown>) => {
  if (typeof window.gtag === 'function') window.gtag('event', event, params);
};

export default function LinkedDashboardView({ dashboard, rawRows, primarySourceId }: Props) {
  const { config } = dashboard;
  const visibleCols = useMemo(() => config.columns.filter((c) => c.visible), [config.columns]);
  // All filterable columns, including hidden ones (filter-only feature)
  const allFilterCols = useMemo(() => config.columns.filter((c) => c.filterable), [config.columns]);
  // Universal search — searches across every column in the data
  const searchCols = useMemo(() => config.columns.map((c) => c.key), [config.columns]);

  const [search, setSearch]           = useState('');
  const [filters, setFilters]         = useState<Record<string, string>>({});
  const searchTracked = useRef(false);
  const [sortCol, setSortCol]         = useState(config.defaultSort.column);
  const [sortDir, setSortDir]         = useState<'asc' | 'desc'>(config.defaultSort.direction);
  const [visibleCount, setVisibleCount] = useState(BATCH);
  const [selected, setSelected]       = useState<Set<string>>(new Set());
  const [detailRow, setDetailRow]     = useState<Record<string, unknown> | null>(null);
  const [hiddenCols, setHiddenCols]   = useState<Set<string>>(new Set());
  const [showColPicker, setShowColPicker] = useState(false);

  // Filter bar drag-to-reorder state — seeded from saved config.filterOrder
  const [filterOrder, setFilterOrder] = useState<string[]>(() => config.filterOrder ?? []);
  const [filterDragKey, setFilterDragKey] = useState<string | null>(null);
  const filterDragOverKey = useRef<string | null>(null);

  // Sentinel element for infinite scroll
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Keep filterOrder in sync with filterable columns
  useEffect(() => {
    const keys = allFilterCols.map((c) => c.key);
    setFilterOrder((prev) => {
      const base = prev.length ? prev : (config.filterOrder ?? []);
      return [
        ...base.filter((k) => keys.includes(k)),
        ...keys.filter((k) => !base.includes(k)),
      ];
    });
  }, [allFilterCols]);

  const filterCols = useMemo(() => {
    if (!filterOrder.length) return allFilterCols;
    return [...allFilterCols].sort((a, b) => {
      const ai = filterOrder.indexOf(a.key);
      const bi = filterOrder.indexOf(b.key);
      return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
    });
  }, [allFilterCols, filterOrder]);

  const merged = useMemo(() => mergeRows(rawRows, primarySourceId), [rawRows, primarySourceId]);

  const filtered = useMemo(() => {
    let rows = merged;
    const q = search.toLowerCase().trim();
    if (q) {
      rows = rows.filter((row) =>
        searchCols.some((k) => getCellVal(row, k).toLowerCase().includes(q))
      );
    }
    for (const [col, val] of Object.entries(filters)) {
      if (!val) continue;
      rows = rows.filter((row) => getCellVal(row, col) === val);
    }
    return rows;
  }, [merged, search, filters, searchCols]);

  // Parse DD/MM/YYYY to a sortable timestamp; NaN if not a date
  const parseDMY = (s: string) => {
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    return m ? Date.UTC(+m[3], +m[2] - 1, +m[1]) : NaN;
  };

  const sorted = useMemo(() => {
    if (!sortCol) return filtered;
    return [...filtered].sort((a, b) => {
      const av = getCellVal(a, sortCol);
      const bv = getCellVal(b, sortCol);
      const ad = parseDMY(av);
      const bd = parseDMY(bv);
      const cmp = !isNaN(ad) && !isNaN(bd)
        ? ad - bd
        : av.localeCompare(bv, undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortCol, sortDir]);

  // Reset visible count when results change
  useEffect(() => { setVisibleCount(BATCH); }, [sorted]);

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((n) => Math.min(n + BATCH, sorted.length));
        }
      },
      { threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [sorted.length, visibleCount]);

  const paginated = sorted.slice(0, visibleCount);

  const toggleSort = (key: string) => {
    const nextDir = sortCol === key ? (sortDir === 'asc' ? 'desc' : 'asc') : 'asc';
    if (sortCol === key) setSortDir(nextDir as 'asc' | 'desc');
    else { setSortCol(key); setSortDir('asc'); }
    track('table_sort', { dashboard_title: dashboard.title, column: key, direction: nextDir });
  };

  const rowKey = (row: Record<string, unknown>) =>
    String(row.__row_key ?? row.__join_value);

  const toggleSelect = (key: string) => {
    setSelected((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });
  };

  const toggleAll = () => {
    if (selected.size === paginated.length) setSelected(new Set());
    else setSelected(new Set(paginated.map(rowKey)));
  };

  const filterOptions = (col: LinkedColumnConfig) => {
    const opts = new Set<string>();
    for (const row of filtered) {
      const v = getCellVal(row, col.key);
      if (v) opts.add(v);
    }
    return [...opts].sort();
  };

  const [showDownload, setShowDownload] = useState(false);

  const exportRows = () => selected.size > 0 ? sorted.filter((r) => selected.has(rowKey(r))) : sorted;
  const exportCols = () => visibleCols.filter((c) => !hiddenCols.has(c.key));
  const fileName   = () => dashboard.title.toLowerCase().replace(/\s+/g, '-');

  const downloadCSV = () => {
    const rows = exportRows();
    const cols = exportCols();
    const header = cols.map((c) => `"${c.label.replace(/"/g, '""')}"`).join(',');
    const csvRows = rows.map((row) =>
      cols.map((c) => `"${getCellVal(row, c.key).replace(/"/g, '""')}"`).join(',')
    );
    const csv = '﻿' + [header, ...csvRows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setShowDownload(false);
  };

  const downloadXLSX = () => {
    const rows = exportRows();
    const cols = exportCols();
    const data = [
      cols.map((c) => c.label),
      ...rows.map((row) => cols.map((c) => getCellVal(row, c.key))),
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data');
    XLSX.writeFile(wb, `${fileName()}.xlsx`);
    setShowDownload(false);
  };

  // Filter bar drag-to-reorder
  const handleFilterDragStart = (key: string) => setFilterDragKey(key);
  const handleFilterDragOver = (e: React.DragEvent, key: string) => {
    e.preventDefault();
    filterDragOverKey.current = key;
  };
  const handleFilterDrop = (dropKey: string) => {
    if (!filterDragKey || filterDragKey === dropKey) { setFilterDragKey(null); return; }
    setFilterOrder((prev) => {
      const next = [...prev];
      const fromIdx = next.indexOf(filterDragKey);
      const toIdx   = next.indexOf(dropKey);
      if (fromIdx < 0 || toIdx < 0) return prev;
      next.splice(fromIdx, 1);
      next.splice(toIdx, 0, filterDragKey);
      return next;
    });
    setFilterDragKey(null);
  };

  const displayCols = visibleCols.filter((c) => !hiddenCols.has(c.key));

  return (
    <div className="ld-view">
      {/* ── Hero ── */}
      <div className="ld-hero">
        <div className="ld-hero__wave-container">
          <img src={pearsonWave} alt="" role="presentation" className="ld-hero__wave" />
        </div>
        <div className="ld-hero__inner">
          <div className="ld-hero__logo">
            <PearsonLogo width={110} />
          </div>
          <h1 className="ld-hero__title">{dashboard.title}</h1>
          {dashboard.description && <p className="ld-hero__desc">{dashboard.description}</p>}
        </div>
      </div>

      {/* ── Search ── */}
      <div className="ld-search-bar">
        <div className="ld-search-bar__inner">
          <svg className="ld-search-bar__icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input
            className="ld-search-bar__input"
            placeholder={`Search all ${merged.length.toLocaleString()} records…`}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              if (e.target.value) {
                track('table_search', { dashboard_title: dashboard.title });
                if (!searchTracked.current) {
                  searchTracked.current = true;
                  trackEvent({ dashboardId: dashboard.id, eventType: 'search' });
                }
              } else {
                searchTracked.current = false;
              }
            }}
          />
          {search && (
            <button className="ld-search-bar__clear" onClick={() => setSearch('')}>✕</button>
          )}
        </div>
      </div>

      {/* ── Filters (draggable to reorder) ── */}
      {filterCols.length > 0 && (
        <div className="ld-filters">
          <div className="ld-filters__inner">
            {filterCols.map((col) => (
              <div
                key={col.key}
                className={`ld-filter-wrap ${filterDragKey === col.key ? 'ld-filter-wrap--dragging' : ''}`}
                draggable
                onDragStart={() => handleFilterDragStart(col.key)}
                onDragOver={(e) => handleFilterDragOver(e, col.key)}
                onDrop={() => handleFilterDrop(col.key)}
                onDragEnd={() => setFilterDragKey(null)}
              >
                <span className="ld-filter-drag" title="Drag to reorder">⠿</span>
                <select
                  className="ld-filter-select"
                  value={filters[col.key] ?? ''}
                  onChange={(e) => {
                    setFilters((f) => ({ ...f, [col.key]: e.target.value }));
                    if (e.target.value) {
                      track('table_filter', { dashboard_title: dashboard.title, column: col.key, value: e.target.value });
                      trackEvent({ dashboardId: dashboard.id, eventType: 'filter', eventData: { column: col.label } });
                    }
                  }}
                >
                  <option value="">{col.filterPlaceholder ?? `All ${col.label}s`}</option>
                  {filterOptions(col).map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
            ))}
            {Object.values(filters).some(Boolean) && (
              <button className="ld-filter-reset" onClick={() => setFilters({})}>
                Reset filters
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Action buttons ── */}
      {config.actionButtons && config.actionButtons.length > 0 && (
        <div className="ld-action-btns">
          {config.actionButtons.map((btn) => (
            <a
              key={btn.label}
              href={btn.url}
              target="_blank"
              rel="noreferrer"
              className="ld-action-btn"
              onClick={() => trackEvent({ dashboardId: dashboard.id, eventType: 'button_click', eventData: { label: btn.label } })}
            >
              {btn.emoji && <span>{btn.emoji}</span>}
              {btn.label}
            </a>
          ))}
        </div>
      )}

      {/* ── Results toolbar ── */}
      <div className="ld-toolbar">
        <div className="ld-toolbar__left">
          <span className="ld-toolbar__count">
            {filtered.length < merged.length
              ? `${filtered.length.toLocaleString()} of ${merged.length.toLocaleString()} results`
              : `${merged.length.toLocaleString()} results`}
          </span>
          {selected.size > 0 && (
            <span className="ld-toolbar__selected-badge">{selected.size} selected</span>
          )}
        </div>
        <div className="ld-toolbar__right">
          <div style={{ position: 'relative' }}>
            <button className="ld-toolbar-btn" onClick={() => setShowColPicker((v) => !v)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
              Columns
            </button>
            {showColPicker && (
              <div className="ld-col-picker">
                {visibleCols.map((col) => (
                  <label key={col.key} className="ld-col-picker__item">
                    <input
                      type="checkbox"
                      checked={!hiddenCols.has(col.key)}
                      onChange={(e) => {
                        setHiddenCols((s) => { const n = new Set(s); e.target.checked ? n.delete(col.key) : n.add(col.key); return n; });
                      }}
                    />
                    <span>{col.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <div style={{ position: 'relative' }}>
            <button
              className="ld-toolbar-btn ld-toolbar-btn--primary"
              onClick={() => setShowDownload((v) => !v)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              {selected.size > 0 ? `Download ${selected.size} rows` : 'Download'}
              <span style={{ fontSize: 10, marginLeft: 2 }}>{showDownload ? '▲' : '▼'}</span>
            </button>
            {showDownload && (
              <div className="ld-download-menu">
                <button className="ld-download-menu__item" onClick={downloadXLSX}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22A051" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  Excel (.xlsx)
                </button>
                <button className="ld-download-menu__item" onClick={downloadCSV}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1A6FBF" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  CSV (.csv)
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Data refresh notice ── */}
      {config.dataRefresh?.enabled && config.dataRefresh.lastUpdated && (
        <div className="ld-data-refresh">
          <p className="ld-data-refresh__date">
            <span>📋</span>
            <strong>Data last refreshed:</strong>{' '}
            {new Date(config.dataRefresh.lastUpdated).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
          </p>
          {config.dataRefresh.customText && (
            <p className="ld-data-refresh__note">
              <span>💡</span> <em>{config.dataRefresh.customText}</em>
            </p>
          )}
        </div>
      )}

      {/* ── Table ── */}
      <div className="ld-table-wrap">
        <table className="ld-table">
          <thead>
            <tr>
              <th className="ld-table__th-check">
                <input
                  type="checkbox"
                  checked={paginated.length > 0 && selected.size === paginated.length}
                  onChange={toggleAll}
                />
              </th>
              {displayCols.map((col) => (
                <th key={col.key} onClick={() => toggleSort(col.key)} className="ld-table__th">
                  <span className="ld-table__th-inner">
                    {col.label}
                    <span className="ld-table__sort-icon">
                      {sortCol === col.key ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
                    </span>
                  </span>
                </th>
              ))}
              <th className="ld-table__th ld-table__th-detail">Details</th>
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={displayCols.length + 2} className="ld-table__empty">
                  <div style={{ textAlign: 'center', padding: '40px 24px' }}>
                    <p style={{ fontSize: 24, marginBottom: 8 }}>🔍</p>
                    <p style={{ fontWeight: 600 }}>No results found</p>
                    <p style={{ color: '#999', fontSize: 13 }}>Try adjusting your search or filters</p>
                  </div>
                </td>
              </tr>
            ) : (
              paginated.map((row) => {
                const key = rowKey(row);
                const isSelected = selected.has(key);
                return (
                  <tr key={key} className={`ld-table__row ${isSelected ? 'ld-table__row--selected' : ''}`}>
                    <td className="ld-table__td-check" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(key)} />
                    </td>
                    {displayCols.map((col) => {
                      const val = getCellVal(row, col.key);
                      return (
                        <td key={col.key} className="ld-table__td" onClick={() => setDetailRow(row)}>
                          {col.type === 'badge' && val ? (
                            <span className="ld-badge">{val}</span>
                          ) : col.type === 'url' && val ? (
                            <a href={val.startsWith('http') ? val : `https://${val}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>View ↗</a>
                          ) : val || <span className="ld-empty-cell">—</span>}
                        </td>
                      );
                    })}
                    <td className="ld-table__td" onClick={() => setDetailRow(row)}>
                      <button className="ld-detail-btn">Details</button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Infinite scroll sentinel */}
        <div ref={sentinelRef} className="ld-scroll-sentinel" />
        {visibleCount < sorted.length && (
          <div className="ld-scroll-loading">
            <div className="spinner" style={{ borderTopColor: '#5B2D86' }} />
            <span className="text-xs text-muted">Loading more…</span>
          </div>
        )}
        {sorted.length > 0 && visibleCount >= sorted.length && sorted.length > BATCH && (
          <p className="ld-scroll-end">All {sorted.length.toLocaleString()} results shown</p>
        )}
      </div>

      {/* ── Details modal ── */}
      {detailRow && (
        <div className="ld-modal-overlay" onClick={() => setDetailRow(null)}>
          <div className="ld-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ld-modal__header">
              <h2 className="ld-modal__title">Assessment Details</h2>
              <button className="ld-modal__close" onClick={() => setDetailRow(null)}>✕</button>
            </div>
            <hr className="ld-modal__divider" />
            <div className="ld-modal__body">
              <table className="ld-modal__table">
                <tbody>
                  {config.columns
                    .filter((c) => c.inDetails === true || (c.visible && c.inDetails !== false))
                    .map((col) => {
                      const val = getCellVal(detailRow, col.key);
                      if (!val) return null;
                      return (
                        <tr key={col.key}>
                          <td className="ld-modal__label">
                            <span className="ld-modal__label-inner">{col.label}</span>
                          </td>
                          <td className="ld-modal__value">
                            {col.type === 'url'
                              ? <a href={val.startsWith('http') ? val : `https://${val}`} target="_blank" rel="noreferrer">{val} ↗</a>
                              : val}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
