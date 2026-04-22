import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import PearsonNav from '../components/layout/PearsonNav';
import './AuthPage.css';

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error: authErr } = await supabase.auth.signInWithPassword({ email, password });
    if (authErr) {
      setError(authErr.message);
    } else {
      navigate('/dashboard');
    }
    setLoading(false);
  };

  return (
    <div>
      <PearsonNav />
      <div className="auth-page">
        <div className="auth-card card">
          <h1 className="auth-card__title">Sign in</h1>
          <p className="auth-card__sub">Use your Pearson email address</p>
          <form onSubmit={(e) => void handleSubmit(e)} className="auth-form">
            <div className="input-group">
              <label className="input-label">Email</label>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </div>
            <div className="input-group">
              <label className="input-label">Password</label>
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
            </div>
            {error && <p className="error-msg">{error}</p>}
            <button className="btn btn-primary w-full" type="submit" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
          <p className="auth-card__footer">
            Don't have an account? <Link to="/signup">Sign up</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
