'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { API_BASE, setAuth, isAuthenticated } from '@/lib/auth'

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  // Already authed — go straight to dialer
  useEffect(() => {
    if (isAuthenticated()) router.replace('/dialer')
  }, [router])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      setAuth(body.token, body.agent)
      router.replace('/dialer')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&family=IBM+Plex+Mono:wght@400;500&display=swap');

        .login-root {
          min-height: 100vh;
          background: #020810;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'IBM Plex Mono', monospace;
          position: relative;
          overflow: hidden;
        }
        .login-grid {
          position: fixed;
          inset: 0;
          background-image:
            linear-gradient(rgba(0,229,255,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,229,255,0.04) 1px, transparent 1px);
          background-size: 42px 42px;
          pointer-events: none;
        }
        .login-glow {
          position: fixed;
          inset: 0;
          background:
            radial-gradient(circle at 20% 30%, rgba(0,229,255,0.08) 0%, transparent 40%),
            radial-gradient(circle at 80% 70%, rgba(255,76,160,0.06) 0%, transparent 35%);
          pointer-events: none;
        }
        .login-card {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 400px;
          padding: 40px;
          background: rgba(5, 12, 22, 0.92);
          border: 1px solid rgba(0,229,255,0.15);
          border-radius: 12px;
          backdrop-filter: blur(16px);
          box-shadow: 0 0 60px rgba(0,229,255,0.06), 0 24px 48px rgba(0,0,0,0.6);
        }
        .login-wordmark {
          font-family: 'Orbitron', sans-serif;
          font-size: 22px;
          font-weight: 900;
          letter-spacing: 0.18em;
          color: #00e5ff;
          margin-bottom: 6px;
        }
        .login-sub {
          font-size: 10px;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.3);
          margin-bottom: 36px;
        }
        .login-label {
          display: block;
          font-size: 10px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.35);
          margin-bottom: 8px;
        }
        .login-input {
          width: 100%;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 7px;
          color: #e2e8f0;
          font-size: 14px;
          font-family: 'IBM Plex Mono', monospace;
          padding: 11px 14px;
          margin-bottom: 20px;
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
          box-sizing: border-box;
        }
        .login-input:focus {
          border-color: rgba(0,229,255,0.4);
          box-shadow: 0 0 0 3px rgba(0,229,255,0.08);
        }
        .login-btn {
          width: 100%;
          padding: 13px;
          background: #00e5ff;
          border: none;
          border-radius: 7px;
          color: #020810;
          font-family: 'Orbitron', sans-serif;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.16em;
          cursor: pointer;
          transition: opacity 0.15s, transform 0.1s;
          margin-top: 4px;
        }
        .login-btn:hover:not(:disabled) { opacity: 0.88; }
        .login-btn:active:not(:disabled) { transform: scale(0.99); }
        .login-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .login-error {
          margin-top: 16px;
          padding: 10px 14px;
          background: rgba(239,68,68,0.12);
          border: 1px solid rgba(239,68,68,0.3);
          border-radius: 7px;
          font-size: 12px;
          color: #fca5a5;
        }
        .login-divider {
          height: 1px;
          background: rgba(255,255,255,0.07);
          margin: 28px 0 24px;
        }
        .login-hint {
          font-size: 10px;
          color: rgba(255,255,255,0.2);
          letter-spacing: 0.1em;
          text-align: center;
        }
      `}</style>

      <div className="login-root">
        <div className="login-grid" />
        <div className="login-glow" />

        <form className="login-card" onSubmit={submit}>
          <div className="login-wordmark">AEON DIAL</div>
          <div className="login-sub">Agent Access Terminal</div>

          <label className="login-label" htmlFor="username">Username</label>
          <input
            id="username"
            className="login-input"
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
            required
          />

          <label className="login-label" htmlFor="password">Password</label>
          <input
            id="password"
            className="login-input"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />

          <button className="login-btn" type="submit" disabled={loading}>
            {loading ? 'AUTHENTICATING…' : 'ENTER SYSTEM'}
          </button>

          {error && <div className="login-error">⚠ {error}</div>}

          <div className="login-divider" />
          <div className="login-hint">AEON DIAL · AUTHORIZED ACCESS ONLY</div>
        </form>
      </div>
    </>
  )
}
