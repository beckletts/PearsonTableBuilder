/** Publish history for a course builder. */
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import '../dashboard/AuditModal.css';

interface AuditEntry {
  id: string;
  user_email: string;
  action: string;
  created_at: string;
}

interface Props {
  planId: string;
  planTitle: string;
  onClose: () => void;
}

const LABELS: Record<string, { text: string; icon: string }> = {
  published: { text: 'Published', icon: '🌐' },
  unpublished: { text: 'Unpublished', icon: '🔒' },
  created: { text: 'Created', icon: '✨' },
  duplicated: { text: 'Duplicated from another builder', icon: '📋' },
};

export default function CoursePlanAuditModal({ planId, planTitle, onClose }: Props) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    supabase
      .from('course_plan_audit_log')
      .select('id, user_email, action, created_at')
      .eq('plan_id', planId)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) setUnavailable(true);
        else setEntries((data as AuditEntry[]) ?? []);
        setLoading(false);
      });
  }, [planId]);

  return (
    <div className="audit-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="audit-modal">
        <div className="audit-modal__header">
          <div>
            <h2 className="audit-modal__title">History</h2>
            <p className="audit-modal__sub">{planTitle}</p>
          </div>
          <button className="audit-modal__close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="audit-modal__body">
          {loading && <p className="text-soft text-sm">Loading…</p>}
          {!loading && unavailable && (
            <p className="text-soft text-sm">
              History is not available yet — migration-v13.sql needs to be applied.
            </p>
          )}
          {!loading && !unavailable && entries.length === 0 && (
            <p className="text-soft text-sm">
              Nothing recorded yet. Publishing or unpublishing this builder will show up here.
            </p>
          )}
          {entries.map((entry) => {
            const label = LABELS[entry.action] ?? { text: entry.action, icon: '•' };
            return (
              <div key={entry.id} className="audit-modal__entry">
                <span className="audit-modal__entry-icon" aria-hidden="true">{label.icon}</span>
                <div>
                  <p className="audit-modal__entry-action">{label.text}</p>
                  <p className="text-xs text-muted">
                    {entry.user_email} ·{' '}
                    {new Date(entry.created_at).toLocaleString('en-GB', {
                      day: 'numeric', month: 'short', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
