import { useMemo, useState } from 'react';
import type { LinkedDashboard, LinkedRow, LinkedColumnConfig } from '../../lib/types';
import './LinkedDashboardView.css';

interface Props {
  dashboard: LinkedDashboard;
  rawRows: LinkedRow[];
  primarySourceId?: string; // source_id of the primary (timetable) source; derived from first linked_source by created_at
}

// Normalize an examination code for cross-source matching.
// Tech Award timetable codes use "/01" suffixes (BAC03/01) while overview codes don't (BAC03).
function normalizeCode(code: string): string {
  return code.replace(/\/\d+$/, '').trim().toUpperCase();
}

// Merge rows from multiple sources into display rows.
// primarySourceId = the source_id of the timetable (first uploaded source, by created_at).
// Each primary row becomes its own display row, enriched with data from the secondary
// sources (overview tabs) matched by normalized examination code.
// Falls back to "source with most rows" when primarySourceId is not provided.
function mergeRows(rawRows: LinkedRow[], primarySourceId?: string): Record<string, unknown>[] {
  const sourceIds = [...new Set(rawRows.map((r) => r.source_id))];

  if (sourceIds.length === 1) {
    // Single source — every row is its own display row
    return rawRows
      .slice()
      .sort((a, b) => a.row_index - b.row_index)
      .map((r, i) => ({
        __join_value: r.join_value,
        __row_key: `${r.source_id}_${r.row_index}_${i}`,
        ...r.data,
      }));
  }

  // Identify primary and secondary sources.
  // Prefer the explicitly provided primarySourceId; fall back to most-rows heuristic.
  const resolvedPrimaryId = primarySourceId && sourceIds.includes(primarySourceId)
    ? primarySourceId
    : sourceIds
        .map((id) => ({ id, count: rawRows.filter((r) => r.source_id === id).length }))
        .sort((a, b) => b.count - a.count)[0].id;

  const primaryRows   = rawRows.filter((r) => r.source_id === resolvedPrimaryId);
  const secondaryRows = rawRows.filter((r) => r.source_id !== resolvedPrimaryId);

  // Build a lookup from normalized code → merged secondary data
  const lookup = new Map<string, Record<string, unknown>>();
  for (const row of secondaryRows) {
    const key = normalizeCode(row.join_value);
    if (!lookup.has(key)) lookup.set(key, {});
    Object.assign(lookup.get(key)!, row.data);
  }

  return primaryRows
    .slice()
    .sort((a, b) => a.row_index - b.row_index)
    .map((row, i) => {
      const key = normalizeCode(row.join_value);
      const secondary = lookup.get(key) ?? {};
      return {
        __join_value: row.join_value,
        __row_key: `${row.source_id}_${row.row_index}_${i}`,
        ...secondary,   // overview data first (lower priority)
        ...row.data,    // timetable data wins
      };
    });
}

function getCellVal(row: Record<string, unknown>, key: string): string {
  const v = row[key];
  return v !== null && v !== undefined ? String(v).trim() : '';
}

const PAGE_SIZE = 50;

