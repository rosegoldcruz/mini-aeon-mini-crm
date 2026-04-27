'use client'

import { useApiData } from '@/hooks/useApiData'
import { PageIntro, Panel, SimpleTable, StatCard, StatGrid } from '@/components/crm/primitives'

interface CampaignStat {
  id: string
  name: string
  type?: string
  status: string
  agent_count?: number
  connect_rate?: number
  attempts_today?: number
  connected_today?: number
  wraps_needed?: number
}

interface StatsResponse {
  campaigns: CampaignStat[]
  totals?: {
    attempts: number
    connected: number
    wraps: number
    best_campaign: string
    best_rate: number
  }
}

function fmtRate(r?: number) {
  return r != null ? r.toFixed(1) + '%' : '—'
}

export default function CampaignStatisticsPage() {
  const { data, loading, error } = useApiData<StatsResponse>('/campaigns/stats', { campaigns: [] })
  const campaigns = data.campaigns
  const t = data.totals

  const totalAttempts  = t?.attempts  ?? campaigns.reduce((s, c) => s + (c.attempts_today ?? 0), 0)
  const totalConnected = t?.connected ?? campaigns.reduce((s, c) => s + (c.connected_today ?? 0), 0)
  const totalWraps     = t?.wraps     ?? campaigns.reduce((s, c) => s + (c.wraps_needed ?? 0), 0)
  const connectRate    = totalAttempts ? ((totalConnected / totalAttempts) * 100).toFixed(1) + '%' : '—'
  const bestCampaign   = t?.best_campaign ?? (
    campaigns.sort((a, b) => (b.connect_rate ?? 0) - (a.connect_rate ?? 0))[0]?.name ?? '—'
  )
  const bestRate       = t?.best_rate ?? (
    campaigns.sort((a, b) => (b.connect_rate ?? 0) - (a.connect_rate ?? 0))[0]?.connect_rate
  )

  return (
    <div className="page-stack">
      <PageIntro
        eyebrow="Campaigns"
        title="Campaign Statistics"
        description="Live campaign performance from the AEON Dial backend."
      />

      <StatGrid>
        <StatCard label="Attempts Today"    value={totalAttempts.toLocaleString()} delta="Across all lists" />
        <StatCard label="Connected Calls"   value={String(totalConnected)}         delta={`${connectRate} connect rate`} tone="green" />
        <StatCard label="Wraps Required"    value={String(totalWraps)}             delta="Manual follow-up needed"        tone="gold" />
        <StatCard label="Best Campaign"     value={fmtRate(bestRate)}              delta={bestCampaign}                   tone="green" />
      </StatGrid>

      <Panel title="Campaign Breakdown" subtitle="Live data">
        {error ? (
          <div style={{ color: '#fca5a5', fontSize: 13 }}>⚠ {error}</div>
        ) : loading ? (
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Loading…</div>
        ) : (
          <SimpleTable
            columns={['Campaign', 'Type', 'Status', 'Agents', 'Attempts', 'Connected', 'Connect %']}
            rows={campaigns.map(c => [
              c.name,
              c.type ?? '—',
              c.status,
              String(c.agent_count ?? 0),
              String(c.attempts_today ?? 0),
              String(c.connected_today ?? 0),
              fmtRate(c.connect_rate),
            ])}
          />
        )}
      </Panel>
    </div>
  )
}
