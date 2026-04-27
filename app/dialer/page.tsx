'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiFetch, isAuthenticated } from '@/lib/auth'

// ─── Types ────────────────────────────────────────────────────────────────────

type AgentState =
  | 'OFFLINE' | 'REGISTERING' | 'REGISTERED' | 'READY'
  | 'RESERVED' | 'IN_CALL' | 'WRAP_UP' | 'PAUSED' | 'ERROR'

type Disposition =
  | 'Interested' | 'Not Interested' | 'Callback' | 'Do Not Call'
  | 'No Answer' | 'Voicemail' | 'Wrong Number' | 'Other'

interface Lead {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string
  quality: string | null
  city: string | null
  state: string | null
}

interface ActiveCall {
  id: string
  status: string
  disposition: Disposition | null
  notes: string | null
  started_at: string
  answered_at: string | null
  leads: Lead | null
}

interface HistoryCall {
  id: string
  status: string
  disposition: Disposition | null
  started_at: string
  ended_at: string | null
  duration_seconds: number | null
  leads: { first_name: string | null; last_name: string | null; phone: string } | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DISP_TONES: Record<Disposition, string> = {
  'Interested':     '#22c55e',
  'Not Interested': '#ef4444',
  'Callback':       '#06b6d4',
  'Do Not Call':    '#dc2626',
  'No Answer':      '#6b7280',
  'Voicemail':      '#a78bfa',
  'Wrong Number':   '#f59e0b',
  'Other':          '#94a3b8',
}

const DISPOSITIONS: Disposition[] = [
  'Interested', 'Not Interested', 'Callback', 'Do Not Call',
  'No Answer', 'Voicemail', 'Wrong Number', 'Other',
]

const STATE_META: Record<AgentState, { label: string; color: string }> = {
  OFFLINE:     { label: 'Offline',     color: '#4a5568' },
  REGISTERING: { label: 'Connecting',  color: '#d4a017' },
  REGISTERED:  { label: 'Standby',     color: '#3b82f6' },
  READY:       { label: 'Ready',       color: '#22c55e' },
  RESERVED:    { label: 'Dialing',     color: '#f59e0b' },
  IN_CALL:     { label: 'In Call',     color: '#06b6d4' },
  WRAP_UP:     { label: 'Wrap Up',     color: '#a78bfa' },
  PAUSED:      { label: 'Paused',      color: '#f97316' },
  ERROR:       { label: 'Error',       color: '#ef4444' },
}

function leadName(l: Pick<Lead, 'first_name' | 'last_name'> | null) {
  if (!l) return 'Unknown'
  return [l.first_name, l.last_name].filter(Boolean).join(' ') || 'Unknown'
}

function fmtPhone(raw: string) {
  const d = raw.replace(/\D/g, '')
  if (d.length === 11 && d[0] === '1')
    return `+1 (${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`
  if (d.length === 10)
    return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`
  return raw
}

function fmtDuration(secs: number | null) {
  if (!secs) return '—'
  const m = Math.floor(secs / 60), s = secs % 60
  return m ? `${m}m ${s}s` : `${s}s`
}

function elapsed(isoStart: string) {
  const s = Math.floor((Date.now() - new Date(isoStart).getTime()) / 1000)
  return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StateChip({ state }: { state: AgentState }) {
  const { label, color } = STATE_META[state]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '3px 10px', borderRadius: 20,
      fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
      background: `${color}22`, color, border: `1px solid ${color}44`,
    }}>
      <span style={{
        width: 7, height: 7, borderRadius: '50%', background: color,
        animation: state === 'IN_CALL' || state === 'READY'
          ? 'dialPulse 1.8s ease infinite' : 'none',
        boxShadow: state === 'IN_CALL' ? `0 0 0 3px ${color}33` : 'none',
      }} />
      {label}
    </span>
  )
}

function CenterStage({ state, lead, timer, activeCall, onArm, onReady, onPause, onHangup, loading }: {
  state: AgentState
  lead: Lead | null
  timer: string
  activeCall: ActiveCall | null
  onArm: () => void
  onReady: () => void
  onPause: () => void
  onHangup: () => void
  loading: string | null
}) {
  const idle = (icon: string, color: string, title: string, sub: string, btn?: React.ReactNode) => (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', gap:24, textAlign:'center' }}>
      <div style={{ width:72, height:72, borderRadius:'50%', background:`${color}11`, border:`1px solid ${color}22`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:32 }}>{icon}</div>
      <div>
        <div style={{ fontSize:18, fontWeight:800, color, marginBottom:8 }}>{title}</div>
        <div style={{ fontSize:13, color:'rgba(255,255,255,0.4)', maxWidth:280 }}>{sub}</div>
      </div>
      {btn}
    </div>
  )

  const btn = (label: string, cls: string, onClick: () => void, disabled = false) => (
    <button className={`d-btn ${cls}`} onClick={onClick} disabled={disabled}
      style={{ width:'auto', padding:'12px 32px', fontSize:14, fontWeight:700 }}>
      {label}
    </button>
  )

  if (state === 'OFFLINE')
    return idle('📞', '#4a5568', 'Dialer Offline',
      'Arm your session to connect to the campaign queue.',
      btn(loading === 'arm' ? 'Connecting…' : '⚡ Arm Session', 'primary', onArm, loading === 'arm'))

  if (state === 'REGISTERING')
    return idle('⚡', '#d4a017', 'Connecting…', 'Registering SIP endpoint with Telnyx.')

  if (state === 'REGISTERED')
    return idle('✅', '#3b82f6', 'Session Armed',
      'SIP registered. Go Ready to receive calls from the campaign queue.',
      btn(loading === 'ready' ? 'Setting…' : '▶ Go Ready', 'success', onReady, loading === 'ready'))

  if (state === 'PAUSED')
    return idle('⏸', '#f97316', 'Paused',
      'Campaign dialer is paused. Resume when ready.',
      btn('▶ Resume', 'success', onReady))

  if (state === 'READY')
    return idle('📶', '#22c55e', 'Ready for Calls',
      'Waiting for the campaign dialer to connect you with a lead.')

  if (state === 'RESERVED')
    return idle('📲', '#f59e0b', 'Dialing Lead…',
      lead ? leadName(lead) : 'Connecting — your browser will ring shortly.')

  if (state === 'IN_CALL') return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', gap:18 }}>
      <div style={{ textAlign:'center', paddingTop:8 }}>
        <div className="d-label" style={{ marginBottom:4 }}>Call Duration</div>
        <div style={{ fontSize:48, fontWeight:900, color:'#06b6d4', fontVariantNumeric:'tabular-nums', letterSpacing:'0.05em', textShadow:'0 0 40px #06b6d455' }}>
          {activeCall?.answered_at ? timer : '——'}
        </div>
      </div>
      {lead ? (
        <div style={{ background:'rgba(6,182,212,0.06)', border:'1px solid rgba(6,182,212,0.2)', borderRadius:10, padding:18 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
            <div>
              <div style={{ fontSize:20, fontWeight:800, color:'#f0f4ff' }}>{leadName(lead)}</div>
              {lead.city && <div style={{ fontSize:12, color:'rgba(255,255,255,0.4)', marginTop:3 }}>{[lead.city, lead.state].filter(Boolean).join(', ')}</div>}
            </div>
            {lead.quality && (
              <span style={{
                padding:'2px 8px', borderRadius:12, fontSize:10, fontWeight:700,
                textTransform:'uppercase', letterSpacing:'0.06em',
                background: lead.quality==='hot' ? 'rgba(239,68,68,0.15)' : lead.quality==='warm' ? 'rgba(245,158,11,0.15)' : 'rgba(100,116,139,0.15)',
                color: lead.quality==='hot' ? '#fca5a5' : lead.quality==='warm' ? '#fcd34d' : '#94a3b8',
              }}>{lead.quality}</span>
            )}
          </div>
          <div style={{ fontSize:22, fontWeight:700, color:'#06b6d4' }}>{fmtPhone(lead.phone)}</div>
          {lead.email && <div style={{ fontSize:12, color:'rgba(255,255,255,0.35)', marginTop:6 }}>{lead.email}</div>}
        </div>
      ) : (
        <div style={{ textAlign:'center', color:'rgba(255,255,255,0.3)', fontSize:13 }}>Lead info loading…</div>
      )}
      <div style={{ flex:1 }} />
      <button className="d-btn danger" onClick={onHangup} disabled={loading==='hangup'}
        style={{ padding:14, fontSize:15, fontWeight:700 }}>
        {loading==='hangup' ? 'Hanging up…' : '⊘ End Call'}
      </button>
    </div>
  )

  return null
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function DialerPage() {
  const router = useRouter()

  const [agentState,  setAgentState]  = useState<AgentState>('OFFLINE')
  const [activeCall,  setActiveCall]  = useState<ActiveCall | null>(null)
  const [history,     setHistory]     = useState<HistoryCall[]>([])
  const [timer,       setTimer]       = useState('00:00')
  const [loading,     setLoading]     = useState<string | null>(null)
  const [error,       setError]       = useState<string | null>(null)

  // Wrap-up form state
  const [disposition, setDisposition] = useState<Disposition | null>(null)
  const [notes,       setNotes]       = useState('')
  const [callbackAt,  setCallbackAt]  = useState('')
  const [wrapping,    setWrapping]    = useState(false)

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Auth guard
  useEffect(() => {
    if (!isAuthenticated()) router.replace('/login')
  }, [router])

  // ── History
  const loadHistory = useCallback(async () => {
    try {
      const { calls } = await apiFetch<{ calls: HistoryCall[] }>('/calls/history')
      setHistory(calls.slice(0, 10))
    } catch { /* silent */ }
  }, [])

  useEffect(() => { loadHistory() }, [loadHistory])

  // ── Poll session + active call every 3s
  const poll = useCallback(async () => {
    try {
      const [{ session }, { call }] = await Promise.all([
        apiFetch<{ session: { state: AgentState } | null }>('/session/me'),
        apiFetch<{ call: ActiveCall | null }>('/calls/current'),
      ])
      setAgentState(session?.state ?? 'OFFLINE')
      setActiveCall(call)
      setError(null)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : ''
      if (msg.includes('401') || msg.includes('Unauthorized')) {
        stopPolling()
        router.replace('/login')
      }
    }
  }, [router])

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  const startPolling = useCallback(() => {
    stopPolling()
    poll()
    pollRef.current = setInterval(poll, 3000)
  }, [poll])

  useEffect(() => () => stopPolling(), [])

  // ── Call timer
  useEffect(() => {
    if (!activeCall?.answered_at) return
    const id = setInterval(() => setTimer(elapsed(activeCall.answered_at!)), 500)
    return () => clearInterval(id)
  }, [activeCall?.answered_at])

  // ── Reset wrap-up form on new call
  useEffect(() => {
    if (agentState === 'RESERVED' || agentState === 'IN_CALL') {
      setDisposition(null); setNotes(''); setCallbackAt('')
    }
  }, [agentState])

  // ── Actions
  async function arm() {
    setLoading('arm'); setError(null)
    try {
      await apiFetch('/session/register', { method: 'POST' })
      setAgentState('REGISTERED')
      startPolling()
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed') }
    finally { setLoading(null) }
  }

  async function goReady() {
    setLoading('ready'); setError(null)
    try {
      await apiFetch('/session/ready', { method: 'POST' })
      setAgentState('READY')
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed') }
    finally { setLoading(null) }
  }

  async function pause() {
    setLoading('pause')
    try {
      await apiFetch('/session/pause', { method: 'POST' })
      setAgentState('PAUSED')
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed') }
    finally { setLoading(null) }
  }

  async function hangup() {
    if (!activeCall) return
    setLoading('hangup')
    try { await apiFetch(`/calls/${activeCall.id}/hangup`, { method: 'POST' }) }
    catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed') }
    finally { setLoading(null) }
  }

  async function submitWrapUp() {
    if (!activeCall || !disposition) return
    setWrapping(true); setError(null)
    try {
      await apiFetch(`/calls/${activeCall.id}/wrapup`, {
        method: 'POST',
        body: JSON.stringify({
          disposition,
          notes: notes || undefined,
          callback_at: callbackAt || undefined,
        }),
      })
      setActiveCall(null); setDisposition(null); setNotes(''); setCallbackAt('')
      await loadHistory()
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed') }
    finally { setWrapping(false) }
  }

  const lead = activeCall?.leads ?? null

  // ── Computed stats
  const durations = history.filter(c => c.duration_seconds).map(c => c.duration_seconds!)
  const avgDuration = durations.length
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : null

  return (
    <>
      <style>{`
        @keyframes dialPulse {
          0%,100% { box-shadow: 0 0 0 3px currentColor22; }
          50%      { box-shadow: 0 0 0 6px currentColor11; }
        }
        .d-panel {
          background: rgba(5,10,20,0.7);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 10px; padding: 20px;
          display: flex; flex-direction: column; gap: 14px;
        }
        .d-label {
          font-size: 10px; font-weight: 700; letter-spacing: 0.12em;
          text-transform: uppercase; color: rgba(255,255,255,0.3);
        }
        .d-btn {
          width: 100%; padding: 11px 16px; border-radius: 8px;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.05); color: #f0f4ff;
          font-size: 13px; font-weight: 600; cursor: pointer;
          transition: all 0.15s; font-family: inherit;
        }
        .d-btn:hover:not(:disabled) { background: rgba(255,255,255,0.1); }
        .d-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .d-btn.primary { background: #06b6d4; border-color: #06b6d4; color: #020a10; }
        .d-btn.primary:hover:not(:disabled) { background: #0891b2; }
        .d-btn.danger { background: rgba(239,68,68,0.15); border-color: rgba(239,68,68,0.4); color: #fca5a5; }
        .d-btn.danger:hover:not(:disabled) { background: rgba(239,68,68,0.25); }
        .d-btn.success { background: rgba(34,197,94,0.15); border-color: rgba(34,197,94,0.4); color: #86efac; }
        .d-btn.success:hover:not(:disabled) { background: rgba(34,197,94,0.25); }
        .d-btn.amber { background: rgba(245,158,11,0.15); border-color: rgba(245,158,11,0.4); color: #fcd34d; }
        .d-btn.amber:hover:not(:disabled) { background: rgba(245,158,11,0.25); }
        .d-divider { height: 1px; background: rgba(255,255,255,0.06); }
        .disp-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .disp-btn {
          padding: 9px 8px; border-radius: 7px;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.03); color: rgba(255,255,255,0.55);
          font-size: 11px; font-weight: 600; cursor: pointer;
          transition: all 0.15s; text-align: center; font-family: inherit;
        }
        .disp-btn:hover { background: rgba(255,255,255,0.08); }
        .disp-btn.sel {
          border-color: var(--dc); background: color-mix(in srgb, var(--dc) 16%, transparent);
          color: var(--dc);
        }
        .d-textarea, .d-input {
          width: 100%; background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.1); border-radius: 8px;
          color: #e2e8f0; font-size: 13px; padding: 10px 12px;
          font-family: inherit; outline: none; transition: border-color 0.15s;
          box-sizing: border-box;
        }
        .d-textarea:focus, .d-input:focus { border-color: rgba(6,182,212,0.4); }
        .d-textarea { resize: none; }
        .hist-row {
          display: flex; align-items: flex-start; gap: 10px;
          padding: 9px 0; border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .hist-row:last-child { border-bottom: none; }
        .err { padding: 8px 12px; background: rgba(239,68,68,0.12);
          border: 1px solid rgba(239,68,68,0.3); border-radius: 7px;
          font-size: 12px; color: #fca5a5; }
      `}</style>

      <div style={{ padding: '14px 18px', height: 'calc(100% - 28px)', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* ── Header ── */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:15, fontWeight:800, color:'#f0f4ff', letterSpacing:'-0.01em' }}>
              AEON Dialer
            </span>
            <StateChip state={agentState} />
          </div>
          <div style={{ display:'flex', gap:8 }}>
            {agentState === 'OFFLINE' && (
              <button className="d-btn primary" style={{ width:'auto', padding:'7px 18px', fontSize:12 }}
                onClick={arm} disabled={loading==='arm'}>
                {loading==='arm' ? 'Connecting…' : '⚡ Arm Session'}
              </button>
            )}
            {(agentState === 'REGISTERED' || agentState === 'PAUSED') && (
              <button className="d-btn success" style={{ width:'auto', padding:'7px 18px', fontSize:12 }}
                onClick={goReady} disabled={loading==='ready'}>
                {loading==='ready' ? 'Setting…' : '▶ Go Ready'}
              </button>
            )}
            {agentState === 'READY' && (
              <button className="d-btn amber" style={{ width:'auto', padding:'7px 18px', fontSize:12 }}
                onClick={pause} disabled={!!loading}>
                ⏸ Pause
              </button>
            )}
          </div>
        </div>

        {error && <div className="err">⚠ {error}</div>}

        {/* ── 3-col grid ── */}
        <div style={{ flex:1, minHeight:0, display:'grid', gridTemplateColumns:'256px 1fr 256px', gap:14 }}>

          {/* LEFT — controls + stats */}
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div className="d-panel">
              <div className="d-label">Session Control</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <div>
                  <div className="d-label" style={{ marginBottom:6 }}>State</div>
                  <StateChip state={agentState} />
                </div>
                <div>
                  <div className="d-label" style={{ marginBottom:4 }}>Timer</div>
                  <div style={{ fontSize:18, fontWeight:800, color:'#06b6d4', fontVariantNumeric:'tabular-nums' }}>
                    {agentState==='IN_CALL' ? timer : '——'}
                  </div>
                </div>
              </div>
              {agentState !== 'OFFLINE' && agentState !== 'REGISTERING' && (
                <>
                  <div className="d-divider" />
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    {agentState==='IN_CALL' && (
                      <button className="d-btn danger" onClick={hangup} disabled={loading==='hangup'}>
                        {loading==='hangup' ? 'Hanging up…' : '⊘ End Call'}
                      </button>
                    )}
                    {agentState==='READY' && (
                      <button className="d-btn amber" onClick={pause} disabled={!!loading}>⏸ Pause</button>
                    )}
                    {(agentState==='REGISTERED' || agentState==='PAUSED') && (
                      <button className="d-btn success" onClick={goReady} disabled={loading==='ready'}>▶ Go Ready</button>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="d-panel" style={{ flex:1, gap:16 }}>
              <div className="d-label">Today's Stats</div>
              <div>
                <div className="d-label" style={{ marginBottom:4 }}>Calls Handled</div>
                <div style={{ fontSize:28, fontWeight:800, color:'#f0f4ff' }}>{history.length}</div>
              </div>
              <div className="d-divider" />
              <div>
                <div className="d-label" style={{ marginBottom:4 }}>Last Disposition</div>
                <div style={{ fontSize:13, fontWeight:700, color: history[0]?.disposition ? DISP_TONES[history[0].disposition as Disposition] : 'rgba(255,255,255,0.25)' }}>
                  {history[0]?.disposition ?? '—'}
                </div>
              </div>
              <div>
                <div className="d-label" style={{ marginBottom:4 }}>Avg Duration</div>
                <div style={{ fontSize:14, fontWeight:700, color:'#94a3b8' }}>{fmtDuration(avgDuration)}</div>
              </div>
            </div>
          </div>

          {/* CENTER — main stage */}
          <div className="d-panel" style={{ overflow:'auto' }}>
            {agentState !== 'WRAP_UP' ? (
              <CenterStage
                state={agentState} lead={lead} timer={timer} activeCall={activeCall}
                onArm={arm} onReady={goReady} onPause={pause} onHangup={hangup}
                loading={loading}
              />
            ) : (
              /* ── Wrap-up form ── */
              <div style={{ display:'flex', flexDirection:'column', gap:18 }}>
                <div>
                  <div style={{ fontSize:16, fontWeight:800, color:'#a78bfa', marginBottom:4 }}>Wrap Up</div>
                  {lead && <div style={{ fontSize:13, color:'rgba(255,255,255,0.45)' }}>{leadName(lead)} · {fmtPhone(lead.phone)}</div>}
                </div>

                <div>
                  <div className="d-label" style={{ marginBottom:8 }}>Disposition *</div>
                  <div className="disp-grid">
                    {DISPOSITIONS.map(d => (
                      <button
                        key={d}
                        className={`disp-btn${disposition===d ? ' sel' : ''}`}
                        style={{ '--dc': DISP_TONES[d] } as React.CSSProperties}
                        onClick={() => setDisposition(d)}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>

                {disposition === 'Callback' && (
                  <div>
                    <div className="d-label" style={{ marginBottom:6 }}>Callback Date & Time</div>
                    <input type="datetime-local" className="d-input"
                      value={callbackAt} onChange={e => setCallbackAt(e.target.value)} />
                  </div>
                )}

                <div>
                  <div className="d-label" style={{ marginBottom:6 }}>Notes</div>
                  <textarea className="d-textarea" rows={4}
                    placeholder="Add call notes…"
                    value={notes} onChange={e => setNotes(e.target.value)} />
                </div>

                {error && <div className="err">⚠ {error}</div>}

                <button className="d-btn primary"
                  onClick={submitWrapUp}
                  disabled={!disposition || wrapping}
                  style={{ padding:13, fontSize:14, fontWeight:800 }}>
                  {wrapping ? 'Submitting…' : disposition ? `✓ Submit: ${disposition}` : 'Select a disposition'}
                </button>
              </div>
            )}
          </div>

          {/* RIGHT — call history */}
          <div className="d-panel" style={{ overflow:'auto' }}>
            <div className="d-label">Recent Calls</div>
            {history.length === 0 ? (
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.2)', paddingTop:8 }}>No calls yet</div>
            ) : history.map(call => {
              const d = call.disposition as Disposition | null
              const color = d ? DISP_TONES[d] : '#4a5568'
              return (
                <div key={call.id} className="hist-row">
                  <div style={{ width:8, height:8, borderRadius:'50%', background:color, marginTop:4, flexShrink:0 }} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'#e2e8f0', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                      {leadName(call.leads)}
                    </div>
                    <div style={{ fontSize:11, color:'rgba(255,255,255,0.3)', marginTop:2 }}>
                      {d ?? call.status} · {fmtDuration(call.duration_seconds)}
                    </div>
                  </div>
                  <div style={{ fontSize:10, color, fontWeight:700, flexShrink:0, paddingTop:2 }}>
                    {d ? d.split(' ')[0] : '—'}
                  </div>
                </div>
              )
            })}
          </div>

        </div>
      </div>
    </>
  )
}
