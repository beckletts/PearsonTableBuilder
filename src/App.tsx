import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import type { User } from '@supabase/supabase-js';

import ProtectedRoute   from './components/layout/ProtectedRoute';
import LandingPage      from './pages/LandingPage';
import LoginPage        from './pages/LoginPage';
import SignupPage       from './pages/SignupPage';
import AuthCallbackPage from './pages/AuthCallbackPage';
import DashboardPage    from './pages/DashboardPage';
import BuilderNewPage   from './pages/BuilderNewPage';
import BuilderEditPage  from './pages/BuilderEditPage';
import PublicTablePage  from './pages/PublicTablePage';

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/"              element={user ? <Navigate to="/dashboard" replace /> : <LandingPage />} />
        <Route path="/login"         element={user ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
        <Route path="/signup"        element={user ? <Navigate to="/dashboard" replace /> : <SignupPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/t/:slug"       element={<PublicTablePage />} />

        {/* Protected */}
        <Route path="/dashboard" element={
          <ProtectedRoute user={user}>
            <DashboardPage user={user!} />
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

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
