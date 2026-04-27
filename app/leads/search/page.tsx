'use client'

import { useState } from 'react'
import { apiFetch } from '@/lib/auth'
import { PageIntro, Panel, SimpleTable } from '@/components/crm/primitives'

interface Lead {
  id: string
  first_name: string | null
  last_name: string | null
  phone: string
  email?: string | null
  city?: string | null
  state?: string | null
  quality?: string | null
  status?: string | null
  list_name?: string | null
  last_voicemail_at?: string | null
}

interface SearchResponse {
  leads: Lead[]
  total: number
}

function leadName(l: Lead) {
  return [l.first_name, l.last_name].filter(Boolean).join(' ') || '—'
}

function fmtPhone(raw: string) {
  const d = raw.replace(/\D/g, '')
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`
  return raw
}

export default function SearchLeadsPage() {
  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState<Lead[]>([])
  const [total,   setTotal]   = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [searched, setSearched] = useState(false)

  async function search() {
    if (!query.trim()) return
    setLoading(true)
    setError(null)
    setSearched(true)
    try {
      const params = new URLSearchParams({ q: query.trim(), limit: '50' })
      const data = await apiFetch<SearchResponse>(`/leads/search?${params}`)
      setResults(data.leads)
      setTotal(data.total)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Search failed')
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter') search()
  }

  return (
    <div className="page-stack">
      <PageIntro
        eyebrow="Leads"
        title="Search Leads"
        description="Search the full lead pool by name, phone, email, city, or list."
      />

      <Panel title="Search" subtitle={total != null ? `${total} results` : 'Enter a query'}>
        <div className="search-demo-row">
          <input
            className="aeon-input"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKey}
            placeholder="Name, phone, email, city, list…"
            autoFocus
          />
          <button className="aeon-button" onClick={search} disabled={loading}>
            {loading ? 'Searching…' : 'Search'}
          </button>
        </div>

        {error && (
          <div style={{ color: '#fca5a5', fontSize: 13, marginTop: 12 }}>⚠ {error}</div>
        )}

        {searched && !loading && results.length === 0 && !error && (
          <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, marginTop: 12 }}>
            No results for "{query}"
          </div>
        )}

        {results.length > 0 && (
          <SimpleTable
            columns={['Name', 'Phone', 'Email', 'Location', 'List', 'Quality', 'Status']}
            rows={results.map(l => [
              leadName(l),
              fmtPhone(l.phone),
              l.email ?? '—',
              [l.city, l.state].filter(Boolean).join(', ') || '—',
              l.list_name ?? '—',
              l.quality ?? '—',
              l.status ?? '—',
            ])}
          />
        )}
      </Panel>
    </div>
  )
}
