import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { DataQualityIssue, ParsedFile, TableConfig } from '../../lib/types';
import './StepAIConfig.css';

interface Props {
  parsed: ParsedFile;
  onAccept: (config: TableConfig, cleanedParsed?: ParsedFile) => void;
  onBack: () => void;
}

function stripHtml(val: string): string {
  try {
    const doc = new DOMParser().parseFromString(val, 'text/html');
    return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim();
  } catch {
    return val.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
}

// Excel stores dates as days since Dec 30 1899; JS epoch is Jan 1 1970 (25569 days later)
function excelSerialToDate(val: string): string {
  const serial = parseFloat(val);
  if (isNaN(serial) || serial < 25000 || serial > 60000) return val;
  const date = new Date((serial - 25569) * 86400000);
  const d = String(date.getUTCDate()).padStart(2, '0');
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const y = date.getUTCFullYear();
  return `${d}/${m}/${y}`;
}

function applyFixToValue(val: string, fix: DataQualityIssue['suggestedFix']): string {
  if (fix === 'strip_html') return stripHtml(val);
  if (fix === 'trim_whitespace') return val.trim();
  if (fix === 'normalise_case') return val ? val.charAt(0).toUpperCase() + val.slice(1).toLowerCase() : val;
  if (fix === 'convert_date_serial') return excelSerialToDate(val);
  return val;
}

const ISSUE_LABELS: Record<DataQualityIssue['type'], string> = {
  html_artifacts: 'HTML in cells',
  text_date:      'Date formatting',
  text_number:    'Number formatting',
  whitespace:     'Whitespace',
  mixed_case:     'Inconsistent case',
};

export default function StepAIConfig({ parsed, onAccept, onBack }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [config, setConfig] = useState<TableConfig | null>(null);
  const [issues, setIssues] = useState<DataQualityIssue[]>([]);
  const [appliedFixes, setAppliedFixes] = useState<Set<string>>(new Set());
  const [dismissedIssues, setDismissedIssues] = useState<Set<string>>(new Set());
  const [cleanedRows, setCleanedRows] = useState<Record<string, string>[]>(parsed.rows);

  const analyse = async () => {
    setLoading(true);
    setError('');
    setConfig(null);
    setIssues([]);
    setAppliedFixes(new Set());
    setDismissedIssues(new Set());
    setCleanedRows(parsed.rows);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setError('Not authenticated.'); setLoading(false); return; }

    try {
      const res = await fetch('/api/analyse-table', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          headers: parsed.headers,
          sampleRows: parsed.rows.slice(0, 50),
        }),
      });

      const json = await res.json() as { config?: TableConfig; dataQualityIssues?: DataQualityIssue[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Analysis failed');
      if (!json.config) throw new Error('No configuration returned');
      setConfig(json.config);
      setIssues(json.dataQualityIssues ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void analyse(); }, []);

  const applyFix = (issue: DataQualityIssue) => {
    setCleanedRows(prev => prev.map(row => {
      const val = String(row[issue.column] ?? '');
      const cleaned = applyFixToValue(val, issue.suggestedFix);
      return cleaned !== val ? { ...row, [issue.column]: cleaned } : row;
    }));
    setAppliedFixes(prev => new Set([...prev, issue.column]));
  };

  const dismissIssue = (column: string) => {
    setDismissedIssues(prev => new Set([...prev, column]));
  };

  const handleAccept = () => {
    if (!config) return;
    const cleanedParsed = appliedFixes.size > 0 ? { ...parsed, rows: cleanedRows } : undefined;
    onAccept(config, cleanedParsed);
  };

  const activeIssues = issues.filter(i => !dismissedIssues.has(i.column) && !appliedFixes.has(i.column));
  const resolvedCount = appliedFixes.size + dismissedIssues.size;

  return (
    <div className="step-ai">
      <h2 className="step-ai__heading">AI is analysing your data</h2>

      {loading && (
        <div className="step-ai__loading">
          <div className="spinner spinner-lg" />
          <p className="font-600 mt-16">Reviewing {parsed.headers.length} columns…</p>
          <p className="text-sm text-muted mt-4">Claude is suggesting the best configuration for your table</p>
        </div>
      )}

      {error && (
        <div>
          <p className="error-msg">{error}</p>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="btn btn-secondary" onClick={onBack}>← Back</button>
            <button className="btn btn-primary" onClick={() => void analyse()}>Try again</button>
          </div>
        </div>
      )}

      {config && !loading && (
        <div className="step-ai__result">
          <div className="step-ai__suggestion card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 700 }}>{config.title}</h3>
                <p className="text-soft mt-4">{config.description}</p>
              </div>
              <span className="badge badge-green">AI suggested</span>
            </div>

            <div style={{ marginBottom: 16 }}>
              <p className="text-sm font-600 text-soft" style={{ marginBottom: 8 }}>Columns ({config.columns.length})</p>
              <div className="step-ai__cols">
                {config.columns.map((col) => (
                  <div key={col.key} className={`step-ai__col ${col.visible ? '' : 'step-ai__col--hidden'}`}>
                    <span className="step-ai__col-label">{col.label}</span>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                      <span className="badge badge-grey">{col.type}</span>
                      {col.filterable && <span className="badge badge-blue">filter</span>}
                      {col.searchable && <span className="badge badge-purple">search</span>}
                      {!col.visible && <span className="badge badge-grey">hidden</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {issues.length > 0 && (
            <div className="dq-section">
              <div className="dq-section__header">
                <span className="dq-section__title">
                  {activeIssues.length === 0
                    ? '✓ All data quality issues resolved'
                    : `⚠ ${activeIssues.length} data quality ${activeIssues.length === 1 ? 'issue' : 'issues'} found`}
                </span>
                {resolvedCount > 0 && activeIssues.length > 0 && (
                  <span className="badge badge-green">{resolvedCount} resolved</span>
                )}
              </div>

              <div className="dq-issues">
                {issues.map((issue) => {
                  const isApplied = appliedFixes.has(issue.column);
                  const isDismissed = dismissedIssues.has(issue.column);
                  if (isDismissed) return null;

                  return (
                    <div key={issue.column} className={`dq-issue ${isApplied ? 'dq-issue--fixed' : ''}`}>
                      <div className="dq-issue__header">
                        <span className="dq-issue__col">{issue.column}</span>
                        <span className={`badge ${issue.suggestedFix === 'flag_only' ? 'badge-red' : 'badge-yellow'}`}>
                          {ISSUE_LABELS[issue.type]}
                        </span>
                      </div>

                      <p className="dq-issue__desc">{issue.description}</p>

                      {issue.examples.length > 0 && (
                        <div className="dq-issue__examples">
                          {issue.examples.map((ex, i) => (
                            <code key={i} className="dq-issue__example">{ex}</code>
                          ))}
                        </div>
                      )}

                      {isApplied ? (
                        <p className="dq-issue__fixed-msg">✓ Fix applied to all rows in this column</p>
                      ) : (
                        <div className="dq-issue__footer">
                          <p className="dq-issue__fix-desc">{issue.fixDescription}</p>
                          <div className="dq-issue__actions">
                            {issue.suggestedFix !== 'flag_only' && (
                              <button className="btn btn-sm btn-secondary" onClick={() => applyFix(issue)}>
                                Apply fix
                              </button>
                            )}
                            <button className="btn btn-sm btn-ghost" onClick={() => dismissIssue(issue.column)}>
                              {issue.suggestedFix === 'flag_only' ? 'Noted' : 'Dismiss'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
            <button className="btn btn-secondary" onClick={onBack}>← Back</button>
            <button className="btn btn-secondary btn-sm" onClick={() => void analyse()}>Re-analyse</button>
            <button className="btn btn-primary" onClick={handleAccept}>
              {activeIssues.length > 0 ? 'Continue anyway →' : 'Looks good, customise →'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
