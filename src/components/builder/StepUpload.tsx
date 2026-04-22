import { useRef, useState } from 'react';
import { parseFile } from '../../utils/parseFile';
import type { ParsedFile } from '../../lib/types';
import './StepUpload.css';

interface Props {
  onParsed: (data: ParsedFile) => void;
}

export default function StepUpload({ onParsed }: Props) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const [parsing, setParsing] = useState(false);
  const [preview, setPreview] = useState<ParsedFile | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setError('');
    setParsing(true);
    try {
      const parsed = await parseFile(file);
      if (parsed.headers.length === 0) throw new Error('No columns found in file.');
      if (parsed.rows.length === 0) throw new Error('No data rows found in file.');
      setPreview(parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to parse file.');
    } finally {
      setParsing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  return (
    <div className="step-upload">
      <h2 className="step-upload__heading">Upload your spreadsheet</h2>
      <p className="text-soft" style={{ marginBottom: 20 }}>
        Supports CSV, XLSX, and XLS files. Sample data will be sent to AI for analysis — avoid uploading files containing sensitive personal data.
      </p>

      {!preview && (
        <div
          className={`step-upload__zone ${dragging ? 'step-upload__zone--drag' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
        >
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="1.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <p className="font-600" style={{ marginTop: 12 }}>Drop your file here, or click to browse</p>
          <p className="text-sm text-muted" style={{ marginTop: 4 }}>CSV · XLSX · XLS</p>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            style={{ display: 'none' }}
            onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
          />
        </div>
      )}

      {parsing && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 0' }}>
          <div className="spinner" />
          <span className="text-soft">Parsing file…</span>
        </div>
      )}

      {error && <p className="error-msg mt-12">{error}</p>}

      {preview && (
        <div className="step-upload__preview">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <p className="font-600">{preview.rows.length.toLocaleString()} rows · {preview.headers.length} columns</p>
              <p className="text-sm text-muted mt-4">Preview of first 5 rows</p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => { setPreview(null); setError(''); }}>
                Change file
              </button>
              <button className="btn btn-primary" onClick={() => onParsed(preview)}>
                Analyse with AI →
              </button>
            </div>
          </div>
          <div className="step-upload__table-scroll">
            <table className="step-upload__table">
              <thead>
                <tr>
                  {preview.headers.map((h) => <th key={h}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 5).map((row, i) => (
                  <tr key={i}>
                    {preview.headers.map((h) => <td key={h}>{row[h] ?? ''}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
