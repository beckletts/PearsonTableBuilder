import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { ParsedFile, TableConfig, Widget } from '../../lib/types';
import './WidgetBuilder.css';

interface Props {
  config: TableConfig;
  parsed: ParsedFile;
  onChange: (widgets: Widget[]) => void;
}

const WIDGET_META: Record<string, { label: string; desc: string; icon: string }> = {
  intro_banner: { label: 'Intro Banner',  desc: 'Large heading and subtitle above the search panel', icon: '🏷️' },
  callout_box:  { label: 'Callout Box',   desc: 'Important notice shown between search and results',  icon: '📌' },
  stat_cards:   { label: 'Stat Cards',    desc: 'Summary statistics computed from your data',          icon: '📊' },
  card_view:    { label: 'Card View',     desc: 'Toggle between table and visual card grid',           icon: '🃏' },
  footer_note:  { label: 'Footer Note',   desc: 'Custom text and record count in the page footer',     icon: '📋' },
};

const EXAMPLES = [
  'Add a heading and subtitle describing this dataset',
  'Show a count of total records and unique values in the main column',
  'Add an important notice about how to use this data',
  'Display results as visual cards instead of a table',
  'Add a footer note with the total record count',
];

export default function WidgetBuilder({ config, parsed, onChange }: Props) {
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const widgets = config.widgets ?? [];

  const addWidget = (widget: Widget) => onChange([...widgets, widget]);
  const removeWidget = (id: string) => onChange(widgets.filter((w) => w.id !== id));

  const generate = async () => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    setBusy(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Session expired — please refresh and log in again.');

      const res = await fetch('/api/suggest-widget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          prompt: trimmed,
          tableTitle: config.title,
          columns: config.columns,
          sampleRows: parsed.rows.slice(0, 10),
        }),
      });

      const data = await res.json() as { widget?: { type: string; config: unknown }; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? 'Failed to generate element.');

      const w = data.widget!;
      addWidget({ id: crypto.randomUUID(), type: w.type as Widget['type'], config: w.config as Widget['config'] });
      setPrompt('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate element.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="widget-builder">
      <div className="widget-builder__header">
        <p className="text-sm font-600 text-soft">Page elements</p>
        {widgets.length > 0 && <span className="badge badge-purple">{widgets.length}</span>}
      </div>

      <div className="widget-builder__prompt-area">
        <textarea
          className="input widget-builder__textarea"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe an element to add…"
          rows={2}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void generate(); }}
        />
        <div className="widget-builder__examples">
          {EXAMPLES.map((ex) => (
            <button key={ex} className="widget-builder__example" onClick={() => setPrompt(ex)}>
              {ex}
            </button>
          ))}
        </div>
        <button
          className="btn btn-primary btn-sm widget-builder__generate-btn"
          onClick={() => void generate()}
          disabled={busy || !prompt.trim()}
        >
          {busy ? 'Generating…' : '✦ Generate with AI'}
        </button>
        {error && <p className="error-msg mt-8">{error}</p>}
      </div>

      {widgets.length > 0 && (
        <div className="widget-builder__list">
          {widgets.map((w) => {
            const meta = WIDGET_META[w.type];
            return (
              <div key={w.id} className="widget-builder__item">
                <span className="widget-builder__item-icon">{meta?.icon ?? '🧩'}</span>
                <div className="widget-builder__item-info">
                  <span className="widget-builder__item-label">{meta?.label ?? w.type}</span>
                  <span className="text-xs text-muted">{meta?.desc ?? ''}</span>
                </div>
                <button className="btn btn-ghost btn-sm widget-builder__remove" onClick={() => removeWidget(w.id)} title="Remove">✕</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
