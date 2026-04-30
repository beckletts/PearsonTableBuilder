import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { generateUniqueSlug } from '../../utils/generateSlug';
import type {
  JoinDetectResult, LinkedColumnConfig, LinkedDashboardConfig,
  ParsedSource,
} from '../../lib/types';
import './StepLinkedCustomise.css';

interface Props {
  sources: ParsedSource[];
  joinResult: JoinDetectResult;
  editingId?: string;
}

function buildInitialColumns(
  sources: ParsedSource[],
  joinResult: JoinDetectResult,
): LinkedColumnConfig[] {
  const joinCols = new Set(
    joinResult.mappings.map((m) => m.column.toLowerCase())
  );
  const seen = new Set<string>();
  const cols: LinkedColumnConfig[] = [];

  // First column is always the join key
  cols.push({
    key: '__join_value',
    label: joinResult.canonical_name,
    visible: true,
    filterable: false,
    searchable: true,
    type: 'text',
  });
  seen.add('__join_value');

  for (const src of sources) {
    for (const h of src.headers) {
      const key = h.trim();
      if (joinCols.has(key.toLowerCase())) continue; // skip join key columns from each source
      if (seen.has(key)) continue;
      seen.add(key);

      // Infer type from suggestion if available
      const suggestion = src.columnSuggestions?.find((c) => c.key === key);
      cols.push({
        key,
        label: suggestion?.label ?? key.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        visible: suggestion ? suggestion.visible : true,
        filterable: suggestion?.filterable ?? false,
        searchable: suggestion?.searchable ?? false,
        type: suggestion?.type ?? 'text',
        sourceId: undefined,
      });
    }
  }
  return cols;
}

