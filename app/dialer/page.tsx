'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Clock, Mail, MapPin, Phone, Tag } from 'lucide-react'
import {
  AuthExpiredError,
  apiFetch,
  clearAuth,
  getToken,
  SESSION_EXPIRED_MESSAGE,
} from '@/lib/auth'
import {
  clearDialerAudioActiveCallBlock,
  playConnected,
  playDialTone,
  playDialerMusic,
  playHangup,
  stopAllDialerAudio,
  stopDialerMusicImmediate,
} from '@/lib/dialerSounds'
import { useTelnyxWebRTC } from '@/hooks/useTelnyxWebRTC'

// ─── Types ────────────────────────────────────────────────────────────────────

type AgentState =
  | 'OFFLINE' | 'REGISTERING' | 'REGISTERED' | 'READY'
  | 'RESERVED' | 'DIALING' | 'IN_CALL' | 'BRIDGED' | 'WRAP_UP' | 'PAUSED' | 'ERROR'

type Disposition =
  | 'Interested' | 'Not Interested' | 'Callback' | 'Do Not Call'
  | 'No Answer' | 'Voicemail' | 'Wrong Number' | 'Other'

interface Lead {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string
  quality?: string | null
  address: string | null
  city: string | null
  state: string | null
  zipcode: string | null
  source: string | null
  campaign: string | null
  notes: string | null
  metadata: Record<string, unknown> | null
}

interface ActiveCall {
  id: string
  status: string
  group_id: string | null
  agent_leg_id: string | null
  lead_leg_id: string | null
  disposition?: Disposition | null
  notes?: string | null
  started_at: string
  answered_at: string | null
  bridged_at: string | null
  lead?: Lead | null
  leads?: Lead | null
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
  DIALING:     { label: 'Dialing',     color: '#f59e0b' },
  IN_CALL:     { label: 'In Call',     color: '#06b6d4' },
  BRIDGED:     { label: 'Bridged',     color: '#06b6d4' },
  WRAP_UP:     { label: 'Wrap Up',     color: '#a78bfa' },
  PAUSED:      { label: 'Paused',      color: '#f97316' },
  ERROR:       { label: 'Error',       color: '#ef4444' },
}

const ACTIVE_LEAD_POLL_STATES = new Set<AgentState>(['READY', 'RESERVED', 'DIALING', 'IN_CALL', 'BRIDGED'])

const ACTIVE_CARD_DISPOSITIONS: Array<{ label: string; value: Disposition }> = [
  { label: 'Interested', value: 'Interested' },
  { label: 'Not Interested', value: 'Not Interested' },
  { label: 'Callback', value: 'Callback' },
  { label: 'No Answer', value: 'No Answer' },
  { label: 'Wrong Number', value: 'Wrong Number' },
  { label: 'DNC', value: 'Do Not Call' },
]

function leadName(l: Pick<Lead, 'first_name' | 'last_name'> | null) {
  if (!l) return 'Unknown'
  return [l.first_name, l.last_name].filter(Boolean).join(' ') || 'Unknown'
}

function currentLead(call: ActiveCall | null) {
  return call?.lead ?? call?.leads ?? null
}

function valueOrDash(value: string | null | undefined) {
  return value?.trim() ? value : '—'
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
        animation: state === 'IN_CALL' || state === 'BRIDGED' || state === 'READY'
          ? 'dialPulse 1.8s ease infinite' : 'none',
        boxShadow: state === 'IN_CALL' || state === 'BRIDGED' ? `0 0 0 3px ${color}33` : 'none',
      }} />
      {label}
    </span>
  )
}

