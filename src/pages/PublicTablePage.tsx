import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { TableRecord, TableRow } from '../lib/types';
import PublicTableView from '../components/table/PublicTableView';
import PearsonLogo from '../components/layout/PearsonLogo';
import './PublicTablePage.css';

interface TabData {
  table: TableRecord;
  rows: TableRow[];
}

export default function PublicTablePage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [tabs, setTabs] = useState<TabData[]>([]);
  const [activeSlug, setActiveSlug] = useState(slug ?? '');
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    setActiveSlug(slug);
    const load = async () => {
      setLoading(true);

      // Load the requested table
      const { data: t } = await supabase
        .from('tables')
        .select('*')
        .eq('slug', slug)
        .single();

      if (!t) { setNotFound(true); setLoading(false); return; }
      const table = t as TableRecord;

      // Determine the primary table id (group root)
      const primaryId = table.tab_group_id ?? table.id;

      // Load all tables in the group (primary + all secondary tabs)
      const { data: groupTables } = await supabase
        .from('tables')
        .select('*')
        .or(`id.eq.${primaryId},tab_group_id.eq.${primaryId}`)
        .order('tab_order', { ascending: true });

      const allTables = (groupTables as TableRecord[]) ?? [table];

      // Only show published tables to public
      const publishedTables = allTables.filter((t) => t.is_published || t.id === primaryId);
      if (publishedTables.length === 0 || !publishedTables.find((t) => t.id === primaryId)?.is_published) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      // Load rows for all tabs in parallel
      const tabsWithRows = await Promise.all(
        publishedTables.map(async (tabTable) => {
          const { data: rows } = await supabase
            .from('table_rows')
            .select('*')
            .eq('table_id', tabTable.id)
            .order('row_index');
          return { table: tabTable, rows: (rows as TableRow[]) ?? [] };
        }),
      );

      setTabs(tabsWithRows);
      setLoading(false);
    };
    void load();
  }, [slug]);

  const activeTab = tabs.find((t) => t.table.slug === activeSlug) ?? tabs[0];
  const isMultiTab = tabs.length > 1;

  if (loading) return (
    <div className="public-page">
      <div className="public-page__header"><div className="public-page__header-inner"><PearsonLogo /></div></div>
      <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
        <div className="spinner spinner-lg" style={{ borderTopColor: '#5B2D86' }} />
      </div>
    </div>
  );

  if (notFound || !activeTab) return (
    <div className="public-page">
      <div className="public-page__header"><div className="public-page__header-inner"><PearsonLogo /></div></div>
      <div className="public-page__not-found">
        <h1>Table not found</h1>
        <p>This table doesn't exist or hasn't been published yet.</p>
      </div>
    </div>
  );

  return (
    <div className="public-page">
      <header className="public-page__header">
        <div className="public-page__header-inner">
          <PearsonLogo />
        </div>
      </header>

      {isMultiTab && (
        <div className="public-page__tab-bar">
          <div className="public-page__tab-inner">
            {tabs.map(({ table }) => (
              <button
                key={table.slug}
                className={`public-page__tab-btn ${table.slug === activeSlug ? 'public-page__tab-btn--active' : ''}`}
                onClick={() => {
                  setActiveSlug(table.slug);
                  navigate(`/t/${table.slug}`, { replace: true });
                }}
              >
                {table.title}
              </button>
            ))}
          </div>
        </div>
      )}

      <main className="public-page__main">
        <PublicTableView config={activeTab.table.config} rows={activeTab.rows} />
      </main>

      <footer className="public-page__footer">
        <PearsonLogo width={70} />
        <p>© {new Date().getFullYear()} Pearson plc. All rights reserved.</p>
      </footer>
    </div>
  );
}
