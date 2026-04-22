import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import PearsonNav from '../components/layout/PearsonNav';
import './AuthPage.css';

export default function SignupPage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.toLowerCase().endsWith('@pearson.com')) {
      setError('Only @pearson.com email addresses can sign up.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    const { error: authErr } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name.trim() } },
    });
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
          <h1 className="auth-card__title">Create account</h1>
          <p className="auth-card__sub">Pearson colleagues only · @pearson.com required</p>
          <form onSubmit={(e) => void handleSubmit(e)} className="auth-form">
            <div className="input-group">
              <label className="input-label">Full name</label>
              <input className="input" type="text" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
            </div>
            <div className="input-group">
              <label className="input-label">Work email</label>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" placeholder="you@pearson.com" />
            </div>
            <div className="input-group">
              <label className="input-label">Password</label>
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" minLength={8} />
            </div>
            {error && <p className="error-msg">{error}</p>}
            <button className="btn btn-primary w-full" type="submit" disabled={loading}>
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </form>
          <p className="auth-card__footer">
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
