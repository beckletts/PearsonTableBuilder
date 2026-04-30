import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';
import type { LinkedDashboard, LinkedColumnConfig } from '../lib/types';
import PearsonNav from '../components/layout/PearsonNav';
import './LinkedEditPage.css';

interface Props { user: User }

const TYPE_OPTIONS = [
  { value: 'text',   label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date',   label: 'Date' },
  { value: 'url',    label: 'URL / Link' },
  { value: 'badge',  label: 'Badge' },
] as const;

export default function LinkedEditPage({ user }: Props) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [dashboard, setDashboard] = useState<LinkedDashboard | null>(null);
  const [loading, setLoading]     = useState(true);
  const [notFound, setNotFound]   = useState(false);

  const [title, setTitle]           = useState('');
  const [description, setDescription] = useState('');
  const [columns, setColumns]       = useState<LinkedColumnConfig[]>([]);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      const { data } = await supabase
        .from('linked_dashboards')
        .select('*')
        .eq('id', id)
        .eq('owner_id', user.id)
        .single();

      if (!data) { setNotFound(true); setLoading(false); return; }
      const dash = data as LinkedDashboard;
      setDashboard(dash);
      setTitle(dash.title);
      setDescription(dash.description ?? '');
      setColumns(dash.config.columns);
      setLoading(false);
    };
    void load();
  }, [id, user.id]);

  const setCol = (i: number, patch: Partial<LinkedColumnConfig>) =>
    setColumns((cs) => cs.map((c, idx) => idx === i ? { ...c, ...patch } : c));

  const save = async (publish?: boolean) => {
    if (!dashboard) return;
    setSaving(true);
    setError('');
    try {
      const updatedConfig = { ...dashboard.config, columns };
      const patch: Record<string, unknown> = {
        title: title.trim() || dashboard.title,
        description: description.trim() || null,
        config: updatedConfig,
        updated_at: new Date().toISOString(),
      };
      if (publish !== undefined) patch.is_published = publish;

      const { error: updateErr } = await supabase
        .from('linked_dashboards')
        .update(patch)
        .eq('id', dashboard.id);

      if (updateErr) throw updateErr;
      navigate('/dashboard');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="le-page">
      <PearsonNav user={user} />
      <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
        <div className="spinner spinner-lg" />
      </div>
    </div>
  );

  if (notFound || !dashboard) return (
    <div className="le-page">
      <PearsonNav user={user} />
      <div className="le-main"><p className="error-msg">Dashboard not found or you don't have permission to edit it.</p></div>
    </div>
  );

  const visibleCount = columns.filter((c) => c.visible).length;

  return (
    <div className="le-page">
      <PearsonNav user={user} />
      <main className="le-main">
        <div className="le-content">
          <div className="le-breadcrumb">
            <button className="le-breadcrumb__back" onClick={() => navigate('/dashboard')}>← Dashboard</button>
            <span className="le-breadcrumb__sep">/</span>
            <span className="le-breadcrumb__title">{dashboard.title}</span>
          </div>

          <h1 className="le-heading">Edit linked dashboard</h1>

          {/* Info bar */}
          <div className="le-info-bar">
            <span>🔗</span>
            <span className="text-sm">Linked via <strong>{dashboard.join_key}</strong> across {dashboard.config.sources.length} sheet{dashboard.config.sources.length !== 1 ? 's' : ''}</span>
            {dashboard.is_published && (
              <a
                href={`/ld/${dashboard.slug}`}
                target="_blank"
                rel="noreferrer"
                className="le-info-bar__link"
              >
                View live ↗
              </a>
            )}
          </div>

          {/* Title + description */}
          <div className="card le-card">
            <div className="input-group" style={{ marginBottom: 12 }}>
              <label className="input-label">Dashboard title</label>
              <input
                className="input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Dashboard title"
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

          {/* Column list */}
          <div className="le-cols-header">
            <p className="text-sm font-600 text-soft">Columns</p>
            <p className="text-xs text-muted">{visibleCount} of {columns.length} visible</p>
          </div>

          <div className="le-cols">
            {columns.map((col, i) => (
              <div key={col.key} className={`le-col card ${col.visible ? '' : 'le-col--hidden'}`}>
                <div className="le-col__top">
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
                    <span className="le-col__key">{col.key === '__join_value' ? '🔗 join key' : col.key}</span>
                    <input
                      className="input le-col__label-input"
                      value={col.label}
                      onChange={(e) => setCol(i, { label: e.target.value })}
                      disabled={!col.visible}
                      placeholder="Column label"
                    />
                  </div>
                </div>
                {col.visible && (
                  <div className="le-col__controls">
                    <select
                      className="input le-col__type"
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

          <div className="le-actions">
            <button className="btn btn-secondary" onClick={() => navigate('/dashboard')} disabled={saving}>Cancel</button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className={`btn btn-sm ${dashboard.is_published ? 'btn-secondary' : 'btn-ghost'}`}
                onClick={() => void save(!dashboard.is_published)}
                disabled={saving}
              >
                {dashboard.is_published ? 'Save & unpublish' : 'Save as draft'}
              </button>
              <button className="btn btn-primary" onClick={() => void save(dashboard.is_published ? undefined : true)} disabled={saving}>
                {saving ? 'Saving…' : dashboard.is_published ? 'Save changes' : 'Save & publish →'}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
