import type { ColumnConfig } from '../../lib/types';

interface Props {
  columns: ColumnConfig[];
  options: Record<string, string[]>;
  values: Record<string, string>;
  onChange: (key: string, val: string) => void;
}

export default function TableFilters({ columns, options, values, onChange }: Props) {
  return (
    <>
      {columns.map((col) => (
        <div key={col.key} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <label className="input-label" style={{ marginBottom: 0 }}>{col.label}</label>
          <select
            className="input"
            style={{ width: 'auto', minWidth: 140 }}
            value={values[col.key] ?? ''}
            onChange={(e) => onChange(col.key, e.target.value)}
          >
            <option value="">All</option>
            {(options[col.key] ?? []).map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
      ))}
    </>
  );
}
