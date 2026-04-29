import type { ColumnConfig, ColumnType } from '../../lib/types';
import './ColumnEditor.css';

interface Props {
  column: ColumnConfig;
  onChange: (updated: ColumnConfig) => void;
  onDragStart?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: () => void;
  isDragging?: boolean;
}

const TYPE_OPTIONS: { value: ColumnType; label: string }[] = [
  { value: 'text',   label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date',   label: 'Date' },
  { value: 'url',    label: 'URL / Link' },
  { value: 'badge',  label: 'Badge' },
];

export default function ColumnEditor({ column, onChange, onDragStart, onDragOver, onDrop, isDragging }: Props) {
  const set = <K extends keyof ColumnConfig>(key: K, val: ColumnConfig[K]) =>
    onChange({ ...column, [key]: val });

  return (
    <div
      className={`col-editor ${column.visible ? '' : 'col-editor--hidden'} ${isDragging ? 'col-editor--dragging' : ''}`}
      draggable
      onDragStart={onDragStart}
      onDragOver={(e) => { e.preventDefault(); onDragOver?.(e); }}
      onDrop={onDrop}
      onDragEnd={() => { /* let parent clear state */ }}
    >
      <div className="col-editor__drag" data-tooltip="Drag to reorder columns">⠿</div>

      <label className="col-editor__toggle toggle" data-tooltip={column.visible ? 'Hide this column from the published table' : 'Show this column in the published table'}>
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
          data-tooltip="The heading shown for this column in the published table"
        />
      </div>

      <select
        className="input col-editor__type"
        value={column.type}
        onChange={(e) => set('type', e.target.value as ColumnType)}
        disabled={!column.visible}
        data-tooltip="How this column's values are displayed: Text, Number, Date, clickable URL, or colour-coded Badge"
      >
        {TYPE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      <label className="col-editor__check" data-tooltip="Add a dropdown filter for this column so users can narrow results by value">
        <input
          type="checkbox"
          checked={column.filterable}
          onChange={(e) => set('filterable', e.target.checked)}
          disabled={!column.visible}
        />
        <span className="text-sm">Filter</span>
      </label>

      <label className="col-editor__check" data-tooltip="Include this column in the search bar so users can find rows by its values">
        <input
          type="checkbox"
          checked={column.searchable}
          onChange={(e) => set('searchable', e.target.checked)}
          disabled={!column.visible}
        />
        <span className="text-sm">Search</span>
      </label>

      <div className="col-editor__colour-wrap" data-tooltip={column.fontColor ? 'Custom text colour applied — click to change, × to remove' : 'Set a custom text colour for all values in this column'}>
        <input
          type="color"
          className={`col-editor__colour-swatch ${column.fontColor ? '' : 'col-editor__colour-swatch--unset'}`}
          value={column.fontColor ?? '#1A1A1A'}
          onChange={(e) => set('fontColor', e.target.value)}
          disabled={!column.visible}
          aria-label="Column text colour"
        />
        {column.fontColor && (
          <button className="col-editor__colour-clear" onClick={() => set('fontColor', undefined)} aria-label="Clear colour">✕</button>
        )}
      </div>

      {column.filterable && column.visible && (
        <div className="col-editor__filter-opts">
          <label className="col-editor__check" data-tooltip="Show the column name as a label above the filter dropdown">
            <input
              type="checkbox"
              checked={column.filterLabel !== false}
              onChange={(e) => set('filterLabel', e.target.checked)}
            />
            <span className="text-sm">Show label</span>
          </label>
          <input
            className="input col-editor__filter-placeholder"
            value={column.filterPlaceholder ?? ''}
            onChange={(e) => set('filterPlaceholder', e.target.value || undefined)}
            placeholder={`All ${column.label}s`}
            data-tooltip="Default text shown in the filter dropdown before a value is selected"
          />
        </div>
      )}
    </div>
  );
}
