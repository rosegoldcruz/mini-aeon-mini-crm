'use client'

import { useApiData } from '@/hooks/useApiData'
import { Badge, PageIntro, Panel, SimpleTable, SplitGrid, StatCard, StatGrid } from '@/components/crm/primitives'

interface Campaign {
  id: string
  name: string
  type?: string
  status: string
  list_name?: string | null
  agent_count?: number
  connect_rate?: number
  calls_today?: number
  leads_remaining?: number
}

interface CampaignsResponse {
  campaigns: Campaign[]
}

function fmtRate(r?: number) {
  if (r == null) return '—'
  return r.toFixed(1) + '%'
}

export default function CampaignsPage() {
  const { data, loading, error } = useApiData<CampaignsResponse>('/campaigns', { campaigns: [] })
  const campaigns = data.campaigns

  const live   = campaigns.filter(c => c.status === 'active' || c.status === 'live').length
  const paused = campaigns.filter(c => c.status === 'paused').length
  const avgRate = campaigns.length
    ? (campaigns.reduce((s, c) => s + (c.connect_rate ?? 0), 0) / campaigns.length).toFixed(1) + '%'
    : '—'
  const totalAgents = campaigns.reduce((s, c) => s + (c.agent_count ?? 0), 0)

  return (
    <div className="page-stack">
      <PageIntro
        eyebrow="Campaigns"
        title="All Campaigns"
        description="Live campaign roster from the AEON Dial backend."
        aside={<Badge tone={loading ? 'gold' : error ? 'cyan' : 'green'}>
          {loading ? 'Loading…' : error ? 'Error' : 'Live'}
        </Badge>}
      />

      <StatGrid>
        <StatCard label="Live"           value={String(live)}        delta="Running now"         tone="green" />
        <StatCard label="Paused"         value={String(paused)}      delta="Awaiting activation" tone="gold" />
        <StatCard label="Avg Connect"    value={avgRate}             delta="Across campaigns" />
        <StatCard label="Active Agents"  value={String(totalAgents)} delta="Cross-campaign total" />
      </StatGrid>

      <SplitGrid>
        <Panel title="Campaign Register" subtitle="Live data">
          {error ? (
            <div style={{ color: '#fca5a5', fontSize: 13 }}>⚠ {error}</div>
          ) : loading ? (
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Loading campaigns…</div>
          ) : (
            <SimpleTable
              columns={['Campaign', 'Type', 'Status', 'List', 'Agents', 'Connect %', 'Calls Today']}
              rows={campaigns.map(c => [
                c.name,
                c.type ?? '—',
                <Badge
                  key={`${c.id}-status`}
                  tone={
                    c.status === 'active' || c.status === 'live' ? 'green'
                    : c.status === 'paused' ? 'gold'
                    : 'cyan'
                  }
                >
                  {c.status}
                </Badge>,
                c.list_name ?? '—',
                String(c.agent_count ?? 0),
                fmtRate(c.connect_rate),
                String(c.calls_today ?? 0),
              ])}
            />
          )}
        </Panel>

        <Panel title="Campaign Notes" subtitle="Context">
          <ul className="bullet-list">
            <li>Active campaigns are accepting agent sessions and placing calls.</li>
            <li>Connect rate is calls answered ÷ total attempts.</li>
            <li>Leads remaining updates after each progressive dial cycle.</li>
          </ul>
        </Panel>
      </SplitGrid>
    </div>
  )
}
