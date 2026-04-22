import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type { User } from '@supabase/supabase-js';
import './PearsonNav.css';

interface Props {
  user?: User | null;
}

export default function PearsonNav({ user }: Props) {
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  return (
    <nav className="pearson-nav">
      <div className="pearson-nav__inner">
        <Link to={user ? '/dashboard' : '/'} className="pearson-nav__brand">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="28" height="28" rx="6" fill="#007FA3" />
            <path d="M7 8h8a4 4 0 0 1 0 8H7V8z" fill="white" />
            <rect x="7" y="18" width="5" height="2" rx="1" fill="white" />
          </svg>
          <span className="pearson-nav__title">Table Builder</span>
        </Link>

        <div className="pearson-nav__right">
          {user ? (
            <>
              <span className="pearson-nav__email">{user.email}</span>
              <button className="btn btn-secondary btn-sm" onClick={handleSignOut}>
                Sign out
              </button>
            </>
          ) : (
            <Link to="/login" className="btn btn-primary btn-sm">Sign in</Link>
          )}
        </div>
      </div>
    </nav>
  );
}
