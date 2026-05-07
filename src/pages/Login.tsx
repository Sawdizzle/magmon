import { useState } from 'react'
import { supabase } from '../lib/supabase'
import MagmonLogo from '../components/MagmonLogo'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'login' | 'reset'>('login')
  const [resetSent, setResetSent] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setLoading(false)
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin
    })
    if (error) setError(error.message)
    else setResetSent(true)
    setLoading(false)
  }

  return (
    <div className="login-page">
      <div className="login-box">
        <div className="login-logo">
          <MagmonLogo size={42} />
          <div>
            <div className="login-title">Mag<span style={{ color: 'var(--cyan)' }}>Mon</span></div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>GE Magnet Monitor</div>
          </div>
        </div>

        {mode === 'login' ? (
          <>
            <p className="login-subtitle">Sign in to your account</p>
            <form onSubmit={handleLogin}>
              <div className="form-group">
                <label>Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required autoComplete="email" />
              </div>
              <div className="form-group">
                <label>Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required autoComplete="current-password" />
              </div>
              {error && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 12, padding: '8px 10px', background: 'rgba(240,82,82,0.1)', borderRadius: 4 }}>{error}</div>}
              <button className="btn-primary" type="submit" disabled={loading} style={{ width: '100%', marginTop: 4, padding: '10px' }}>
                {loading ? 'Signing in…' : 'Sign In'}
              </button>
            </form>
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <button className="btn-ghost" style={{ fontSize: 12, border: 'none', color: 'var(--cyan)', background: 'none', padding: '4px' }} onClick={() => { setMode('reset'); setError(null); }}>
                Forgot password?
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="login-subtitle">Enter your email to receive a reset link</p>
            {resetSent ? (
              <div style={{ textAlign: 'center', color: 'var(--green)', fontSize: 14 }}>
                ✓ Check your email for a reset link
              </div>
            ) : (
              <form onSubmit={handleReset}>
                <div className="form-group">
                  <label>Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required />
                </div>
                {error && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 12 }}>{error}</div>}
                <button className="btn-primary" type="submit" disabled={loading} style={{ width: '100%' }}>
                  {loading ? 'Sending…' : 'Send Reset Link'}
                </button>
              </form>
            )}
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <button className="btn-ghost" style={{ fontSize: 12, border: 'none', color: 'var(--cyan)', background: 'none' }} onClick={() => { setMode('login'); setError(null); setResetSent(false); }}>
                ← Back to sign in
              </button>
            </div>
          </>
        )}

        <div style={{ marginTop: 28, paddingTop: 16, borderTop: '1px solid var(--border)', textAlign: 'center', fontSize: 11, color: 'var(--text-muted)' }}>
          Numed, Inc. · Saw Tech Solutions
        </div>
      </div>
    </div>
  )
}
