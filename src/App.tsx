import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { SuperAdminContext } from './lib/SuperAdminContext';
import type { User } from '@supabase/supabase-js';

import ProtectedRoute       from './components/layout/ProtectedRoute';
import LandingPage          from './pages/LandingPage';
import LoginPage            from './pages/LoginPage';
import SignupPage           from './pages/SignupPage';
import AuthCallbackPage     from './pages/AuthCallbackPage';
import DashboardPage        from './pages/DashboardPage';
import BuilderNewPage       from './pages/BuilderNewPage';
import BuilderEditPage      from './pages/BuilderEditPage';
import PublicTablePage      from './pages/PublicTablePage';
import LinkedBuilderPage    from './pages/LinkedBuilderPage';
import LinkedDashboardPage  from './pages/LinkedDashboardPage';
import LinkedEditPage       from './pages/LinkedEditPage';
import AdminPage            from './pages/AdminPage';

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user ?? null;
      setUser(u);
      if (u) void updateLastLogin(u.id);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (session?.user && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
        void updateLastLogin(session.user.id);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) { setIsSuperAdmin(false); return; }
    supabase
      .from('profiles')
      .select('is_super_admin')
      .eq('id', user.id)
      .single()
      .then(({ data }) => setIsSuperAdmin(data?.is_super_admin ?? false));
  }, [user?.id]);

  function updateLastLogin(userId: string) {
    return supabase
      .from('profiles')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', userId);
  }

  return (
    <SuperAdminContext.Provider value={isSuperAdmin}>
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/"              element={user ? <Navigate to="/dashboard" replace /> : <LandingPage />} />
        <Route path="/login"         element={user ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
        <Route path="/signup"        element={user ? <Navigate to="/dashboard" replace /> : <SignupPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/t/:slug"       element={<PublicTablePage />} />
        <Route path="/ld/:slug"      element={<LinkedDashboardPage />} />

        {/* Protected */}
        <Route path="/dashboard" element={
          <ProtectedRoute user={user}>
            <DashboardPage user={user!} />
          </ProtectedRoute>
        } />
        <Route path="/admin" element={
          <ProtectedRoute user={user}>
            {isSuperAdmin ? <AdminPage user={user!} /> : <Navigate to="/dashboard" replace />}
          </ProtectedRoute>
        } />
        <Route path="/builder/new" element={
          <ProtectedRoute user={user}>
            <BuilderNewPage user={user!} />
          </ProtectedRoute>
        } />
        <Route path="/builder/:id" element={
          <ProtectedRoute user={user}>
            <BuilderEditPage user={user!} />
          </ProtectedRoute>
        } />
        <Route path="/linked/new" element={
          <ProtectedRoute user={user}>
            <LinkedBuilderPage user={user!} />
          </ProtectedRoute>
        } />
        <Route path="/linked/:id/edit" element={
          <ProtectedRoute user={user}>
            <LinkedEditPage user={user!} />
          </ProtectedRoute>
        } />

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
    </SuperAdminContext.Provider>
  );
}
