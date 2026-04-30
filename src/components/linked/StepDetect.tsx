import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { JoinDetectResult, ParsedSource } from '../../lib/types';
import './StepDetect.css';

interface Props {
  sources: ParsedSource[];
  result: JoinDetectResult | null;
  onResult: (r: JoinDetectResult) => void;
  onConfirm: (result: JoinDetectResult) => void;
  onBack: () => void;
}

export default function StepDetect({ sources, result, onResult, onConfirm, onBack }: Props) {
  const [loading, setLoading] = useState(!result);
  const [error, setError]     = useState('');
  const [local, setLocal]     = useState<JoinDetectResult | null>(result);

  useEffect(() => {
    if (result) { setLocal(result); return; }
    void detect();
  }, []);

  const detect = async () => {
    setLoading(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Session expired — please refresh.');

      const payload = {
        sources: sources.map((s) => ({
          name: s.name,
          headers: s.headers,
          sample_rows: s.rows.slice(0, 20),
        })),
      };

      const res = await fetch('/api/detect-join-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? 'Detection failed');
      }

      const json = await res.json() as JoinDetectResult;
      setLocal(json);
      onResult(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Detection failed.');
    } finally {
      setLoading(false);
    }
  };

  const overrideColumn = (sourceName: string, column: string) => {
    if (!local) return;
    setLocal({
      ...local,
      mappings: local.mappings.map((m) =>
        m.source_name === sourceName ? { ...m, column, confidence: 1 } : m
      ),
    });
  };

  const confidenceLabel = (c: number) => {
    if (c >= 0.9) return { label: 'Very high', color: 'var(--color-success)' };
    if (c >= 0.7) return { label: 'High',      color: 'var(--color-success)' };
    if (c >= 0.5) return { label: 'Medium',    color: 'var(--color-warning)' };
    return              { label: 'Low',         color: 'var(--color-danger)' };
  };

  return (
    <div className="step-detect">
      <h2 className="step-detect__heading">Detecting join key</h2>
      <p className="text-soft text-sm" style={{ marginBottom: 24 }}>
        Claude analyses the actual values in your spreadsheets — not just the column names — to find the common linking field.
      </p>

      {loading && (
        <div className="step-detect__loading">
          <div className="spinner spinner-lg" />
          <p className="text-sm text-muted mt-16">Analysing {sources.length} spreadsheets…</p>
          <p className="text-xs text-muted mt-4">Claude is comparing cell value patterns across your sheets</p>
        </div>
      )}

      {error && (
        <div className="step-detect__error">
          <p className="error-msg">{error}</p>
          <button className="btn btn-secondary btn-sm mt-12" onClick={() => void detect()}>Try again</button>
        </div>
      )}

      {!loading && local && (
        <>
          {/* Result card */}
          <div className="step-detect__result card">
            <div className="step-detect__result-header">
              <div className="step-detect__result-icon">🔗</div>
              <div>
                <p className="text-sm font-600 text-muted" style={{ marginBottom: 2 }}>Join key identified</p>
                <h3 className="step-detect__key-name">{local.canonical_name}</h3>
                <p className="text-xs text-muted mt-4">Pattern: {local.pattern}</p>
              </div>
              <div className="step-detect__confidence" style={{ color: confidenceLabel(local.confidence).color }}>
                <span className="step-detect__confidence-pct">{Math.round(local.confidence * 100)}%</span>
                <span className="text-xs">{confidenceLabel(local.confidence).label}</span>
              </div>
            </div>

            <p className="step-detect__reasoning text-sm text-soft">{local.reasoning}</p>
          </div>

          {/* Per-source mappings */}
          <div className="step-detect__mappings">
            {local.mappings.map((m) => {
              const src = sources.find((s) => s.name === m.source_name);
              const cf = confidenceLabel(m.confidence);
              return (
                <div key={m.source_name} className="step-detect__mapping card">
                  <div className="step-detect__mapping-top">
                    <span className="step-detect__mapping-sheet">📄 {m.source_name}</span>
                    <span className="step-detect__mapping-badge" style={{ color: cf.color, borderColor: cf.color }}>
                      {cf.label}
                    </span>
                  </div>
                  <div className="step-detect__mapping-col">
                    <label className="text-xs text-muted" style={{ marginBottom: 4, display: 'block' }}>
                      Column identified as join key:
                    </label>
                    <select
                      className="input"
                      value={m.column}
                      onChange={(e) => overrideColumn(m.source_name, e.target.value)}
                    >
                      {src?.headers.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                  {/* Sample values */}
                  {src && (
                    <div className="step-detect__sample-vals">
                      <span className="text-xs text-muted">Sample values: </span>
                      {[...new Set(src.rows.slice(0, 10).map((r) => r[m.column]).filter(Boolean))].slice(0, 5).map((v) => (
                        <span key={v} className="step-detect__val-chip">{v}</span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 24, justifyContent: 'space-between' }}>
            <button className="btn btn-secondary" onClick={onBack}>← Back</button>
            <button className="btn btn-primary" onClick={() => onConfirm(local)}>
              Confirm & configure columns →
            </button>
          </div>
        </>
      )}
    </div>
  );
}