const TYPE_OPTIONS = [
  { value: 'text',   label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date',   label: 'Date' },
  { value: 'url',    label: 'URL / Link' },
  { value: 'badge',  label: 'Badge' },
] as const;

export default function StepLinkedCustomise({ sources, joinResult }: Props) {
  const navigate = useNavigate();
  const [title, setTitle]           = useState('');
  const [description, setDescription] = useState('');
  const [columns, setColumns]       = useState<LinkedColumnConfig[]>(() => buildInitialColumns(sources, joinResult));
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');

  const setCol = (i: number, patch: Partial<LinkedColumnConfig>) =>
    setColumns((cs) => cs.map((c, idx) => idx === i ? { ...c, ...patch } : c));

  const save = async (publish: boolean) => {
    setSaving(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError('Session expired — please refresh.'); setSaving(false); return; }
      const user = session.user;

      const finalTitle = title.trim() || 'Untitled Dashboard';
      const slug = await generateUniqueSlug(finalTitle);

      const config: LinkedDashboardConfig = {
        columns,
        sources: sources.map((s, i) => ({
          id: `src_${i}`,
          name: s.name,
          join_key_column: joinResult.mappings[i]?.column ?? s.headers[0],
        })),
        defaultSort: { column: '__join_value', direction: 'asc' },
      };

      const { data: dashboard, error: dashErr } = await supabase
        .from('linked_dashboards')
        .insert({
          owner_id: user.id,
          title: finalTitle,
          description: description.trim() || null,
          slug,
          join_key: joinResult.canonical_name,
          config,
          is_published: publish,
        })
        .select()
        .single();
      if (dashErr) throw dashErr;

      // Insert sources
      const sourceInserts = sources.map((s) => ({
        dashboard_id: dashboard.id,
        name: s.name,
        join_key_column: joinResult.mappings.find((m) => m.source_name === s.name)?.column ?? s.headers[0],
        row_count: s.rows.length,
      }));
      const { data: insertedSources, error: srcErr } = await supabase
        .from('linked_sources')
        .insert(sourceInserts)
        .select();
      if (srcErr) throw srcErr;

      // Insert rows from each source
      const BATCH = 500;
      for (let si = 0; si < sources.length; si++) {
        const src = sources[si];
        const srcRecord = (insertedSources as { id: string }[])[si];
        const joinCol = joinResult.mappings.find((m) => m.source_name === src.name)?.column ?? src.headers[0];

        for (let i = 0; i < src.rows.length; i += BATCH) {
          const batch = src.rows.slice(i, i + BATCH).map((row, j) => ({
            dashboard_id: dashboard.id,
            source_id: srcRecord.id,
            join_value: String(row[joinCol] ?? '').trim(),
            data: row,
            row_index: i + j,
          }));
          const { error: rowErr } = await supabase.from('linked_rows').insert(batch);
          if (rowErr) throw rowErr;
        }
      }

      navigate('/dashboard');
    } catch (e) {
      const msg = e instanceof Error ? e.message : (e as { message?: string })?.message;
      setError(msg || 'Save failed. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const visibleCount = columns.filter((c) => c.visible).length;

  return (
    <div className="step-lc">
      <h2 className="step-lc__heading">Configure your dashboard</h2>

      {/* Title + description */}
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div className="input-group" style={{ marginBottom: 12 }}>
          <label className="input-label">Dashboard title</label>
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. BTEC External Assessment Overview"
          />
        </div>
        <div className="input-group">
          <label className="input-label">Description <span className="text-muted">(optional)</span></label>
          <textarea
            className="input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description shown at the top of the published dashboard"
            rows={2}
          />
        </div>
      </div>

      {/* Join key info */}
      <div className="step-lc__join-info">
        <span className="step-lc__join-icon">🔗</span>
        <span className="text-sm">Linked via <strong>{joinResult.canonical_name}</strong> across {sources.length} spreadsheets</span>
      </div>

      {/* Column list */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <p className="text-sm font-600 text-soft">Columns</p>
        <p className="text-xs text-muted">{visibleCount} visible</p>
      </div>

      <div className="step-lc__cols">
        {columns.map((col, i) => (
          <div key={col.key} className={`step-lc__col ${col.visible ? '' : 'step-lc__col--hidden'}`}>
            <div className="step-lc__col-top">
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={col.visible}
                  onChange={(e) => setCol(i, { visible: e.target.checked })}
                  disabled={col.key === '__join_value'}
                />
                <span className="toggle-track" />
              </label>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span className="step-lc__col-key">{col.key === '__join_value' ? '🔗 join key' : col.key}</span>
                <input
                  className="input step-lc__label-input"
                  value={col.label}
                  onChange={(e) => setCol(i, { label: e.target.value })}
                  disabled={!col.visible}
                />
              </div>
            </div>
            {col.visible && (
              <div className="step-lc__col-controls">
                <select
                  className="input step-lc__type"
                  value={col.type}
                  onChange={(e) => setCol(i, { type: e.target.value as LinkedColumnConfig['type'] })}
                >
                  {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <label className="col-editor__check">
                  <input type="checkbox" checked={col.filterable} onChange={(e) => setCol(i, { filterable: e.target.checked })} />
                  <span className="text-sm">Filter</span>
                </label>
                <label className="col-editor__check">
                  <input type="checkbox" checked={col.searchable} onChange={(e) => setCol(i, { searchable: e.target.checked })} />
                  <span className="text-sm">Search</span>
                </label>
              </div>
            )}
          </div>
        ))}
      </div>

      {error && <p className="error-msg mt-16">{error}</p>}

      <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
        <button className="btn btn-secondary" onClick={() => navigate('/dashboard')} disabled={saving}>← Cancel</button>
        <button className="btn btn-secondary" onClick={() => void save(false)} disabled={saving}>
          {saving ? 'Saving…' : 'Save draft'}
        </button>
        <button className="btn btn-primary" onClick={() => void save(true)} disabled={saving}>
          {saving ? 'Publishing…' : 'Publish →'}
        </button>
      </div>
    </div>
  );
}
