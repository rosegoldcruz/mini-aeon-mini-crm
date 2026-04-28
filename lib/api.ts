// lib/api.ts
import { TOKEN_KEY } from './auth'

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'https://api.aeondial.com'

export async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = typeof window === 'undefined' ? null : localStorage.getItem(TOKEN_KEY)
  const headers = new Headers(opts?.headers)
  if (opts?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

export interface LoginResponse {
  token: string
  agent: {
    id: string; name: string; email: string; username: string
    role: string; telnyx_sip_username: string | null; telnyx_sip_password: string | null
  }
}

export const login = (username: string, password: string) =>
  apiFetch<LoginResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) })

export type AgentState = 'OFFLINE'|'REGISTERING'|'REGISTERED'|'READY'|'RESERVED'|'IN_CALL'|'WRAP_UP'|'PAUSED'|'ERROR'
export type Disposition = 'Interested'|'Not Interested'|'Callback'|'Do Not Call'|'No Answer'|'Voicemail'|'Wrong Number'|'Other'

export interface Lead {
  id: string; first_name: string|null; last_name: string|null; email: string|null
  phone: string; quality: string|null; city: string|null; state: string|null
}

export interface ActiveCall {
  id: string; status: string; disposition: Disposition|null; notes: string|null
  started_at: string; answered_at: string|null; leads: Lead|null
}

export interface HistoryCall {
  id: string; status: string; disposition: Disposition|null
  started_at: string; ended_at: string|null; duration_seconds: number|null
  leads: { first_name: string|null; last_name: string|null; phone: string; city: string|null; state: string|null } | null
}

// Backend exposes GET /session/me which returns { agent, session: { state, ... } }.
// We normalize that here so the dialer page can stay simple.
export const getSession = async (): Promise<{ state: AgentState }> => {
  const res = await apiFetch<{ session: { state: AgentState } | null }>('/session/me')
  return { state: (res.session?.state ?? 'OFFLINE') as AgentState }
}

export const sessionRegister = () => apiFetch<{ state: AgentState }>('/session/register', { method: 'POST' })
export const sessionReady    = () => apiFetch<{ state: AgentState }>('/session/ready',    { method: 'POST' })
export const sessionPause    = () => apiFetch<{ state: AgentState }>('/session/pause',    { method: 'POST' })
export const getCurrentCall  = () => apiFetch<{ call: ActiveCall|null }>('/calls/current')
export const getCallHistory  = () => apiFetch<{ calls: HistoryCall[] }>('/calls/history')
export const hangupCall      = (id: string) => apiFetch<{ success: boolean }>(`/calls/${id}/hangup`, { method: 'POST' })
export const wrapUpCall      = (id: string, body: { disposition: Disposition; notes?: string; callback_at?: string }) =>
  apiFetch<{ success: boolean; state: AgentState }>(`/calls/${id}/wrapup`, { method: 'POST', body: JSON.stringify(body) })
