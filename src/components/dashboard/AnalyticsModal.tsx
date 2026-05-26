import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import './AnalyticsModal.css';

type Period = 7 | 30 | 90;

interface AnalyticsEvent {
  event_type: string;
  event_data: Record<string, string> | null;
  session_id: string;
}

interface Props {
  tableId?: string;
  dashboardId?: string;
  title: string;
  onClose: () => void;
}

function interactionLabel(e: AnalyticsEvent): string {
  if (e.event_type === 'filter')       return `Filter — ${e.event_data?.column ?? 'unknown'}`;
  if (e.event_type === 'search')       return 'Search used';
  if (e.event_type === 'button_click') return `Button — ${e.event_data?.label ?? 'unknown'}`;
  return e.event_type;
}

export default function AnalyticsModal({ tableId, dashboardId, title, onClose }: Props) {
  const [period, setPeriod]           = useState<Period>(30);
  const [events, setEvents]           = useState<AnalyticsEvent[]>([]);
  const [loading, setLoading]         = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    setLoading(true);
    const cutoff = new Date(Date.now() - period * 24 * 60 * 60 * 1000).toISOString();

    let query = supabase
      .from('analytics_events')
      .select('event_type, event_data, session_id')
      .gte('created_at', cutoff);

    if (tableId)     query = query.eq('table_id', tableId);
    if (dashboardId) query = query.eq('dashboard_id', dashboardId);

    query.then(({ data, error }) => {
      if (error) { setUnavailable(true); setLoading(false); return; }
      setEvents((data as AnalyticsEvent[]) ?? []);
      setLoading(false);
    });
  }, [tableId, dashboardId, period]);

  const pageViews     = events.filter((e) => e.event_type === 'page_view');
  const totalViews    = pageViews.length;
  const uniqueVisits  = new Set(pageViews.map((e) => e.session_id)).size;

  const interactionCounts = new Map<string, number>();
  for (const e of events.filter((e) => e.event_type !== 'page_view')) {
    const label = interactionLabel(e);
    interactionCounts.set(label, (interactionCounts.get(label) ?? 0) + 1);
  }
  const topInteractions = [...interactionCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  const maxCount = topInteractions[0]?.[1] ?? 1;

  const periodLabel = period === 7 ? 'Last 7 days' : period === 30 ? 'Last 30 days' : 'Last 90 days';

  return (
    <div className="analytics-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="analytics-modal">
        <div className="analytics-modal__header">
          <div>
            <h2 className="analytics-modal__title">Analytics</h2>
            <p className="analytics-modal__sub">{title}</p>
          </div>
          <button className="analytics-modal__close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="analytics-modal__body">
          {unavailable ? (
            <p className="text-sm text-muted">
              Analytics is not set up yet. Run <strong>migration-v6.sql</strong> in your Supabase SQL editor to enable it.
            </p>
          ) : (
            <>
              <div className="analytics-period">
                {([7, 30, 90] as Period[]).map((p) => (
                  <button
                    key={p}
                    className={`analytics-period__btn ${period === p ? 'analytics-period__btn--active' : ''}`}
                    onClick={() => setPeriod(p)}
                  >
                    {p === 7 ? '7 days' : p === 30 ? '30 days' : '90 days'}
                  </button>
                ))}
              </div>

              {loading ? (
                <p className="text-sm text-muted" style={{ marginTop: 24 }}>Loading…</p>
              ) : (
                <>
                  <div className="analytics-stats">
                    <div className="analytics-stat">
                      <span className="analytics-stat__value">{totalViews.toLocaleString()}</span>
                      <span className="analytics-stat__label">Page views</span>
                      <span className="analytics-stat__hint">{periodLabel}</span>
                    </div>
                    <div className="analytics-stat">
                      <span className="analytics-stat__value">{uniqueVisits.toLocaleString()}</span>
                      <span className="analytics-stat__label">Unique visits</span>
                      <span className="analytics-stat__hint">Distinct browser sessions</span>
                    </div>
                  </div>

                  <div className="analytics-interactions">
                    <h3 className="analytics-interactions__title">Interactions</h3>
                    {topInteractions.length === 0 ? (
                      <p className="text-sm text-muted">
                        {totalViews === 0
                          ? 'No visits recorded in this period yet.'
                          : 'No interactions recorded in this period.'}
                      </p>
                    ) : (
                      <div className="analytics-interactions__list">
                        {topInteractions.map(([label, count]) => (
                          <div key={label} className="analytics-row">
                            <span className="analytics-row__label">{label}</span>
                            <div className="analytics-row__bar-wrap">
                              <div
                                className="analytics-row__bar"
                                style={{ width: `${Math.round((count / maxCount) * 100)}%` }}
                              />
                            </div>
                            <span className="analytics-row__count">{count.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
