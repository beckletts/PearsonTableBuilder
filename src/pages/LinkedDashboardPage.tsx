import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { LinkedDashboard, LinkedRow, LinkedSource } from '../lib/types';
import LinkedDashboardView from '../components/linked/LinkedDashboardView';
import CookieConsentBanner from '../components/table/CookieConsentBanner';
import PearsonLogo from '../components/layout/PearsonLogo';
import './PublicTablePage.css';

export default function LinkedDashboardPage() {
  const { slug } = useParams<{ slug: string }>();
  const [dashboard, setDashboard]         = useState<LinkedDashboard | null>(null);
  const [rows, setRows]                   = useState<LinkedRow[]>([]);
  const [sources, setSources]             = useState<LinkedSource[]>([]);
  const [loading, setLoading]             = useState(true);
  const [notFound, setNotFound]           = useState(false);
  const [consentGiven, setConsentGiven]   = useState<boolean | null>(null);

  useEffect(() => {
    if (!slug) return;
    const load = async () => {
      setLoading(true);

      const { data: dash } = await supabase
        .from('linked_dashboards')
        .select('*')
        .eq('slug', slug)
        .eq('is_published', true)
        .single();

      if (!dash) { setNotFound(true); setLoading(false); return; }
      setDashboard(dash as LinkedDashboard);

      // Fetch sources ordered by creation time — first = primary (timetable)
      const { data: srcData } = await supabase
        .from('linked_sources')
        .select('*')
        .eq('dashboard_id', dash.id)
        .order('created_at', { ascending: true });
      setSources((srcData ?? []) as LinkedSource[]);

      // Fetch all rows in batches (Supabase default limit is 1000)
      let allRows: LinkedRow[] = [];
      let from = 0;
      const BATCH = 1000;
      while (true) {
        const { data: batch } = await supabase
          .from('linked_rows')
          .select('id, dashboard_id, source_id, join_value, data, row_index')
          .eq('dashboard_id', dash.id)
          .range(from, from + BATCH - 1)
          .order('row_index', { ascending: true });
        if (!batch || batch.length === 0) break;
        allRows = [...allRows, ...(batch as LinkedRow[])];
        if (batch.length < BATCH) break;
        from += BATCH;
      }

      setRows(allRows);
      setLoading(false);
    };
    void load();
  }, [slug]);

  // Read stored consent from localStorage once the slug is known
  useEffect(() => {
    if (!slug) return;
    const stored = localStorage.getItem(`cookie_consent_linked_${slug}`);
    if (stored === 'accepted') setConsentGiven(true);
    else if (stored === 'declined') setConsentGiven(false);
    else setConsentGiven(null);
  }, [slug]);

  // Inject GA script when consent is resolved
  useEffect(() => {
    const gaId = dashboard?.config?.tracking?.gaTrackingId;
    if (!gaId) return;
    const consentRequired = !!dashboard?.config?.tracking?.cookieConsent?.enabled;
    if (consentRequired && consentGiven !== true) return;
    if (document.getElementById('ga-script')) return;
    window.dataLayer = window.dataLayer ?? [];
    window.gtag = function (...args) { window.dataLayer.push(args); };
    window.gtag('js', new Date());
    window.gtag('config', gaId);
    const script = document.createElement('script');
    script.id = 'ga-script';
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${gaId}`;
    document.head.appendChild(script);
  }, [dashboard, consentGiven]);

  const handleAccept = () => {
    if (slug) localStorage.setItem(`cookie_consent_linked_${slug}`, 'accepted');
    setConsentGiven(true);
  };

  const handleDecline = () => {
    if (slug) localStorage.setItem(`cookie_consent_linked_${slug}`, 'declined');
    setConsentGiven(false);
  };

  const Spinner = () => (
    <div className="public-page">
      <div className="public-page__header"><div className="public-page__header-inner"><PearsonLogo /></div></div>
      <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
        <div className="spinner spinner-lg" style={{ borderTopColor: '#5B2D86' }} />
      </div>
    </div>
  );

  if (loading) return <Spinner />;

  if (notFound || !dashboard) return (
    <div className="public-page">
      <div className="public-page__header"><div className="public-page__header-inner"><PearsonLogo /></div></div>
      <div className="public-page__not-found">
        <h1>Dashboard not found</h1>
        <p>This linked dashboard doesn't exist or hasn't been published yet.</p>
      </div>
    </div>
  );

  const tracking = dashboard.config?.tracking;
  const needsBanner = !!tracking?.gaTrackingId && !!tracking?.cookieConsent?.enabled;

  return (
    <>
      <LinkedDashboardView
        dashboard={dashboard}
        rawRows={rows}
        primarySourceId={sources[0]?.id}
      />
      <footer className="public-page__footer" style={{ marginTop: 'auto' }}>
        <PearsonLogo width={70} />
        <p>© {new Date().getFullYear()} Pearson plc. All rights reserved.</p>
      </footer>
      {needsBanner && consentGiven === null && (
        <CookieConsentBanner
          message={tracking!.cookieConsent!.message}
          onAccept={handleAccept}
          onDecline={handleDecline}
        />
      )}
    </>
  );
}
