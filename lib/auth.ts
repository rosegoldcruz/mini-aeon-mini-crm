export const TOKEN_KEY  = 'aeon_token'
export const AGENT_KEY  = 'aeon_agent'
export const API_BASE   = process.env.NEXT_PUBLIC_API_URL ?? 'https://api.aeondial.com'

export interface StoredAgent {
  id: string
  name: string
  email: string
  username?: string
  role: string
  telnyx_sip_username: string | null
  telnyx_sip_password: string | null
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(TOKEN_KEY)
}

export function getAgent(): StoredAgent | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(AGENT_KEY)
    return raw ? (JSON.parse(raw) as StoredAgent) : null
  } catch {
    return null
  }
}

export function setAuth(token: string, agent: StoredAgent): void {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(AGENT_KEY, JSON.stringify(agent))
}

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(AGENT_KEY)
}

export function isAuthenticated(): boolean {
  return Boolean(getToken())
}

export async function apiFetch<T = unknown>(
  path: string,
  opts?: RequestInit,
): Promise<T> {
  const token = getToken()
  const headers = new Headers(opts?.headers)
  if (opts?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}
