export const TOKEN_KEY  = 'aeon_token'
export const AGENT_KEY  = 'aeon_agent'
export const API_BASE   = process.env.NEXT_PUBLIC_API_URL ?? 'https://api.aeondial.com'
export const SESSION_EXPIRED_MESSAGE = 'Session expired. Please log in again.'

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
  if (typeof window === 'undefined') return
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(AGENT_KEY)
}

export function isAuthenticated(): boolean {
  return Boolean(getToken())
}

export class AuthExpiredError extends Error {
  constructor() {
    super(SESSION_EXPIRED_MESSAGE)
    this.name = 'AuthExpiredError'
  }
}

function redirectToExpiredLogin() {
  if (typeof window === 'undefined') return
  if (window.location.pathname === '/login') return
  console.log('[AUTH_EXPIRED_REDIRECT]')
  window.location.assign('/login?reason=session_expired')
}

async function validateTokenStillWorks(token: string): Promise<boolean> {
  const res = await fetch(`${API_BASE}/session/me`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.ok
}

async function expireAuth(): Promise<never> {
  clearAuth()
  redirectToExpiredLogin()
  throw new AuthExpiredError()
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
  const request = () => fetch(`${API_BASE}${path}`, {
    ...opts,
    headers,
  })

  let res = await request()

  if ((res.status === 401 || res.status === 403) && path !== '/auth/login') {
    if (!token) {
      console.log('[AUTH_VALIDATE_FAILED]', { reason: 'missing_token', path, status: res.status })
      return expireAuth()
    }

    if (path !== '/session/me') {
      const valid = await validateTokenStillWorks(token).catch(() => false)
      if (valid) {
        res = await request()
        if (res.ok) return res.json() as Promise<T>
      }
    }

    console.log('[AUTH_VALIDATE_FAILED]', { reason: 'api_rejected_token', path, status: res.status })
    return expireAuth()
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}
