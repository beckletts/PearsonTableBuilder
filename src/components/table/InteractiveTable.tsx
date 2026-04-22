import { useMemo, useState } from 'react';
import type { TableConfig, TableRow } from '../../lib/types';
import TableSearch from './TableSearch';
import TableFilters from './TableFilters';
import TablePagination from './TablePagination';
import './InteractiveTable.css';

const PAGE_SIZE = 25;

function badgeColor(value: string): string {
  // Deterministic colour from string hash
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  const palettes = ['badge-blue', 'badge-purple', 'badge-yellow', 'badge-green', 'badge-grey'];
  return palettes[Math.abs(hash) % palettes.length];
}

interface Props {
  config: TableConfig;
  rows: TableRow[];
  variant?: 'default' | 'pearson';
}

export default function InteractiveTable({ config, rows, variant = 'default' }: Props) {
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sortCol, setSortCol] = useState(config.defaultSort.column);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(config.defaultSort.direction);
  const [page, setPage] = useState(1);

  const visibleCols = useMemo(
    () => config.columns.filter((c) => c.visible),
    [config.columns],
  );

  const filterableCols = useMemo(
    () => config.columns.filter((c) => c.filterable && c.visible),
    [config.columns],
  );

  // Build distinct values for each filterable column
  const filterOptions = useMemo(() => {
    const opts: Record<string, string[]> = {};
    for (const col of filterableCols) {
      const vals = new Set<string>();
      for (const row of rows) {
        const v = String(row.data[col.key] ?? '').trim();
        if (v) vals.add(v);
      }
      opts[col.key] = Array.from(vals).sort();
    }
    return opts;
  }, [filterableCols, rows]);

  const searchableCols = useMemo(
    () => config.columns.filter((c) => c.searchable).map((c) => c.key),
    [config.columns],
  );

  const filtered = useMemo(() => {
    let result = rows;

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((row) =>
        searchableCols.some((key) =>
          String(row.data[key] ?? '').toLowerCase().includes(q),
        ),
      );
    }

    for (const [key, val] of Object.entries(filters)) {
      if (!val) continue;
      result = result.filter((row) => String(row.data[key] ?? '') === val);
    }

    return result;
  }, [rows, search, filters, searchableCols]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = a.data[sortCol] ?? '';
      const bv = b.data[sortCol] ?? '';
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortCol, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleSort = (key: string) => {
    if (sortCol === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(key);
      setSortDir('asc');
    }
    setPage(1);
  };

  const handleFilter = (key: string, val: string) => {
    setFilters((f) => ({ ...f, [key]: val }));
    setPage(1);
  };

  const handleSearch = (val: string) => {
    setSearch(val);
    setPage(1);
  };

  const clearAll = () => {
    setSearch('');
    setFilters({});
    setPage(1);
  };

  const hasActiveFilters = search.trim() || Object.values(filters).some(Boolean);

  return (
    <div className={`itable${variant === 'pearson' ? ' itable--pearson' : ''}`}>
      <div className="itable__controls">
        {searchableCols.length > 0 && (
          <TableSearch
            value={search}
            onChange={handleSearch}
            placeholder={`Search ${config.columns.find((c) => c.key === config.primarySearchColumn)?.label ?? ''}…`}
          />
        )}
        {filterableCols.length > 0 && (
          <TableFilters
            columns={filterableCols}
            options={filterOptions}
            values={filters}
            onChange={handleFilter}
          />
        )}
        {hasActiveFilters && (
          <button className="btn btn-ghost btn-sm" onClick={clearAll}>
            Clear all
          </button>
        )}
      </div>

      <div className="itable__meta">
        <span className="text-sm text-muted">
          {filtered.length === rows.length
            ? `${rows.length.toLocaleString()} records`
            : `${filtered.length.toLocaleString()} of ${rows.length.toLocaleString()} records`}
        </span>
      </div>

      <div className="itable__scroll">
        <table className="itable__table">
          <thead>
            <tr>
              {visibleCols.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className={col.type === 'number' ? 'itable__th--num' : ''}
                >
                  <span className="itable__th-inner">
                    {col.label}
                    <span className="itable__sort-icon">
                      {sortCol === col.key ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
                    </span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={visibleCols.length} className="itable__empty">
                  No records match your filters.
                </td>
              </tr>
            ) : (
              paginated.map((row) => (
                <tr key={row.id}>
                  {visibleCols.map((col) => {
                    const raw = row.data[col.key];
                    const val = raw !== null && raw !== undefined ? String(raw) : '—';
                    return (
                      <td key={col.key} className={col.type === 'number' ? 'itable__td--num' : ''}>
                        {col.type === 'url' && val !== '—' ? (
                          <a href={val.startsWith('http') ? val : `https://${val}`} target="_blank" rel="noreferrer">
                            View ↗
                          </a>
                        ) : col.type === 'badge' && val !== '—' ? (
                          <span className={`badge ${badgeColor(val)}`}>{val}</span>
                        ) : (
                          val
                        )}
                      </td>
                    );
                  })}
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
  );
}
