import { useMemo, useState } from 'react';
import type { TableConfig, TableRow, ColumnConfig, CardViewConfig, StatCardsConfig, IntroBannerConfig, CalloutBoxConfig, FooterNoteConfig } from '../../lib/types';
import TablePagination from './TablePagination';
import './PublicTableView.css';

const PAGE_SIZE = 25;

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
  const [search, setSearch]       = useState('');
  const [filters, setFilters]     = useState<Record<string, string[]>>({});
  const [sortCol, setSortCol]     = useState(config.defaultSort.column);
  const [sortDir, setSortDir]     = useState<'asc' | 'desc'>(config.defaultSort.direction);
  const [page, setPage]           = useState(1);
  const [viewMode, setViewMode]   = useState<'table' | 'card'>('table');

  const visibleCols  = useMemo(() => config.columns.filter((c) => c.visible), [config.columns]);
  const filterCols   = useMemo(() => visibleCols.filter((c) => c.filterable), [visibleCols]);
  const badgeCols    = useMemo(() => visibleCols.filter((c) => c.type === 'badge'), [visibleCols]);
  const badgeColKeys = useMemo(() => badgeCols.map((c) => c.key), [badgeCols]);
  const searchCols   = useMemo(() => config.columns.filter((c) => c.searchable).map((c) => c.key), [config.columns]);

  // Widgets
  const widgets       = config.widgets ?? [];
  const introWidget   = widgets.find((w) => w.type === 'intro_banner');
  const statWidget    = widgets.find((w) => w.type === 'stat_cards');
  const calloutWidget = widgets.find((w) => w.type === 'callout_box');
  const cardWidget    = widgets.find((w) => w.type === 'card_view');
  const footerWidget  = widgets.find((w) => w.type === 'footer_note');

  const activeFilters = Object.entries(filters).filter(([, vals]) => vals.length > 0);

  const contextualOptions = useMemo(() => {
    const opts: Record<string, string[]> = {};
    for (const col of filterCols) {
      const otherFiltered = rows.filter((row) =>
        activeFilters.every(([key, vals]) => key === col.key || vals.includes(String(row.data[key] ?? ''))),
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

  const addFilter    = (key: string, val: string) => { setFilters((f) => ({ ...f, [key]: [...(f[key] ?? []), val] })); setPage(1); };
  const removeFilter = (key: string, val: string) => { setFilters((f) => ({ ...f, [key]: (f[key] ?? []).filter((v) => v !== val) })); setPage(1); };
  const resetAll     = () => { setFilters({}); setSearch(''); setPage(1); };

  const hasActiveFilters = search.trim() || activeFilters.length > 0;

  const filtered = useMemo(() => {
    let result = rows;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((row) => searchCols.some((k) => String(row.data[k] ?? '').toLowerCase().includes(q)));
    }
    for (const [key, vals] of activeFilters) {
      result = result.filter((row) => vals.includes(String(row.data[key] ?? '')));
    }
    return result;
  }, [rows, search, activeFilters, searchCols]);

  const sorted = useMemo(() => (
    [...filtered].sort((a, b) => {
      const cmp = String(a.data[sortCol] ?? '').localeCompare(String(b.data[sortCol] ?? ''), undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    })
  ), [filtered, sortCol, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paginated  = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

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
    if (col.type === 'badge') return <span className="pub-badge" style={getBadgeStyle(col.key, badgeColKeys)}>{val}</span>;
    return val;
  };

  // ── Stat cards ─────────────────────────────────────────────────────────────
  const computedStats = useMemo(() => {
    if (!statWidget) return [];
    return (statWidget.config as StatCardsConfig).stats.map((s) => {
      if (s.type === 'total_rows') return { label: s.label, value: rows.length.toLocaleString() };
      if (s.type === 'unique_values' && s.column) {
        const count = new Set(rows.map((r) => r.data[s.column!])).size;
        return { label: s.label, value: count.toLocaleString() };
      }
      return { label: s.label, value: '—' };
    });
  }, [statWidget, rows]);

  // ── Card grid renderer ─────────────────────────────────────────────────────
  const renderCardGrid = () => {
    const cvc = cardWidget!.config as CardViewConfig;
    if (paginated.length === 0) return (
      <div className="pub-view__empty-state">
        <div className="pub-view__empty-icon">🔍</div>
        <h4>No results found</h4>
        <p>Try adjusting your filters or search term.</p>
      </div>
    );
    return (
      <div className="pub-card-grid">
        {paginated.map((row) => {
          const title = String(row.data[cvc.titleColumn] ?? '');
          const subtitle = cvc.subtitleColumn ? String(row.data[cvc.subtitleColumn] ?? '') : '';
          const desc = cvc.descriptionColumn ? String(row.data[cvc.descriptionColumn] ?? '') : '';
          const link = cvc.linkColumn ? String(row.data[cvc.linkColumn] ?? '') : '';
          const badges = (cvc.badgeColumns ?? [])
            .map((key) => ({ key, value: String(row.data[key] ?? '') }))
            .filter((b) => b.value);
          return (
            <div key={row.id} className="pub-card">
              <div className="pub-card__header">
                <h3 className="pub-card__title">{title}</h3>
              </div>
              {(subtitle || badges.length > 0) && (
                <div className="pub-card__body">
                  {subtitle && <p className="pub-card__subtitle">{subtitle}</p>}
                  {badges.length > 0 && (
                    <div className="pub-card__badges">
                      {badges.map((b) => (
                        <span key={b.key} className="pub-badge" style={getBadgeStyle(b.key, badgeColKeys)}>{b.value}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {desc && <div className="pub-card__desc-box"><p>{desc}</p></div>}
              {link && (
                <div className="pub-card__footer">
                  <a href={link.startsWith('http') ? link : `https://${link}`} target="_blank" rel="noreferrer" className="pub-card__link-btn">
                    View details ↗
                  </a>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="pub-view">

      {/* ── Intro banner ── */}
      {introWidget && (() => {
        const c = introWidget.config as IntroBannerConfig;
        return (
          <div className="pub-widget-intro">
            <h1 className="pub-widget-intro__heading">{c.heading}</h1>
            {c.subtitle && <p className="pub-widget-intro__sub">{c.subtitle}</p>}
          </div>
        );
      })()}

      {/* ── Stat cards ── */}
      {statWidget && computedStats.length > 0 && (
        <div className="pub-widget-stats">
          {computedStats.map((s, i) => (
            <div key={i} className="pub-widget-stat">
              <span className="pub-widget-stat__value">{s.value}</span>
              <span className="pub-widget-stat__label">{s.label}</span>
            </div>
          ))}
        </div>
      )}

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
              const selected  = filters[col.key] ?? [];
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
                  <select className="pub-view__select" value="" onChange={(e) => { if (e.target.value) addFilter(col.key, e.target.value); }}>
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

      {/* ── Callout box ── */}
      {calloutWidget && (
        <div className="pub-widget-callout">
          <p>{(calloutWidget.config as CalloutBoxConfig).text}</p>
        </div>
      )}

      {/* ── Results ── */}
      <div className="pub-view__results">
        <div className="pub-view__results-header">
          <h3 className="pub-view__results-title">
            {filtered.length === rows.length
              ? `${rows.length.toLocaleString()} results`
              : `${filtered.length.toLocaleString()} of ${rows.length.toLocaleString()} results`}
          </h3>
          {cardWidget && (
            <div className="pub-view-toggle">
              <button className={`pub-view-toggle__btn ${viewMode === 'table' ? 'pub-view-toggle__btn--active' : ''}`} onClick={() => setViewMode('table')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 9h18M3 15h18M9 3v18"/></svg>
                Table
              </button>
              <button className={`pub-view-toggle__btn ${viewMode === 'card' ? 'pub-view-toggle__btn--active' : ''}`} onClick={() => setViewMode('card')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="9" height="9" rx="1"/><rect x="13" y="3" width="9" height="9" rx="1"/><rect x="2" y="12" width="9" height="9" rx="1"/><rect x="13" y="12" width="9" height="9" rx="1"/></svg>
                Cards
              </button>
            </div>
          )}
        </div>

        {viewMode === 'card' && cardWidget ? renderCardGrid() : (
          <>
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
          </>
        )}

        {viewMode === 'card' && totalPages > 1 && (
          <TablePagination page={page} totalPages={totalPages} onChange={setPage} total={sorted.length} />
        )}
      </div>

      {/* ── Footer note ── */}
      {footerWidget && (() => {
        const c = footerWidget.config as FooterNoteConfig;
        return (
          <div className="pub-widget-footer">
            <span>{c.text}</span>
            {c.showCount && <span className="pub-widget-footer__count">· {rows.length.toLocaleString()} records</span>}
          </div>
        );
      })()}

    </div>
  );
}
