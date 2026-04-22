import { useMemo, useState } from 'react';
import type { TableConfig, TableRow, ColumnConfig } from '../../lib/types';
import TablePagination from './TablePagination';
import './PublicTableView.css';

const PAGE_SIZE = 25;

// Consistent per-column badge colours (matching degreefinder palette)
const BADGE_COL_COLORS = [
  { bg: '#5B2D86', text: '#fff' },
  { bg: '#D4C5E8', text: '#5B2D86' },
  { bg: '#E8F0FF', text: '#1A4D8F' },
  { bg: '#F5F5F5', text: '#0D004D', border: '#D0D0D0' },
  { bg: '#E8F5F5', text: '#1A7373' },
  { bg: '#FFF9F0', text: '#C25100' },
];

function getBadgeStyle(colKey: string, badgeColKeys: string[]) {
  const idx = badgeColKeys.indexOf(colKey);
  const c = BADGE_COL_COLORS[idx % BADGE_COL_COLORS.length];
  return { backgroundColor: c.bg, color: c.text, border: c.border ? `1px solid ${c.border}` : undefined };
}

interface Props {
  config: TableConfig;
  rows: TableRow[];
}

export default function PublicTableView({ config, rows }: Props) {
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Record<string, string[]>>({});
  const [sortCol, setSortCol] = useState(config.defaultSort.column);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(config.defaultSort.direction);
  const [page, setPage] = useState(1);

  const visibleCols = useMemo(() => config.columns.filter((c) => c.visible), [config.columns]);
  const filterCols  = useMemo(() => visibleCols.filter((c) => c.filterable), [visibleCols]);
  const badgeCols   = useMemo(() => visibleCols.filter((c) => c.type === 'badge'), [visibleCols]);
  const badgeColKeys = useMemo(() => badgeCols.map((c) => c.key), [badgeCols]);
  const searchCols  = useMemo(() => config.columns.filter((c) => c.searchable).map((c) => c.key), [config.columns]);

  const activeFilters = Object.entries(filters).filter(([, vals]) => vals.length > 0);

  // Contextual options: for each filter col, show options available given all OTHER active filters
  const contextualOptions = useMemo(() => {
    const opts: Record<string, string[]> = {};
    for (const col of filterCols) {
      const otherFiltered = rows.filter((row) =>
        activeFilters.every(([key, vals]) => {
          if (key === col.key) return true;
          return vals.includes(String(row.data[key] ?? ''));
        }),
      );
      const vals = new Set<string>();
      for (const row of otherFiltered) {
        const v = String(row.data[col.key] ?? '').trim();
        if (v) vals.add(v);
      }
      opts[col.key] = Array.from(vals).sort();
    }
    return opts;
  }, [filterCols, rows, activeFilters]);

  const addFilter = (key: string, val: string) => {
    setFilters((f) => ({ ...f, [key]: [...(f[key] ?? []), val] }));
    setPage(1);
  };
  const removeFilter = (key: string, val: string) => {
    setFilters((f) => ({ ...f, [key]: (f[key] ?? []).filter((v) => v !== val) }));
    setPage(1);
  };
  const resetAll = () => { setFilters({}); setSearch(''); setPage(1); };

  const hasActiveFilters = search.trim() || activeFilters.length > 0;

  const filtered = useMemo(() => {
    let result = rows;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((row) =>
        searchCols.some((k) => String(row.data[k] ?? '').toLowerCase().includes(q)),
      );
    }
    for (const [key, vals] of activeFilters) {
      result = result.filter((row) => vals.includes(String(row.data[key] ?? '')));
    }
    return result;
  }, [rows, search, activeFilters, searchCols]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const cmp = String(a.data[sortCol] ?? '').localeCompare(String(b.data[sortCol] ?? ''), undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortCol, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleSort = (key: string) => {
    if (sortCol === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortCol(key); setSortDir('asc'); }
    setPage(1);
  };

  const renderCell = (col: ColumnConfig, row: TableRow) => {
    const raw = row.data[col.key];
    const val = raw !== null && raw !== undefined ? String(raw) : '';
    if (!val) return <span style={{ color: '#bbb' }}>—</span>;
    if (col.type === 'url') return <a href={val.startsWith('http') ? val : `https://${val}`} target="_blank" rel="noreferrer">View ↗</a>;
    if (col.type === 'badge') {
      const style = getBadgeStyle(col.key, badgeColKeys);
      return <span className="pub-badge" style={style}>{val}</span>;
    }
    return val;
  };

  return (
    <div className="pub-view">
      {/* ── Search & filter card ── */}
      <div className="pub-view__search-card">
        <h2 className="pub-view__card-title">{config.title}</h2>
        {config.description && <p className="pub-view__card-sub">{config.description}</p>}

        {searchCols.length > 0 && (
          <div className="pub-view__search-wrap">
            <input
              className="pub-view__search-input"
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder={`Search ${config.columns.find((c) => c.key === config.primarySearchColumn)?.label ?? ''}…`}
            />
            {search && (
              <button className="pub-view__search-clear" onClick={() => setSearch('')} aria-label="Clear">✕</button>
            )}
          </div>
        )}

        {filterCols.length > 0 && (
          <div className="pub-view__filters-grid">
            {filterCols.map((col) => {
              const selected = filters[col.key] ?? [];
              const available = (contextualOptions[col.key] ?? []).filter((o) => !selected.includes(o));
              return (
                <div key={col.key} className="pub-view__form-field">
                  <label className="pub-view__form-label">{col.label}</label>
                  {selected.length > 0 && (
                    <div className="pub-view__chips">
                      {selected.map((v) => (
                        <span key={v} className="pub-view__chip">
                          {v}
                          <button className="pub-view__chip-remove" onClick={() => removeFilter(col.key, v)} aria-label={`Remove ${v}`}>✕</button>
                        </span>
                      ))}
                    </div>
                  )}
                  <select
                    className="pub-view__select"
                    value=""
                    onChange={(e) => { if (e.target.value) addFilter(col.key, e.target.value); }}
                  >
                    <option value="">All {col.label}s</option>
                    {available.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
              );
            })}
          </div>
        )}

        {hasActiveFilters && (
          <div className="pub-view__filter-actions">
            <button className="pub-view__btn-reset" onClick={resetAll}>Reset filters</button>
          </div>
        )}

        {badgeCols.length > 0 && (
          <div className="pub-view__legend">
            <h3 className="pub-view__legend-title">Result Badge Guide</h3>
            <div className="pub-view__legend-items">
              {badgeCols.map((col) => (
                <div key={col.key} className="pub-view__legend-item">
                  <span className="pub-badge pub-badge--legend" style={getBadgeStyle(col.key, badgeColKeys)}>&nbsp;&nbsp;&nbsp;&nbsp;</span>
                  <span className="pub-view__legend-label">{col.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Results ── */}
      <div className="pub-view__results">
        <div className="pub-view__results-header">
          <h3 className="pub-view__results-title">
            {filtered.length === rows.length
              ? `${rows.length.toLocaleString()} results`
              : `${filtered.length.toLocaleString()} of ${rows.length.toLocaleString()} results`}
          </h3>
        </div>

        <div className="pub-view__table-scroll">
          <table className="pub-view__table">
            <thead>
              <tr>
                {visibleCols.map((col) => (
                  <th key={col.key} onClick={() => handleSort(col.key)} className={col.type === 'number' ? 'pub-view__th--num' : ''}>
                    <span className="pub-view__th-inner">
                      {col.label}
                      <span className="pub-view__sort-icon">{sortCol === col.key ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={visibleCols.length} className="pub-view__empty">
                    <div className="pub-view__empty-icon">🔍</div>
                    <h4>No results found</h4>
                    <p>Try adjusting your filters or search term.</p>
                  </td>
                </tr>
              ) : (
                paginated.map((row) => (
                  <tr key={row.id}>
                    {visibleCols.map((col) => (
                      <td key={col.key} className={col.type === 'number' ? 'pub-view__td--num' : ''}>{renderCell(col, row)}</td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <TablePagination page={page} totalPages={totalPages} onChange={setPage} total={sorted.length} />
        )}
      </div>
    </div>
  );
}
