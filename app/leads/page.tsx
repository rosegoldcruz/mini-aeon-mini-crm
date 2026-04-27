'use client'

import { useRef, useState } from 'react'
import { useApiData } from '@/hooks/useApiData'
import { Badge, PageIntro, Panel, SimpleTable, SplitGrid, StatCard, StatGrid } from '@/components/crm/primitives'
import { apiFetch } from '@/lib/auth'

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
  campaigns?: { name?: string | null } | null
  owner_name?: string | null
  created_at?: string
}

interface LeadsResponse {
  leads: Lead[]
  total?: number
  filtered_total?: number
  page?: number
  limit?: number
  stats?: {
    total: number
    hot: number
    callbacks: number
  }
}

function leadName(l: Lead) {
  return [l.first_name, l.last_name].filter(Boolean).join(' ') || '—'
}

function fmtPhone(raw: string) {
  const d = raw.replace(/\D/g, '')
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`
  return raw
}

export default function LeadsPage() {
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(100)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const params = new URLSearchParams({
    page: String(page),
    limit: String(pageSize),
  })
  if (query) params.set('q', query)
  const { data, loading, error, reload } = useApiData<LeadsResponse>(`/leads?${params}`, { leads: [] })

  const leads = data.leads
  const total = data.stats?.total ?? data.total ?? 0
  const filteredTotal = data.filtered_total ?? data.total ?? leads.length
  const pageCount = Math.max(1, Math.ceil(filteredTotal / pageSize))
  const pageStart = filteredTotal === 0 ? 0 : (page - 1) * pageSize + 1
  const pageEnd = Math.min(page * pageSize, filteredTotal)
  const qualified = data.stats?.hot ?? 0
  const callbacks = data.stats?.callbacks ?? 0

  function applySearch() {
    setPage(1)
    setQuery(search.trim())
  }

  async function uploadCsv(file: File) {
    setUploading(true)
    setUploadResult(null)
    setUploadError(null)
    try {
      const csvText = await file.text()
      const result = await apiFetch<{ inserted: number; skipped: number; total: number }>('/leads/import', {
        method: 'POST',
        headers: { 'Content-Type': 'text/csv' },
        body: csvText,
      })
      setUploadResult(`Imported ${result.inserted.toLocaleString()} of ${result.total.toLocaleString()} rows${result.skipped ? ` · skipped ${result.skipped.toLocaleString()}` : ''}`)
      setPage(1)
      reload()
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="page-stack">
      <PageIntro
        eyebrow="Leads"
        title="All Leads"
        description="Live lead pool from the AEON Dial backend."
        aside={<div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void uploadCsv(file)
            }}
          />
          <button
            className="aeon-btn"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            style={{ minWidth: 120 }}
          >
            {uploading ? 'Uploading…' : '+ Upload CSV'}
          </button>
          <Badge tone={loading || uploading ? 'gold' : error ? 'cyan' : 'cyan'}>
            {loading ? 'Loading…' : error ? 'Error' : `${total.toLocaleString()} leads`}
          </Badge>
        </div>}
      />

      <StatGrid>
        <StatCard label="Lead Pool"   value={total.toLocaleString()} delta="Across all lists" />
        <StatCard label="Hot/Qual'd"  value={qualified.toLocaleString()} delta="Priority leads"  tone="green" />
        <StatCard label="Callbacks"   value={callbacks.toLocaleString()} delta="Need follow-up"  tone="gold" />
        <StatCard label="Showing"     value={`${pageStart.toLocaleString()}-${pageEnd.toLocaleString()}`} delta={query ? `${filteredTotal.toLocaleString()} matched` : `Page ${page} of ${pageCount}`} />
      </StatGrid>

      <SplitGrid>
        <Panel title="Lead Register" subtitle="Live data">
          {uploadResult ? (
            <div style={{ color: '#86efac', fontSize: 13, marginBottom: 12 }}>✓ {uploadResult}</div>
          ) : null}
          {uploadError ? (
            <div style={{ color: '#fca5a5', fontSize: 13, marginBottom: 12 }}>⚠ {uploadError}</div>
          ) : null}
          <form
            style={{ marginBottom: 12, display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8, alignItems: 'center' }}
            onSubmit={(e) => {
              e.preventDefault()
              applySearch()
            }}
          >
            <input
              className="aeon-input"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search name, phone, city, list…"
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
            <button className="aeon-btn" type="submit">Search</button>
            <button
              className="aeon-btn"
              type="button"
              disabled={!query && !search}
              onClick={() => {
                setSearch('')
                setQuery('')
                setPage(1)
              }}
            >
              Clear
            </button>
          </form>
          {error ? (
            <div style={{ color: '#fca5a5', fontSize: 13 }}>⚠ {error}</div>
          ) : loading ? (
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Loading leads…</div>
          ) : (
            <>
              <SimpleTable
                columns={['Lead', 'Phone', 'Location', 'Quality', 'List', 'Status']}
                rows={leads.length ? leads.map(l => [
                  leadName(l),
                  fmtPhone(l.phone),
                  [l.city, l.state].filter(Boolean).join(', ') || '—',
                  l.quality
                    ? <Badge key={`${l.id}-q`} tone={l.quality==='hot' ? 'red' : l.quality==='warm' ? 'gold' : 'cyan'}>{l.quality}</Badge>
                    : '—',
                  l.list_name ?? l.campaigns?.name ?? '—',
                  l.status ?? '—',
                ]) : [['No leads found', '—', '—', '—', '—', '—']]}
              />
              <div className="pager-bar">
                <div className="pager-summary">
                  Showing {pageStart.toLocaleString()}-{pageEnd.toLocaleString()} of {filteredTotal.toLocaleString()}
                </div>
                <div className="pager-controls">
                  <label>
                    Rows
                    <select
                      className="aeon-select"
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value))
                        setPage(1)
                      }}
                    >
                      {[20, 50, 100, 500].map((size) => <option key={size} value={size}>{size}</option>)}
                    </select>
                  </label>
                  <button className="aeon-btn icon-btn" disabled={page <= 1} onClick={() => setPage(1)}>«</button>
                  <button className="aeon-btn icon-btn" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>‹</button>
                  <span>Page {page.toLocaleString()} / {pageCount.toLocaleString()}</span>
                  <button className="aeon-btn icon-btn" disabled={page >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>›</button>
                  <button className="aeon-btn icon-btn" disabled={page >= pageCount} onClick={() => setPage(pageCount)}>»</button>
                </div>
              </div>
            </>
          )}
        </Panel>

        <Panel title="Lead Notes" subtitle="Context">
          <ul className="bullet-list">
            <li>Hot/Warm quality scores are set during import or dialer disposition.</li>
            <li>Callback leads were marked during wrap-up and have a scheduled time.</li>
            <li>Search and pagination run against the full database.</li>
          </ul>
        </Panel>
      </SplitGrid>
    </div>
  )
}