export default function LinkedDashboardView({ dashboard, rawRows, primarySourceId }: Props) {
  const { config } = dashboard;
  const visibleCols = useMemo(() => config.columns.filter((c) => c.visible), [config.columns]);
  const filterCols  = useMemo(() => visibleCols.filter((c) => c.filterable), [visibleCols]);
  const searchCols  = useMemo(() => config.columns.filter((c) => c.searchable).map((c) => c.key), [config.columns]);

  const [search, setSearch]       = useState('');
  const [filters, setFilters]     = useState<Record<string, string>>({});
  const [sortCol, setSortCol]     = useState(config.defaultSort.column);
  const [sortDir, setSortDir]     = useState<'asc' | 'desc'>(config.defaultSort.direction);
  const [page, setPage]           = useState(1);
  const [selected, setSelected]   = useState<Set<string>>(new Set());
  const [detailRow, setDetailRow] = useState<Record<string, unknown> | null>(null);
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set());
  const [showColPicker, setShowColPicker] = useState(false);

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

  // Parse DD/MM/YYYY to a sortable number; returns NaN if not a date
  const parseDMY = (s: string): number => {
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return NaN;
    return Date.UTC(+m[3], +m[2] - 1, +m[1]);
  };

  const sorted = useMemo(() => {
    if (!sortCol) return filtered;
    return [...filtered].sort((a, b) => {
      const av = getCellVal(a, sortCol);
      const bv = getCellVal(b, sortCol);
      // Try date-aware comparison first
      const ad = parseDMY(av);
      const bd = parseDMY(bv);
      const cmp = (!isNaN(ad) && !isNaN(bd))
        ? ad - bd
        : av.localeCompare(bv, undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortCol, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paginated  = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggleSort = (key: string) => {
    if (sortCol === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(key); setSortDir('asc'); }
    setPage(1);
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

  const downloadCSV = () => {
    const rows = selected.size > 0
      ? sorted.filter((r) => selected.has(rowKey(r)))
      : sorted;
    const cols = visibleCols.filter((c) => !hiddenCols.has(c.key));
    const header = cols.map((c) => `"${c.label.replace(/"/g, '""')}"`).join(',');
    const csvRows = rows.map((row) =>
      cols.map((c) => `"${getCellVal(row, c.key).replace(/"/g, '""')}"`).join(',')
    );
    const csv = '﻿' + [header, ...csvRows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${dashboard.title.toLowerCase().replace(/\s+/g, '-')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const displayCols = visibleCols.filter((c) => !hiddenCols.has(c.key));

  return (
    <div className="ld-view">
      {/* Hero */}
      <div className="ld-hero">
        <div className="ld-hero__inner">
          <h1 className="ld-hero__title">{dashboard.title}</h1>
          {dashboard.description && <p className="ld-hero__desc">{dashboard.description}</p>}
        </div>
      </div>

      {/* Search */}
      <div className="ld-search-bar">
        <div className="ld-search-bar__inner">
          <svg className="ld-search-bar__icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input
            className="ld-search-bar__input"
            placeholder={`Search ${merged.length.toLocaleString()} records…`}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
          {search && (
            <button className="ld-search-bar__clear" onClick={() => setSearch('')}>✕</button>
          )}
        </div>
      </div>

      {/* Filters */}
      {filterCols.length > 0 && (
        <div className="ld-filters">
          <div className="ld-filters__inner">
            {filterCols.map((col) => (
              <select
                key={col.key}
                className="ld-filter-select"
                value={filters[col.key] ?? ''}
                onChange={(e) => { setFilters((f) => ({ ...f, [col.key]: e.target.value })); setPage(1); }}
              >
                <option value="">All {col.label}s</option>
                {filterOptions(col).map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            ))}
            {Object.values(filters).some(Boolean) && (
              <button className="ld-filter-reset" onClick={() => { setFilters({}); setPage(1); }}>
                Reset filters
              </button>
            )}
          </div>
        </div>
      )}

      {/* Results toolbar */}
      <div className="ld-toolbar">
        <div className="ld-toolbar__left">
          <span className="ld-toolbar__count">
            {filtered.length < merged.length
              ? `${filtered.length.toLocaleString()} of ${merged.length.toLocaleString()} results`
              : `${merged.length.toLocaleString()} results`}
          </span>
          {selected.size > 0 && (
            <span className="ld-toolbar__selected-badge">
              {selected.size} selected
            </span>
          )}
        </div>
        <div className="ld-toolbar__right">
          {/* Column picker */}
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

          <button
            className="ld-toolbar-btn ld-toolbar-btn--primary"
            onClick={downloadCSV}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            {selected.size > 0 ? `Download ${selected.size} rows` : 'Download CSV'}
          </button>
        </div>
      </div>

      {/* Table */}
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
              <th className="ld-table__th ld-table__th-detail" />
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={displayCols.length + 2} className="ld-table__empty">
                  <div style={{ textAlign: 'center', padding: '40px 24px' }}>
                    <p style={{ fontSize: 24, marginBottom: 8 }}>🔍</p>
                    <p style={{ fontWeight: 600 }}>No results found</p>
                    <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>Try adjusting your search or filters</p>
                  </div>
                </td>
              </tr>
            ) : (
              paginated.map((row) => {
                const key = rowKey(row);
                const isSelected = selected.has(key);
                return (
                  <tr
                    key={key}
                    className={`ld-table__row ${isSelected ? 'ld-table__row--selected' : ''}`}
                  >
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
                          ) : val || <span style={{ color: '#ccc' }}>—</span>}
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
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="ld-pagination">
          <button className="ld-pager-btn" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>← Prev</button>
          <span className="ld-pager-info">Page {page} of {totalPages}</span>
          <button className="ld-pager-btn" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>Next →</button>
        </div>
      )}

      {/* Details modal */}
      {detailRow && (
        <div className="ld-modal-overlay" onClick={() => setDetailRow(null)}>
          <div className="ld-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ld-modal__header">
              <h2 className="ld-modal__title">
                {getCellVal(detailRow, 'Component Name') ||
                 getCellVal(detailRow, 'Title') ||
                 getCellVal(detailRow, '__join_value') ||
                 'Details'}
              </h2>
              <button className="ld-modal__close" onClick={() => setDetailRow(null)}>✕</button>
            </div>
            <div className="ld-modal__body">
              <table className="ld-modal__table">
                <tbody>
                  {config.columns.filter((c) => c.inDetails === true || (c.visible && c.inDetails !== false)).map((col) => {
                    const val = getCellVal(detailRow, col.key);
                    if (!val) return null;
                    return (
                      <tr key={col.key}>
                        <td className="ld-modal__label">{col.label}</td>
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
