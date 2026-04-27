'use client'

import { useApiData } from '@/hooks/useApiData'
import { PageIntro, Panel, SimpleTable, StatCard, StatGrid } from '@/components/crm/primitives'

interface AgentStat {
  id: string
  name: string
  calls_today?: number
  demos_today?: number
  conversion_rate?: string
  talk_time_seconds?: number
  active?: boolean
  session_state?: string
  role?: string
}

interface StatsResponse {
  agents: AgentStat[]
  totals?: {
    calls: number
    demos: number
    avg_talk_seconds: number
    utilization: number
  }
}

function fmtTalkTime(secs?: number): string {
  if (!secs) return '—'
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export default function UserStatisticsPage() {
  const { data, loading, error } = useApiData<StatsResponse>('/agents/stats', { agents: [] })
  const agents = data.agents
  const t = data.totals

  const totalCalls = t?.calls ?? agents.reduce((s, a) => s + (a.calls_today ?? 0), 0)
  const totalDemos = t?.demos ?? agents.reduce((s, a) => s + (a.demos_today ?? 0), 0)
  const avgTalk    = fmtTalkTime(t?.avg_talk_seconds ?? (
    agents.length
      ? Math.round(agents.reduce((s, a) => s + (a.talk_time_seconds ?? 0), 0) / agents.length)
      : 0
  ))
  const utilization = t?.utilization != null ? `${t.utilization.toFixed(0)}%` : '—'

  return (
    <div className="page-stack">
      <PageIntro
        eyebrow="Users"
        title="User Statistics"
        description="Live agent performance pulled from the AEON Dial backend."
      />

      <StatGrid>
        <StatCard label="Calls Placed"    value={String(totalCalls)} delta="Across current roster" />
        <StatCard label="Demos / Closes"  value={String(totalDemos)} delta={`${totalCalls ? ((totalDemos/totalCalls)*100).toFixed(1) : 0}% close path`} tone="green" />
        <StatCard label="Avg Talk Time"   value={avgTalk}            delta="Per roster agent"       tone="gold" />
        <StatCard label="Utilization"     value={utilization}        delta="Above target band" />
      </StatGrid>

      <Panel title="Performance Distribution" subtitle="Live data">
        {error ? (
          <div style={{ color: '#fca5a5', fontSize: 13 }}>⚠ {error}</div>
        ) : loading ? (
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Loading…</div>
        ) : (
          <SimpleTable
            columns={['User', 'Role', 'Calls', 'Demos', 'Conversion', 'Talk Time', 'Status']}
            rows={agents.map(a => [
              a.name,
              a.role ?? '—',
              String(a.calls_today ?? 0),
              String(a.demos_today ?? 0),
              a.conversion_rate ?? '—',
              fmtTalkTime(a.talk_time_seconds),
              a.session_state ?? 'OFFLINE',
            ])}
          />
        )}
      </Panel>
    </div>
  )
}
