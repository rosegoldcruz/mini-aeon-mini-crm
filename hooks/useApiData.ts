'use client'

import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/auth'

export function useApiData<T>(
  path: string,
  fallback: T,
): { data: T; loading: boolean; error: string | null; reload: () => void } {
  const [data,    setData]    = useState<T>(fallback)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [tick,    setTick]    = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    apiFetch<T>(path)
      .then((res) => { if (!cancelled) { setData(res); setError(null) } })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [path, tick])

  return { data, loading, error, reload: () => setTick((t) => t + 1) }
}
