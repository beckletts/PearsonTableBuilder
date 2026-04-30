import { useRef, useState } from 'react';
import { parseFile, getSheetNames } from '../../utils/parseFile';
import type { ParsedSource } from '../../lib/types';
import './StepSources.css';

interface Props {
  sources: ParsedSource[];
  onChange: (sources: ParsedSource[]) => void;
  onNext: () => void;
}

interface PendingSheets {
  file: File;
  fileName: string;
  sheetNames: string[];
  selected: Set<string>;
}

export default function StepSources({ sources, onChange, onNext }: Props) {
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState('');
  const [pendingSheets, setPendingSheets] = useState<PendingSheets | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFile = async (file: File) => {
    setError('');
    setParsing(true);
    try {
      const sheetNames = await getSheetNames(file);
      if (sheetNames.length > 1) {
        // Multi-sheet Excel — show tab picker before parsing
        setPendingSheets({ file, fileName: file.name, sheetNames, selected: new Set(sheetNames) });
        return;
      }
      // Single sheet or CSV — parse immediately
      const parsed = await parseFile(file);
      if (parsed.headers.length === 0) throw new Error('No columns found.');
      if (parsed.rows.length === 0)    throw new Error('No data rows found.');
      const defaultName = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
      onChange([...sources, { name: defaultName, fileName: file.name, headers: parsed.headers, rows: parsed.rows }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to parse file.');
    } finally {
      setParsing(false);
    }
  };

  const toggleSheet = (name: string) => {
    if (!pendingSheets) return;
    const next = new Set(pendingSheets.selected);
    next.has(name) ? next.delete(name) : next.add(name);
    setPendingSheets({ ...pendingSheets, selected: next });
  };

  const confirmSheets = async () => {
    if (!pendingSheets) return;
    setParsing(true);
    setError('');
    try {
      const newSources: ParsedSource[] = [];
      for (const sheetName of pendingSheets.sheetNames) {
        if (!pendingSheets.selected.has(sheetName)) continue;
        const parsed = await parseFile(pendingSheets.file, sheetName);
        if (parsed.headers.length === 0 || parsed.rows.length === 0) continue;
        newSources.push({
          name: sheetName,
          fileName: `${pendingSheets.fileName} — ${sheetName}`,
          headers: parsed.headers,
          rows: parsed.rows,
        });
      }
      if (newSources.length === 0) throw new Error('No data found in the selected tabs.');
      onChange([...sources, ...newSources]);
      setPendingSheets(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to parse sheets.');
    } finally {
      setParsing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    void Promise.all(files.map(addFile));
  };

  const removeSource = (i: number) => onChange(sources.filter((_, idx) => idx !== i));

  const rename = (i: number, name: string) => {
    const next = [...sources];
    next[i] = { ...next[i], name };
    onChange(next);
  };

  return (
    <div className="step-sources">
      <h2 className="step-sources__heading">Upload your spreadsheets</h2>
      <p className="text-soft text-sm" style={{ marginBottom: 24 }}>
        Upload two or more spreadsheets that share a common column. Claude will detect the link automatically.
      </p>

      {/* Upload zone */}
      <div
        className="step-sources__drop"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => { if (e.target.files) void Promise.all(Array.from(e.target.files).map(addFile)); }}
        />
        {parsing ? (
          <div className="spinner" />
        ) : (
          <>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            <p className="text-sm font-600" style={{ marginTop: 8 }}>Drop spreadsheets here or click to browse</p>
            <p className="text-xs text-muted mt-4">CSV, Excel (.xlsx, .xls)</p>
          </>
        )}
      </div>

      {error && <p className="error-msg mt-12">{error}</p>}

      {/* Sheet picker — shown when a multi-tab Excel is detected */}
      {pendingSheets && (
        <div className="step-sources__sheet-picker card">
          <div className="step-sources__sheet-picker-header">
            <span className="step-sources__sheet-picker-icon">📊</span>
            <div>
              <p className="font-600" style={{ fontSize: 14 }}>{pendingSheets.fileName}</p>
              <p className="text-xs text-muted mt-2">This workbook has {pendingSheets.sheetNames.length} tabs. Select the ones you want to include.</p>
            </div>
          </div>
          <div className="step-sources__sheet-list">
            {pendingSheets.sheetNames.map((name) => (
              <label key={name} className="step-sources__sheet-item">
                <input
                  type="checkbox"
                  checked={pendingSheets.selected.has(name)}
                  onChange={() => toggleSheet(name)}
                />
                <span className="step-sources__sheet-name">{name}</span>
              </label>
            ))}
          </div>
          <div className="step-sources__sheet-actions">
            <button className="btn btn-ghost btn-sm" onClick={() => setPendingSheets(null)}>Cancel</button>
            <button
              className="btn btn-primary btn-sm"
              disabled={pendingSheets.selected.size === 0 || parsing}
              onClick={() => void confirmSheets()}
            >
              {parsing ? 'Importing…' : `Add ${pendingSheets.selected.size} tab${pendingSheets.selected.size !== 1 ? 's' : ''} →`}
            </button>
          </div>
        </div>
      )}

      {/* Source list */}
      {sources.length > 0 && (
        <div className="step-sources__list">
          {sources.map((src, i) => (
            <div key={i} className="step-sources__item card">
              <div className="step-sources__item-top">
                <div className="step-sources__item-icon">📄</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <input
                    className="input step-sources__name-input"
                    value={src.name}
                    onChange={(e) => rename(i, e.target.value)}
                    placeholder="Sheet name (e.g. Timetable)"
                  />
                  <p className="text-xs text-muted mt-4">{src.fileName} · {src.rows.length.toLocaleString()} rows · {src.headers.length} columns</p>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => removeSource(i)} style={{ color: 'var(--color-danger)', flexShrink: 0 }}>
                  Remove
                </button>
              </div>

              {/* Column preview pills */}
              <div className="step-sources__cols">
                {src.headers.slice(0, 8).map((h) => (
                  <span key={h} className="step-sources__col-pill">{h}</span>
                ))}
                {src.headers.length > 8 && (
                  <span className="step-sources__col-pill step-sources__col-pill--more">+{src.headers.length - 8} more</span>
                )}
              </div>

              {/* Row preview */}
              <div className="step-sources__preview">
                <div className="step-sources__preview-scroll">
                  <table className="step-sources__preview-table">
                    <thead>
                      <tr>{src.headers.slice(0, 6).map((h) => <th key={h}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {src.rows.slice(0, 3).map((row, ri) => (
                        <tr key={ri}>
                          {src.headers.slice(0, 6).map((h) => (
                            <td key={h}>{String(row[h] ?? '').slice(0, 40)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
        <button
          className="btn btn-primary"
          disabled={sources.length < 2}
          onClick={onNext}
          data-tooltip={sources.length < 2 ? 'Upload at least 2 spreadsheets to continue' : undefined}
        >
          Detect join key →
        </button>
      </div>
    </div>
  );
}