function ActiveLeadCard({ state, call, timer, selectedDisposition, onSelectDisposition }: {
  state: AgentState
  call: ActiveCall | null
  timer: string
  selectedDisposition: Disposition | null
  onSelectDisposition: (disposition: Disposition) => void
}) {
  const lead = currentLead(call)
  const hasLiveCall = Boolean(call) || state === 'IN_CALL' || state === 'BRIDGED'
  const cityLine = lead ? [lead.city, lead.state, lead.zipcode].filter(Boolean).join(', ') : ''

  let body: React.ReactNode
  if (state === 'OFFLINE' || state === 'REGISTERED') {
    body = <div className="active-empty">Arm session to begin.</div>
  } else if (state === 'READY' && !call) {
    body = <div className="active-empty">Waiting for connected lead…</div>
  } else if ((state === 'RESERVED' || state === 'DIALING') && !hasLiveCall) {
    body = <div className="active-empty amber">Dialing leads…</div>
  } else if (!lead) {
    body = <div className="active-empty">Waiting for connected lead…</div>
  } else {
    body = (
      <>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12 }}>
          <div style={{ minWidth:0 }}>
            <div style={{ fontSize:20, fontWeight:900, color:'#f8fafc', overflow:'hidden', textOverflow:'ellipsis' }}>
              {leadName(lead)}
            </div>
            <div style={{ marginTop:5, display:'flex', alignItems:'center', gap:7, color:'#67e8f9', fontSize:18, fontWeight:800 }}>
              <Phone size={16} />
              <span>{fmtPhone(lead.phone)}</span>
            </div>
          </div>
          <div style={{
            padding:'5px 9px',
            borderRadius:8,
            border:'1px solid rgba(6,182,212,0.28)',
            background:'rgba(6,182,212,0.09)',
            color:'#67e8f9',
            fontSize:11,
            fontWeight:800,
            textTransform:'uppercase',
            whiteSpace:'nowrap',
          }}>
            {valueOrDash(call?.status)}
          </div>
        </div>

        <div className="active-field-grid">
          <div className="active-field">
            <Mail size={14} />
            <span>{valueOrDash(lead.email)}</span>
          </div>
          <div className="active-field">
            <MapPin size={14} />
            <span>{valueOrDash(lead.address)}</span>
          </div>
          <div className="active-field">
            <MapPin size={14} />
            <span>{valueOrDash(cityLine)}</span>
          </div>
          <div className="active-field">
            <Tag size={14} />
            <span>{valueOrDash(lead.source)}</span>
          </div>
          <div className="active-field">
            <Tag size={14} />
            <span>{valueOrDash(lead.campaign)}</span>
          </div>
          <div className="active-field">
            <Clock size={14} />
            <span>{timer}</span>
          </div>
        </div>

        {lead.notes && (
          <div style={{
            padding:10,
            borderRadius:8,
            background:'rgba(255,255,255,0.04)',
            border:'1px solid rgba(255,255,255,0.08)',
            color:'rgba(226,232,240,0.82)',
            fontSize:12,
            lineHeight:1.45,
          }}>
            {lead.notes}
          </div>
        )}

        <div>
          <div className="d-label" style={{ marginBottom:8 }}>Disposition</div>
          <div className="active-disp-grid">
            {ACTIVE_CARD_DISPOSITIONS.map(({ label, value }) => (
              <button
                key={value}
                className={`active-disp-btn${selectedDisposition === value ? ' sel' : ''}`}
                onClick={() => onSelectDisposition(value)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </>
    )
  }

  return (
    <div className="d-panel active-lead-card">
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10 }}>
        <div className="d-label">Active Lead</div>
        {call?.id && <span style={{ color:'rgba(255,255,255,0.28)', fontSize:10, fontFamily:'ui-monospace, monospace' }}>{call.id.slice(0, 8)}</span>}
      </div>
      {body}
    </div>
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

  if (state === 'RESERVED' || state === 'DIALING')
    return idle('📲', '#f59e0b', 'Dialing Lead…',
      lead ? leadName(lead) : 'Connecting — your browser will ring shortly.')

  if (state === 'IN_CALL' || state === 'BRIDGED') return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', gap:18 }}>
      <div style={{ textAlign:'center', paddingTop:8 }}>
        <div className="d-label" style={{ marginBottom:4 }}>Call Duration</div>
        <div style={{ fontSize:48, fontWeight:900, color:'#06b6d4', fontVariantNumeric:'tabular-nums', letterSpacing:'0.05em', textShadow:'0 0 40px #06b6d455' }}>
          {activeCall?.bridged_at || activeCall?.answered_at ? timer : '——'}
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


type LiveTraceSnapshot = {
  ts: string
  api: string[]
  worker: string[]
  sessions: Array<Record<string, unknown>>
  calls: Array<Record<string, unknown>>
}

function AdminLiveTrace({ visible }: { visible: boolean }) {
  const [open, setOpen] = useState(false)
  const [paused, setPaused] = useState(false)
  const [tab, setTab] = useState<'api' | 'worker' | 'sessions' | 'calls'>('api')
  const [snapshot, setSnapshot] = useState<LiveTraceSnapshot | null>(null)
  const [traceError, setTraceError] = useState<string | null>(null)

  useEffect(() => {
    if (!visible || !open || paused) return

    let cancelled = false

    const load = async () => {
      try {
        const data = await apiFetch<LiveTraceSnapshot>('/admin/live-trace/snapshot')
        if (!cancelled) {
          setSnapshot(data)
          setTraceError(null)
        }
      } catch (err) {
        if (!cancelled) setTraceError(err instanceof Error ? err.message : 'Failed to load live trace')
      }
    }

    load()
    const id = setInterval(load, 2000)

    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [visible, open, paused])

  if (!visible) return null

  const lines =
    tab === 'api' ? snapshot?.api ?? [] :
    tab === 'worker' ? snapshot?.worker ?? [] :
    tab === 'sessions' ? (snapshot?.sessions ?? []).map((row) => JSON.stringify(row)) :
    (snapshot?.calls ?? []).map((row) => JSON.stringify(row))

  const copyVisible = async () => {
    await navigator.clipboard.writeText(lines.join('\n'))
  }

  return (
    <div style={{
      position: 'fixed',
      left: 18,
      right: 18,
      bottom: 14,
      zIndex: 50,
      border: '1px solid rgba(6,182,212,0.3)',
      borderRadius: 12,
      background: 'rgba(2,8,18,0.96)',
      boxShadow: '0 0 40px rgba(0,0,0,0.45)',
      overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        padding: '9px 12px',
        borderBottom: open ? '1px solid rgba(255,255,255,0.08)' : 'none',
      }}>
        <button
          onClick={() => setOpen(!open)}
          style={{
            background: 'transparent',
            border: 0,
            color: '#67e8f9',
            fontWeight: 900,
            fontSize: 12,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            cursor: 'pointer',
          }}
        >
          {open ? '▾' : '▸'} AEON Live Trace
        </button>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {snapshot?.ts && <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11 }}>{new Date(snapshot.ts).toLocaleTimeString()}</span>}
          {open && (
            <>
              <button className="d-btn" style={{ width: 'auto', padding: '5px 9px', fontSize: 11 }} onClick={() => setPaused(!paused)}>
                {paused ? 'Resume' : 'Pause'}
              </button>
              <button className="d-btn" style={{ width: 'auto', padding: '5px 9px', fontSize: 11 }} onClick={copyVisible}>
                Copy Visible
              </button>
            </>
          )}
        </div>
      </div>

      {open && (
        <div style={{ padding: 10 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            {(['api', 'worker', 'sessions', 'calls'] as const).map((key) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`d-btn ${tab === key ? 'primary' : ''}`}
                style={{ width: 'auto', padding: '6px 10px', fontSize: 11, textTransform: 'uppercase' }}
              >
                {key}
              </button>
            ))}
          </div>

          {traceError && <div className="err" style={{ marginBottom: 8 }}>⚠ {traceError}</div>}

          <pre style={{
            margin: 0,
            height: 220,
            overflow: 'auto',
            padding: 12,
            borderRadius: 8,
            background: 'rgba(0,0,0,0.55)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: '#b8f7ff',
            fontSize: 11,
            lineHeight: 1.45,
            whiteSpace: 'pre-wrap',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          }}>
            {lines.length ? lines.join('\n') : 'Waiting for live trace…'}
          </pre>
        </div>
      )}
    </div>
  )
}


// ─── Main ─────────────────────────────────────────────────────────────────────

export default function DialerPage() {
  const router = useRouter()

  const [agentState,  setAgentState]  = useState<AgentState>('OFFLINE')
  const [activeCall,  setActiveCall]  = useState<ActiveCall | null>(null)
  const [lastActiveCall, setLastActiveCall] = useState<ActiveCall | null>(null)
  const [wrapUpCall, setWrapUpCall] = useState<ActiveCall | null>(null)
  const [history,     setHistory]     = useState<HistoryCall[]>([])
  const [timer,       setTimer]       = useState('00:00')
  const [loading,     setLoading]     = useState<string | null>(null)
  const [error,       setError]       = useState<string | null>(null)
  const [agentRole,   setAgentRole]   = useState<string | null>(null)
  const [authStatus,  setAuthStatus]  = useState<'checking' | 'valid' | 'expired'>('checking')

  // Wrap-up form state
  const [disposition, setDisposition] = useState<Disposition | null>(null)
  const [notes,       setNotes]       = useState('')
  const [callbackAt,  setCallbackAt]  = useState('')
  const [wrapping,    setWrapping]    = useState(false)

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const musicStopRef = useRef<(() => void) | null>(null)
  const prevAgentStateRef = useRef<AgentState>('OFFLINE')

  const prevCallStatusRef = useRef<string | null>(null)
  const bootedRef = useRef(false)
  const lastActiveCallRef = useRef<ActiveCall | null>(null)

  const [onRtcReadyTick, setOnRtcReadyTick] = useState(0)

  // ── History
  const loadHistory = useCallback(async () => {
    try {
      const { calls } = await apiFetch<{ calls: HistoryCall[] }>('/calls/history')
      setHistory(calls.slice(0, 10))
    } catch { /* silent */ }
  }, [])

  // ── Poll session and screen-pop call state
  const poll = useCallback(async () => {
    try {
      const { agent, session } = await apiFetch<{ agent: { role: string } | null, session: { state: AgentState } | null }>('/session/me')
      const nextState = session?.state ?? 'OFFLINE'
      setAgentRole(agent?.role ?? null)
      setAgentState(nextState)

      if (ACTIVE_LEAD_POLL_STATES.has(nextState)) {
        console.log('[ACTIVE_LEAD_POLL]', { agent_state: nextState })
        const { call } = await apiFetch<{ call: ActiveCall | null }>('/calls/current')
        if (call) {
          console.log('[ACTIVE_LEAD_FOUND]', { call_id: call.id, lead_id: currentLead(call)?.id ?? null, status: call.status })
          lastActiveCallRef.current = call
          setLastActiveCall(call)
          setWrapUpCall(null)
          console.log('[WRAP_UP_CALL_SAVED]', { call_id: call.id, lead_id: currentLead(call)?.id ?? null, status: call.status })
          setActiveCall(call)
        } else {
          console.log('[ACTIVE_LEAD_NONE]', { agent_state: nextState })
          if (nextState === 'WRAP_UP') {
            const savedCall = lastActiveCallRef.current
            if (savedCall) {
              setWrapUpCall((current) => current ?? savedCall)
              console.log('[WRAP_UP_RENDER]', { call_id: savedCall.id, lead_id: currentLead(savedCall)?.id ?? null })
            }
          } else {
            setActiveCall(null)
          }
        }
      } else if (nextState !== 'WRAP_UP') {
        setActiveCall(null)
        setWrapUpCall(null)
        if (nextState === 'OFFLINE') {
          setLastActiveCall(null)
          lastActiveCallRef.current = null
        }
      }

      setError(null)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : ''
      if (e instanceof AuthExpiredError || msg.includes('401') || msg.includes('Unauthorized')) {
        stopPolling()
        setAuthStatus('expired')
        setError(SESSION_EXPIRED_MESSAGE)
      } else {
        setError(msg || 'Failed to refresh dialer state')
      }
    }
  }, [])

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  const startPolling = useCallback(() => {
    stopPolling()
    poll()
    pollRef.current = setInterval(poll, 1500)
  }, [poll])

  useEffect(() => {
    if (bootedRef.current) return
    bootedRef.current = true
    let cancelled = false

    const boot = async () => {
      console.log('[AUTH_BOOT]')
      const token = getToken()
      if (!token) {
        console.log('[AUTH_VALIDATE_FAILED]', { reason: 'missing_token_boot' })
        if (!cancelled) {
          setAuthStatus('expired')
          setError(SESSION_EXPIRED_MESSAGE)
        }
        router.replace('/login?reason=session_expired')
        return
      }

      console.log('[AUTH_TOKEN_FOUND]')
      try {
        const { agent, session } = await apiFetch<{ agent: { role: string } | null, session: { state: AgentState } | null }>('/session/me')
        if (cancelled) return

        console.log('[AUTH_VALIDATE_SUCCESS]', { state: session?.state ?? null })
        setAgentRole(agent?.role ?? null)
        setAgentState(session?.state ?? 'OFFLINE')
        setAuthStatus('valid')
        setError(null)
        await loadHistory()
        if (!cancelled) startPolling()
      } catch (e: unknown) {
        if (cancelled) return
        console.log('[AUTH_VALIDATE_FAILED]', { reason: e instanceof Error ? e.message : 'unknown' })
        setAuthStatus('expired')
        setError(SESSION_EXPIRED_MESSAGE)
      }
    }

    boot()

    return () => {
      cancelled = true
    }
  }, [loadHistory, router, startPolling])

  const onRtcReady = useCallback(() => {
    setOnRtcReadyTick((n) => n + 1)
  }, [])

  const { rtcError, activeRtcCall, connectRtc } = useTelnyxWebRTC(onRtcReady)
  const hasActiveRtcCall = Boolean(activeRtcCall)
  const renderCall = agentState === 'WRAP_UP'
    ? (wrapUpCall ?? activeCall ?? lastActiveCall)
    : activeCall
  const dispositionCallId = (activeCall ?? wrapUpCall ?? lastActiveCall)?.id ?? null
  const currentCallStatus = renderCall?.status ?? null
  const currentLeadRecord = currentLead(renderCall)
  const activeTimerStart = renderCall?.bridged_at ?? renderCall?.answered_at ?? null
  const hasAnsweredOrBridgedCall =
    Boolean(activeCall?.answered_at) ||
    Boolean(activeCall?.bridged_at) ||
    currentCallStatus === 'bridged' ||
    agentState === 'IN_CALL' ||
    agentState === 'BRIDGED'

  // Hold audio is only for the hunting/waiting surface, never for a live RTC call.
  const shouldPlayMusic =
    (agentState === 'READY' || agentState === 'RESERVED') &&
    !hasActiveRtcCall &&
    !hasAnsweredOrBridgedCall

  useEffect(() => {
    if (!rtcError) return
    setAgentState('ERROR')
    setLoading(null)
    setError(rtcError)
  }, [rtcError])

  useEffect(() => {
    if (agentState !== 'WRAP_UP') return
    const savedCall = wrapUpCall ?? activeCall ?? lastActiveCall
    if (!savedCall) {
      console.log('[WRAP_UP_RENDER]', { call_id: null, lead_id: null })
      return
    }

    if (!wrapUpCall) setWrapUpCall(savedCall)
    console.log('[WRAP_UP_RENDER]', { call_id: savedCall.id, lead_id: currentLead(savedCall)?.id ?? null })
  }, [activeCall, agentState, lastActiveCall, wrapUpCall])

  useEffect(() => {
    if (onRtcReadyTick === 0) return
    ;(async () => {
      try {
        await apiFetch('/session/register', { method: 'POST' })
        setAgentState('REGISTERED')
        setError(null)
        startPolling()
      } catch (e: unknown) {
        if (e instanceof AuthExpiredError) {
          setAuthStatus('expired')
          setError(SESSION_EXPIRED_MESSAGE)
        } else {
          setAgentState('ERROR')
          setError(e instanceof Error ? e.message : 'Failed to register SIP session')
        }
      } finally {
        setLoading(null)
      }
    })()
  }, [onRtcReadyTick, startPolling])

  useEffect(() => () => stopPolling(), [])

  // ── Unified music control
  useEffect(() => {
    if (shouldPlayMusic && !musicStopRef.current) {
      musicStopRef.current = playDialerMusic()
    } else if (!shouldPlayMusic && musicStopRef.current) {
      musicStopRef.current()
      musicStopRef.current = null
    }
  }, [shouldPlayMusic])

  useEffect(() => {
    if (hasActiveRtcCall) {
      stopAllDialerAudio('LOCAL_RTC_ACTIVE_CALL')
      if (musicStopRef.current) {
        musicStopRef.current()
        musicStopRef.current = null
      }
      return
    }

    if (agentState === 'IN_CALL' || agentState === 'BRIDGED' || currentCallStatus === 'bridged') {
      stopAllDialerAudio(agentState === 'IN_CALL' ? 'BACKEND_IN_CALL' : 'BACKEND_BRIDGED')
      if (musicStopRef.current) {
        musicStopRef.current()
        musicStopRef.current = null
      }
      return
    }

    clearDialerAudioActiveCallBlock('NO_ACTIVE_CALL')
  }, [agentState, currentCallStatus, hasActiveRtcCall])

  // ── Audio state machine hooks
  useEffect(() => {
    const prevAgentState = prevAgentStateRef.current
    const prevCallStatus = prevCallStatusRef.current

    // NEW LEAD LEG DIALED: single dial tick
    if (
      currentCallStatus === 'lead_dialing' &&
      prevCallStatus !== 'lead_dialing' &&
      !hasActiveRtcCall &&
      !hasAnsweredOrBridgedCall
    ) {
      playDialTone()
    }

    // AGENT STATE -> IN_CALL (bridged): play connected chime
    if ((agentState === 'IN_CALL' || agentState === 'BRIDGED' || currentCallStatus === 'bridged') &&
        (prevAgentState !== 'IN_CALL' && prevAgentState !== 'BRIDGED' && prevCallStatus !== 'bridged')) {
      stopAllDialerAudio(agentState === 'IN_CALL' ? 'BACKEND_IN_CALL' : 'BACKEND_BRIDGED')
      if (!hasActiveRtcCall) playConnected()
    }

    // BRIDGED -> WRAP_UP or READY: hangup tone
    const bridgedToWrapOrReady =
      (prevAgentState === 'IN_CALL' || prevAgentState === 'BRIDGED' || prevCallStatus === 'bridged') &&
      (agentState === 'WRAP_UP' || agentState === 'READY')

    if (bridgedToWrapOrReady) {
      playHangup()
    }

    prevAgentStateRef.current = agentState
    prevCallStatusRef.current = currentCallStatus
  }, [agentState, currentCallStatus, hasActiveRtcCall, hasAnsweredOrBridgedCall])

  useEffect(() => {
    console.log('[ACTIVE_LEAD_RENDER]', {
      agent_state: agentState,
      call_id: renderCall?.id ?? null,
      lead_id: currentLeadRecord?.id ?? null,
    })
  }, [agentState, renderCall?.id, currentLeadRecord?.id])

  useEffect(() => {
    return () => {
      if (musicStopRef.current) {
        musicStopRef.current()
        musicStopRef.current = null
      }
      stopAllDialerAudio('DIALER_UNMOUNT')
      stopDialerMusicImmediate()
    }
  }, [])

  // ── Call timer
  useEffect(() => {
    if (!activeTimerStart) {
      setTimer('00:00')
      return
    }
    setTimer(elapsed(activeTimerStart))
    const id = setInterval(() => setTimer(elapsed(activeTimerStart)), 500)
    return () => clearInterval(id)
  }, [activeTimerStart])

  // ── Reset wrap-up form on new call
  useEffect(() => {
    if (agentState === 'RESERVED' || agentState === 'DIALING' || agentState === 'IN_CALL' || agentState === 'BRIDGED') {
      setDisposition(null); setNotes(''); setCallbackAt('')
    }
  }, [agentState])

  // ── Actions
  async function arm() {
    setLoading('arm'); setError(null)
    try {
      setAgentState('REGISTERING')
      const creds = await apiFetch<{ sip_username: string; sip_password: string }>('/session/webrtc-token')
      await connectRtc(creds.sip_username, creds.sip_password)
    } catch (e: unknown) {
      if (e instanceof AuthExpiredError) {
        setAuthStatus('expired')
        setError(SESSION_EXPIRED_MESSAGE)
      } else {
        setAgentState('ERROR')
        setError(e instanceof Error ? e.message : 'Failed')
      }
      setLoading(null)
    }
  }

  async function goReady() {
    setLoading('ready'); setError(null)
    try {
      await apiFetch('/session/ready', { method: 'POST' })
      setAgentState('READY')
    } catch (e: unknown) {
      if (e instanceof AuthExpiredError) {
        setAuthStatus('expired')
        setError(SESSION_EXPIRED_MESSAGE)
      } else {
        setError(e instanceof Error ? e.message : 'Failed')
      }
    }
    finally { setLoading(null) }
  }

  async function pause() {
    setLoading('pause')
    try {
      await apiFetch('/session/pause', { method: 'POST' })
      setAgentState('PAUSED')
    } catch (e: unknown) {
      if (e instanceof AuthExpiredError) {
        setAuthStatus('expired')
        setError(SESSION_EXPIRED_MESSAGE)
      } else {
        setError(e instanceof Error ? e.message : 'Failed')
      }
    }
    finally { setLoading(null) }
  }

  async function hangup() {
    if (!activeCall) return
    setLoading('hangup')
    try { await apiFetch(`/calls/${activeCall.id}/hangup`, { method: 'POST' }) }
    catch (e: unknown) {
      if (e instanceof AuthExpiredError) {
        setAuthStatus('expired')
        setError(SESSION_EXPIRED_MESSAGE)
      } else {
        setError(e instanceof Error ? e.message : 'Failed')
      }
    }
    finally { setLoading(null) }
  }

  async function submitWrapUp() {
    const callId = dispositionCallId
    console.log('[DISPOSITION_SUBMIT_ATTEMPT]', { call_id: callId, disposition })
    if (!callId) {
      setError('No call is available to disposition.')
      return
    }
    if (!disposition) {
      setError('Select a disposition before submitting.')
      return
    }
    setWrapping(true); setError(null)
    try {
      await apiFetch(`/calls/${callId}/wrapup`, {
        method: 'POST',
        body: JSON.stringify({
          disposition,
          notes: notes || undefined,
          callback_at: callbackAt || undefined,
        }),
      })
      console.log('[DISPOSITION_SUBMIT_SUCCESS]', { call_id: callId, disposition })
      setActiveCall(null); setDisposition(null); setNotes(''); setCallbackAt('')
      setLastActiveCall(null); setWrapUpCall(null); lastActiveCallRef.current = null
      await loadHistory()
    } catch (e: unknown) {
      console.log('[DISPOSITION_SUBMIT_ERROR]', {
        call_id: callId,
        disposition,
        error: e instanceof Error ? e.message : 'Failed',
      })
      if (e instanceof AuthExpiredError) {
        setAuthStatus('expired')
        setError(SESSION_EXPIRED_MESSAGE)
      } else {
        setError(e instanceof Error ? e.message : 'Failed')
      }
    }
    finally { setWrapping(false) }
  }

  function logInAgain() {
    router.replace('/login?reason=session_expired')
  }

  function clearSessionAndRetry() {
    console.log('[AUTH_RECOVERY_CLEAR_SESSION]')
    clearAuth()
    router.replace('/login?reason=session_expired')
  }

  function clearWrapUp() {
    setActiveCall(null)
    setLastActiveCall(null)
    setWrapUpCall(null)
    lastActiveCallRef.current = null
    setDisposition(null)
    setNotes('')
    setCallbackAt('')
  }

  const lead = currentLead(renderCall)

  // ── Computed stats
  const durations = history.filter(c => c.duration_seconds).map(c => c.duration_seconds!)
  const avgDuration = durations.length
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : null

  if (authStatus === 'checking') {
    return (
      <div style={{
        minHeight: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#020810',
        color: 'rgba(226,232,240,0.72)',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontSize: 13,
      }}>
        Checking session…
      </div>
    )
  }

  if (authStatus === 'expired') {
    return (
      <div style={{
        minHeight: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#020810',
        color: '#e2e8f0',
        padding: 24,
      }}>
        <div style={{
          width: '100%',
          maxWidth: 420,
          padding: 24,
          borderRadius: 10,
          border: '1px solid rgba(239,68,68,0.3)',
          background: 'rgba(5,10,20,0.82)',
          boxShadow: '0 24px 60px rgba(0,0,0,0.42)',
        }}>
          <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 8 }}>Session expired</div>
          <div style={{ fontSize: 13, color: 'rgba(226,232,240,0.68)', marginBottom: 18 }}>
            {error ?? SESSION_EXPIRED_MESSAGE}
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            <button
              type="button"
              onClick={logInAgain}
              style={{
                padding: '12px 16px',
                borderRadius: 8,
                border: '1px solid #06b6d4',
                background: '#06b6d4',
                color: '#020a10',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              Log in again
            </button>
            <button
              type="button"
              onClick={clearSessionAndRetry}
              style={{
                padding: '12px 16px',
                borderRadius: 8,
                border: '1px solid rgba(239,68,68,0.45)',
                background: 'rgba(239,68,68,0.14)',
                color: '#fca5a5',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              Clear session and retry
            </button>
          </div>
        </div>
      </div>
    )
  }

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
        .active-lead-card { gap: 12px; }
        .active-empty {
          min-height: 86px; display: flex; align-items: center; justify-content: center;
          border: 1px dashed rgba(255,255,255,0.12); border-radius: 8px;
          color: rgba(255,255,255,0.38); font-size: 13px; font-weight: 700;
          text-align: center; padding: 12px;
        }
        .active-empty.amber { color: #fcd34d; border-color: rgba(245,158,11,0.28); background: rgba(245,158,11,0.06); }
        .active-field-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 10px; }
        .active-field {
          min-width: 0; display: flex; align-items: center; gap: 7px;
          color: rgba(226,232,240,0.74); font-size: 12px; line-height: 1.3;
        }
        .active-field svg { flex: 0 0 auto; color: rgba(103,232,249,0.72); }
        .active-field span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .active-disp-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
        .active-disp-btn {
          min-height: 34px; padding: 7px 8px; border-radius: 7px;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.035); color: rgba(255,255,255,0.66);
          font-size: 11px; font-weight: 800; cursor: pointer; font-family: inherit;
        }
        .active-disp-btn:hover { background: rgba(255,255,255,0.08); }
        .active-disp-btn.sel { border-color: rgba(6,182,212,0.58); color: #67e8f9; background: rgba(6,182,212,0.12); }
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
                    {agentState==='IN_CALL' || agentState==='BRIDGED' ? timer : '——'}
                  </div>
                </div>
              </div>
              {agentState !== 'OFFLINE' && agentState !== 'REGISTERING' && (
                <>
                  <div className="d-divider" />
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    {(agentState==='IN_CALL' || agentState==='BRIDGED') && (
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

          {/* CENTER — active lead + main stage */}
          <div style={{ minHeight:0, display:'flex', flexDirection:'column', gap:14 }}>
            <ActiveLeadCard
              state={agentState}
              call={renderCall}
              timer={timer}
              selectedDisposition={disposition}
              onSelectDisposition={setDisposition}
            />

            <div className="d-panel" style={{ overflow:'auto', flex:1, minHeight:0 }}>
              {agentState !== 'WRAP_UP' ? (
                <CenterStage
                  state={agentState} lead={lead} timer={timer} activeCall={renderCall}
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
                    disabled={!dispositionCallId || wrapping}
                    style={{ padding:13, fontSize:14, fontWeight:800 }}>
                    {wrapping ? 'Submitting…' : disposition ? `✓ Submit: ${disposition}` : 'Select a disposition'}
                  </button>
                  <button className="d-btn" onClick={clearWrapUp} disabled={wrapping} style={{ padding:12, fontSize:13, fontWeight:700 }}>
                    New Call / Clear Wrap Up
                  </button>
                </div>
              )}
            </div>
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

      <AdminLiveTrace visible={agentRole === 'admin'} />
    </>
  )
}
