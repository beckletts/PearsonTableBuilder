import { Navigate } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';

interface Props {
  user: User | null | undefined;
  children: React.ReactNode;
}

export default function ProtectedRoute({ user, children }: Props) {
  if (user === undefined) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner spinner-lg" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
