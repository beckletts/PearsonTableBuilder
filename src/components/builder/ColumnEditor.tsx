import type { ColumnConfig, ColumnType } from '../../lib/types';
import './ColumnEditor.css';

interface Props {
  column: ColumnConfig;
  onChange: (updated: ColumnConfig) => void;
}

const TYPE_OPTIONS: { value: ColumnType; label: string }[] = [
  { value: 'text',   label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'url',    label: 'URL / Link' },
  { value: 'badge',  label: 'Badge' },
];

export default function ColumnEditor({ column, onChange }: Props) {
  const set = <K extends keyof ColumnConfig>(key: K, val: ColumnConfig[K]) =>
    onChange({ ...column, [key]: val });

  return (
    <div className={`col-editor ${column.visible ? '' : 'col-editor--hidden'}`}>
      <div className="col-editor__drag">⠿</div>

      <label className="col-editor__toggle toggle" title={column.visible ? 'Hide column' : 'Show column'}>
        <input
          type="checkbox"
          checked={column.visible}
          onChange={(e) => set('visible', e.target.checked)}
        />
        <span className="toggle-track" />
      </label>

      <div className="col-editor__name">
        <span className="col-editor__key">{column.key}</span>
        <input
          className="input col-editor__label-input"
          value={column.label}
          onChange={(e) => set('label', e.target.value)}
          placeholder="Display name"
          disabled={!column.visible}
        />
      </div>

      <select
        className="input col-editor__type"
        value={column.type}
        onChange={(e) => set('type', e.target.value as ColumnType)}
        disabled={!column.visible}
      >
        {TYPE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      <label className="col-editor__check" title="Show as filter">
        <input
          type="checkbox"
          checked={column.filterable}
          onChange={(e) => set('filterable', e.target.checked)}
          disabled={!column.visible}
        />
        <span className="text-sm">Filter</span>
      </label>

      <label className="col-editor__check" title="Include in search">
        <input
          type="checkbox"
          checked={column.searchable}
          onChange={(e) => set('searchable', e.target.checked)}
          disabled={!column.visible}
        />
        <span className="text-sm">Search</span>
      </label>
    </div>
  );
}
