import { useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { parseFile } from '../../utils/parseFile';
import type { ParsedFile, TableConfig } from '../../lib/types';
import './StepUpload.css';

const PDF_MAX_BYTES = 4 * 1024 * 1024; // 4 MB — keeps base64 payload under Netlify's 6 MB limit

interface Props {
  onParsed: (data: ParsedFile, config?: TableConfig) => void;
}

export default function StepUpload({ onParsed }: Props) {
  const [dragging, setDragging]     = useState(false);
  const [error, setError]           = useState('');
  const [warning, setWarning]       = useState('');
  const [parsing, setParsing]       = useState(false);
  const [pdfFile, setPdfFile]       = useState<File | null>(null);
  const [analysing, setAnalysing]   = useState(false);
  const [preview, setPreview]       = useState<ParsedFile | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setError('');
    setWarning('');
    setPreview(null);
    setPdfFile(null);

    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      if (file.size > PDF_MAX_BYTES) {
        setError('PDF must be under 4 MB. Try splitting it into smaller sections.');
        return;
      }
      setPdfFile(file);
      return;
    }

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
    if (file) void handleFile(file);
  };

  const analysePdf = async () => {
    if (!pdfFile) return;
    setAnalysing(true);
    setError('');
    setWarning('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Session expired — please refresh and log in again.');

      const arrayBuffer = await pdfFile.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      const chunk = 8192;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      const base64 = btoa(binary);

      const res = await fetch('/api/parse-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ pdfBase64: base64 }),
      });

      let data: { config?: TableConfig; rows?: Record<string, string>[]; error?: string; truncated?: boolean; totalRowsEstimate?: number };
      try {
        data = await res.json() as typeof data;
      } catch {
        throw new Error('The PDF took too long to process. Try uploading a smaller PDF (single section or up to ~10 pages).');
      }

      if (!res.ok || data.error) throw new Error(data.error ?? 'Failed to extract data from PDF.');
      if (!data.config || !data.rows?.length) throw new Error('No table data found in this PDF. Make sure it contains a data table, not just charts or images.');

      const parsed: ParsedFile = {
        headers: data.config.columns.map((c) => c.key),
        rows: data.rows,
      };

      if (data.truncated) {
        const total = data.totalRowsEstimate ? ` — document has ~${data.totalRowsEstimate.toLocaleString()} rows total` : '';
        setWarning(`Only the first ${data.rows.length} rows were extracted${total}. You can still continue — all extracted rows will be imported.`);
      }

      onParsed(parsed, data.config);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to analyse PDF.');
    } finally {
      setAnalysing(false);
    }
  };

  const dropZone = (
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
      <p className="text-sm text-muted" style={{ marginTop: 4 }}>CSV · XLSX · XLS · PDF</p>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx,.xls,.pdf"
        style={{ display: 'none' }}
        onChange={(e) => { if (e.target.files?.[0]) void handleFile(e.target.files[0]); }}
      />
    </div>
  );

  return (
    <div className="step-upload">
      <h2 className="step-upload__heading">Upload your data</h2>
      <p className="text-soft" style={{ marginBottom: 20 }}>
        Supports CSV, XLSX, XLS, and PDF files. Sample data is sent to AI for analysis — avoid uploading files containing sensitive personal data.
      </p>

      {/* ── PDF selected ── */}
      {pdfFile && !analysing && (
        <div className="step-upload__pdf-ready">
          <div className="step-upload__pdf-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#E8610A" strokeWidth="1.5">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="9" y1="15" x2="15" y2="15"/>
              <line x1="9" y1="11" x2="15" y2="11"/>
            </svg>
          </div>
          <div className="step-upload__pdf-info">
            <p className="font-600">{pdfFile.name}</p>
            <p className="text-sm text-muted">{(pdfFile.size / 1024).toFixed(0)} KB · Claude will extract the table data</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => { setPdfFile(null); setError(''); }}>Change</button>
            <button className="btn btn-primary" onClick={() => void analysePdf()}>Analyse PDF with AI →</button>
          </div>
        </div>
      )}

      {/* ── PDF analysing ── */}
      {analysing && (
        <div className="step-upload__pdf-loading">
          <div className="spinner spinner-lg" />
          <div>
            <p className="font-600">Reading PDF with AI…</p>
            <p className="text-sm text-muted mt-4">
              Claude is scanning for tables — this can take 20–30 seconds for large documents
            </p>
          </div>
        </div>
      )}

      {/* ── Spreadsheet drop zone ── */}
      {!pdfFile && !preview && !analysing && dropZone}

      {/* ── Spreadsheet parsing ── */}
      {parsing && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 0' }}>
          <div className="spinner" />
          <span className="text-soft">Parsing file…</span>
        </div>
      )}

      {warning && <p className="warning-msg mt-12">{warning}</p>}
      {error && <p className="error-msg mt-12">{error}</p>}

      {/* ── Spreadsheet preview ── */}
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
                <tr>{preview.headers.map((h) => <th key={h}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 5).map((row, i) => (
                  <tr key={i}>{preview.headers.map((h) => <td key={h}>{row[h] ?? ''}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
