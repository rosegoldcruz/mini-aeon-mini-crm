'use client'

import { useApiData } from '@/hooks/useApiData'
import { Badge, PageIntro, Panel, SimpleTable, SplitGrid, StatCard, StatGrid } from '@/components/crm/primitives'

interface LeadList {
  id: string
  name: string
  record_count?: number
  total_records?: number
  imported_at?: string
  created_at?: string
  source?: string
  status?: string
  campaign_name?: string | null
}

interface ListsResponse {
  lists: LeadList[]
}

function fmtDate(iso?: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function ListsPage() {
  const { data, loading, error } = useApiData<ListsResponse>('/lists', { lists: [] })
  const lists = data.lists

  const totalRecords = lists.reduce((s, l) => s + (l.record_count ?? l.total_records ?? 0), 0)
  const healthy      = lists.filter(l => l.status === 'active' || l.status === 'healthy' || !l.status).length

  return (
    <div className="page-stack">
      <PageIntro
        eyebrow="Lists"
        title="Lead Lists"
        description="All imported lead lists from the AEON Dial backend."
        aside={<Badge tone={loading ? 'gold' : error ? 'red' : 'cyan'}>
          {loading ? 'Loading…' : error ? 'Error' : `${lists.length} lists`}
        </Badge>}
      />

      <StatGrid>
        <StatCard label="Total Lists"    value={String(lists.length)} delta="In system" />
        <StatCard label="Total Records"  value={totalRecords.toLocaleString()} delta="Across all lists" />
        <StatCard label="Healthy"        value={String(healthy)} delta="Ready to dial" tone="green" />
        <StatCard label="Under Review"   value={String(lists.length - healthy)} delta="Need attention" tone="gold" />
      </StatGrid>

      <SplitGrid>
        <Panel title="List Register" subtitle="Live data">
          {error ? (
            <div style={{ color: '#fca5a5', fontSize: 13 }}>⚠ {error}</div>
          ) : loading ? (
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Loading lists…</div>
          ) : (
            <SimpleTable
              columns={['List Name', 'Records', 'Last Import', 'Source', 'Campaign', 'Status']}
              rows={lists.map(l => [
                l.name,
                (l.record_count ?? l.total_records ?? 0).toLocaleString(),
                fmtDate(l.imported_at ?? l.created_at),
                l.source ?? '—',
                l.campaign_name ?? '—',
                <Badge
                  key={`${l.id}-status`}
                  tone={
                    l.status === 'review' ? 'gold'
                    : l.status === 'archived' ? 'cyan'
                    : 'green'
                  }
                >
                  {l.status ?? 'Healthy'}
                </Badge>,
              ])}
            />
          )}
        </Panel>

        <Panel title="List Notes" subtitle="Context">
          <ul className="bullet-list">
            <li>Records count shows total leads in the list, not remaining dials.</li>
            <li>Lists under review have duplicate or DNC flag concerns.</li>
            <li>A list assigned to a campaign cannot be deleted while that campaign is active.</li>
          </ul>
        </Panel>
      </SplitGrid>
    </div>
  )
}
