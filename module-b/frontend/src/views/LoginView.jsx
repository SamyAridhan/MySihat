import { useState } from 'react';

export default function LoginView({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit() {
    if (!username || !password) {
      setError('Username and password are required.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await onLogin(username, password);
    } catch (err) {
      setError(err.message || 'Login failed.');
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleSubmit();
  }

  return (
    <div className="centered fade-in" style={{ flexDirection: 'column', gap: 0 }}>
      {/* Brand mark */}
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 28,
          fontWeight: 500,
          color: 'var(--teal)',
          letterSpacing: '-0.03em',
          marginBottom: 6
        }}>
          MySihat
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Offline-First Clinic Interface
        </div>
      </div>

      {/* Login card */}
      <div className="card" style={{ width: 360 }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
            Doctor Sign In
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Session expires after one clinic shift (8 hours)
          </div>
        </div>

        {error && (
          <div className="error-banner" style={{ marginBottom: 16 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label className="label">Username</label>
            <input
              className="input"
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
              placeholder="dr_ahmad"
            />
          </div>
          <div>
            <label className="label">Password</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="••••••••"
            />
          </div>
          <button
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </div>
      </div>

      {/* Mode indicator */}
      <div style={{
        marginTop: 20,
        fontSize: 11,
        color: 'var(--text-muted)',
        fontFamily: 'var(--font-mono)',
        display: 'flex',
        alignItems: 'center',
        gap: 6
      }}>
        <span style={{
          width: 6, height: 6,
          borderRadius: '50%',
          background: '#F59E0B',
          display: 'inline-block'
        }} />
        MOCK MODE — no hardware required
      </div>
    </div>
  );
}