import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';
import type { TableRecord, LinkedDashboard } from '../lib/types';
import type { CoursePlan, CoursePlanAccess } from '../lib/courseBuilder';
import PearsonNav from '../components/layout/PearsonNav';
import TableCard from '../components/dashboard/TableCard';
import TabGroupCard from '../components/dashboard/TabGroupCard';
import LinkedDashboardCard from '../components/dashboard/LinkedDashboardCard';
import CoursePlanCard from '../components/course/CoursePlanCard';
import './CoursePage.css';
import './DashboardPage.css';

interface Props { user: User }

export default function DashboardPage({ user }: Props) {
  const [tables, setTables] = useState<TableRecord[]>([]);
  const [sharedTables, setSharedTables] = useState<TableRecord[]>([]);
  const [linkedDashboards, setLinkedDashboards] = useState<LinkedDashboard[]>([]);
  const [sharedLinkedDashboards, setSharedLinkedDashboards] = useState<LinkedDashboard[]>([]);
  const [coursePlans, setCoursePlans] = useState<CoursePlan[]>([]);
  const [sharedCoursePlans, setSharedCoursePlans] = useState<CoursePlan[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const userEmail = user.email ?? '';

    const [
      { data: ownData }, { data: shareData }, { data: linkedData }, { data: ldShareData },
      { data: planData }, { data: planShareData },
    ] = await Promise.all([
      supabase.from('tables').select('*').eq('owner_id', user.id).order('updated_at', { ascending: false }),
      supabase.from('table_shares').select('table_id').eq('collaborator_email', userEmail),
      supabase.from('linked_dashboards').select('*').eq('owner_id', user.id).order('updated_at', { ascending: false }),
      supabase.from('linked_dashboard_shares').select('dashboard_id, access_level').eq('collaborator_email', userEmail),
      // Course plans need migration-v11 and -v12; until those are applied these
      // come back empty rather than breaking the rest of the dashboard.
      supabase.from('course_plans').select('*').eq('owner_id', user.id).order('updated_at', { ascending: false }),
      supabase.from('course_plan_shares').select('plan_id, access_level').eq('collaborator_email', userEmail),
    ]);

    setLinkedDashboards((linkedData as LinkedDashboard[]) ?? []);
    setTables((ownData as TableRecord[]) ?? []);
    setCoursePlans((planData as CoursePlan[]) ?? []);

    if (planShareData && planShareData.length > 0) {
      const levels = Object.fromEntries(
        (planShareData as { plan_id: string; access_level: CoursePlanAccess }[])
          .map((s) => [s.plan_id, s.access_level]),
      );
      const { data: sharedPlanData } = await supabase
        .from('course_plans')
        .select('*')
        .in('id', Object.keys(levels))
        .order('updated_at', { ascending: false });
      setSharedCoursePlans(
        ((sharedPlanData as CoursePlan[]) ?? []).map((p) => ({ ...p, _accessLevel: levels[p.id] ?? 'view' })),
      );
    } else {
      setSharedCoursePlans([]);
    }

    if (shareData && shareData.length > 0) {
      const ids = shareData.map((s: { table_id: string }) => s.table_id);
      const { data: sharedData } = await supabase
        .from('tables')
        .select('*')
        .in('id', ids)
        .order('updated_at', { ascending: false });
      setSharedTables((sharedData as TableRecord[]) ?? []);
    } else {
      setSharedTables([]);
    }

    if (ldShareData && ldShareData.length > 0) {
      const shareMap = Object.fromEntries(
        ldShareData.map((s: { dashboard_id: string; access_level: string }) => [s.dashboard_id, s.access_level as 'view' | 'edit'])
      );
      const ids = Object.keys(shareMap);
      const { data: sharedLdData } = await supabase
        .from('linked_dashboards')
        .select('*')
        .in('id', ids)
        .order('updated_at', { ascending: false });
      setSharedLinkedDashboards(
        ((sharedLdData as LinkedDashboard[]) ?? []).map((d) => ({ ...d, _accessLevel: shareMap[d.id] ?? 'view' }))
      );
    } else {
      setSharedLinkedDashboards([]);
    }

    setLoading(false);
  };

  useEffect(() => { void load(); }, [user.id]);

  // Group owned tables: primaries (no tab_group_id) + their secondary tabs
  const primaryTables = tables.filter((t) => !t.tab_group_id);
  const secondaryTabs = tables.filter((t) => !!t.tab_group_id);

  const tableGroups = primaryTables.map((primary) => ({
    primary,
    tabs: secondaryTabs
      .filter((t) => t.tab_group_id === primary.id)
      .sort((a, b) => a.tab_order - b.tab_order),
  }));

  return (
    <div>
      <PearsonNav user={user} />
      <main className="dashboard">
        <div className="dashboard__header">
          <div>
            <h1 className="dashboard__title">My tables</h1>
            <p className="text-soft mt-4">Create and manage your Pearson interactive tables</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link to="/course" className="btn btn-secondary">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M4 19.5V6a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2.5z"/><path d="M9 8h7M9 12h7"/></svg>
              Course builder
            </Link>
            <Link to="/linked/new" className="btn btn-secondary">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
              Linked dashboard
            </Link>
            <Link to="/builder/new" className="btn btn-primary">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
              New table
            </Link>
          </div>
        </div>

        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
            <div className="spinner spinner-lg" />
          </div>
        )}

        {!loading && tableGroups.length === 0 && sharedTables.length === 0 && (
          <div className="dashboard__empty card">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18M3 15h18M9 3v18" />
            </svg>
            <h2 style={{ marginTop: 16, fontSize: 20, fontWeight: 700 }}>No tables yet</h2>
            <p className="text-soft mt-8">Upload a spreadsheet to create your first interactive table.</p>
            <Link to="/builder/new" className="btn btn-primary" style={{ marginTop: 20 }}>Create first table →</Link>
          </div>
        )}

        {!loading && tableGroups.length > 0 && (
          <div className="dashboard__grid">
            {tableGroups.map(({ primary, tabs }) =>
              tabs.length > 0
                ? <TabGroupCard key={primary.id} primary={primary} tabs={tabs} onUpdate={() => void load()} />
                : <TableCard key={primary.id} table={primary} isOwner={true} onUpdate={() => void load()} />
            )}
          </div>
        )}

        {!loading && sharedTables.length > 0 && (
          <>
            <div className="dashboard__section-heading">
              <h2>Shared with me</h2>
              <p className="text-soft text-sm">Tables others have shared with your account</p>
            </div>
            <div className="dashboard__grid">
              {sharedTables.map((t) => (
                <TableCard key={t.id} table={t} isOwner={false} onUpdate={() => void load()} />
              ))}
            </div>
          </>
        )}

        {!loading && linkedDashboards.length > 0 && (
          <>
            <div className="dashboard__section-heading">
              <h2>Linked dashboards</h2>
              <p className="text-soft text-sm">Multi-spreadsheet dashboards joined by a common key</p>
            </div>
            <div className="dashboard__grid">
              {linkedDashboards.map((d) => (
                <LinkedDashboardCard key={d.id} dashboard={d} onUpdate={() => void load()} />
              ))}
            </div>
          </>
        )}

        {!loading && sharedLinkedDashboards.length > 0 && (
          <>
            <div className="dashboard__section-heading">
              <h2>Shared dashboards</h2>
              <p className="text-soft text-sm">Linked dashboards others have shared with your account</p>
            </div>
            <div className="dashboard__grid">
              {sharedLinkedDashboards.map((d) => (
                <LinkedDashboardCard key={d.id} dashboard={d} accessLevel={(d as LinkedDashboard & { _accessLevel?: 'view' | 'edit' })._accessLevel ?? 'view'} onUpdate={() => void load()} />
              ))}
            </div>
          </>
        )}

        {!loading && coursePlans.length > 0 && (
          <>
            <div className="dashboard__section-heading">
              <h2>Course plans</h2>
              <p className="text-soft text-sm">Post-16 programmes you are planning from the Options Guide</p>
            </div>
            <div className="cb-card-grid">
              {coursePlans.map((plan) => (
                <CoursePlanCard key={plan.id} plan={plan} onUpdate={() => void load()} />
              ))}
            </div>
          </>
        )}

        {!loading && sharedCoursePlans.length > 0 && (
          <>
            <div className="dashboard__section-heading">
              <h2>Shared course plans</h2>
              <p className="text-soft text-sm">Course plans colleagues have shared with your account</p>
            </div>
            <div className="cb-card-grid">
              {sharedCoursePlans.map((plan) => (
                <CoursePlanCard
                  key={plan.id}
                  plan={plan}
                  accessLevel={plan._accessLevel ?? 'view'}
                  onUpdate={() => void load()}
                />
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
