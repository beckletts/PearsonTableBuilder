import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { ParsedFile, TableConfig } from '../../lib/types';
import './StepAIConfig.css';

interface Props {
  parsed: ParsedFile;
  onAccept: (config: TableConfig) => void;
  onBack: () => void;
}

export default function StepAIConfig({ parsed, onAccept, onBack }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [config, setConfig] = useState<TableConfig | null>(null);

  const analyse = async () => {
    setLoading(true);
    setError('');
    setConfig(null);

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

      const json = await res.json() as { config?: TableConfig; error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Analysis failed');
      if (!json.config) throw new Error('No configuration returned');
      setConfig(json.config);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void analyse(); }, []);

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

          <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
            <button className="btn btn-secondary" onClick={onBack}>← Back</button>
            <button className="btn btn-secondary btn-sm" onClick={() => void analyse()}>Re-analyse</button>
            <button className="btn btn-primary" onClick={() => onAccept(config)}>
              Looks good, customise →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
