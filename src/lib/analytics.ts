import { supabase } from './supabase';

function getSessionId(): string {
  const key = 'ptb_session';
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
  }
  return id;
}

export function trackEvent(params: {
  tableId?: string;
  dashboardId?: string;
  eventType: 'page_view' | 'filter' | 'search' | 'button_click';
  eventData?: Record<string, string>;
}): void {
  supabase.from('analytics_events').insert({
    table_id: params.tableId ?? null,
    dashboard_id: params.dashboardId ?? null,
    event_type: params.eventType,
    event_data: params.eventData ?? null,
    session_id: getSessionId(),
  }).then(({ error }) => {
    if (error) console.warn('[Analytics] Failed to record event:', error.message);
  });
}
