// lib/api.ts
import { apiFetch } from './auth'

export { apiFetch }

export interface LoginResponse {
  token: string
  agent: {
    id: string; name: string; email: string; username: string
    role: string; telnyx_sip_username: string | null; telnyx_sip_password: string | null
  }
}

export const login = (username: string, password: string) =>
  apiFetch<LoginResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) })

export type AgentState = 'OFFLINE'|'REGISTERING'|'REGISTERED'|'READY'|'RESERVED'|'DIALING'|'IN_CALL'|'BRIDGED'|'WRAP_UP'|'PAUSED'|'ERROR'
export type Disposition = 'Interested'|'Not Interested'|'Callback'|'Do Not Call'|'No Answer'|'Voicemail'|'Wrong Number'|'Other'

export interface Lead {
  id: string; first_name: string|null; last_name: string|null; email: string|null
  phone: string; quality?: string|null; address: string|null; city: string|null; state: string|null
  zipcode: string|null; source: string|null; campaign: string|null; notes: string|null
  metadata: Record<string, unknown>|null
}

export interface ActiveCall {
  id: string; status: string; group_id: string|null; agent_leg_id: string|null; lead_leg_id: string|null
  disposition?: Disposition|null; notes?: string|null
  started_at: string; answered_at: string|null; bridged_at: string|null; lead: Lead|null; leads?: Lead|null
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
