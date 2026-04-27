'use client'

import { useApiData } from '@/hooks/useApiData'
import { Badge, PageIntro, Panel, SimpleTable, SplitGrid, StatCard, StatGrid } from '@/components/crm/primitives'

interface Agent {
  id: string
  name: string
  username: string
  role: string
  status?: string
  calls_today?: number
  talk_time_today?: string
  demos_today?: number
  conversion_rate?: string
  active?: boolean
  enabled?: boolean
  session_state?: string
}

interface AgentsResponse {
  agents: Agent[]
}

function fmtTalkTime(secs?: number): string {
  if (!secs) return '—'
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export default function UsersPage() {
  const { data, loading, error } = useApiData<AgentsResponse>('/agents', { agents: [] })
  const agents = data.agents

  const active   = agents.filter(a => a.active).length
  const avgConv  = agents.length
    ? (agents.reduce((sum, a) => sum + parseFloat(a.conversion_rate ?? '0'), 0) / agents.length).toFixed(1) + '%'
    : '—'
  const totalCalls = agents.reduce((sum, a) => sum + (a.calls_today ?? 0), 0)

  return (
    <div className="page-stack">
      <PageIntro
        eyebrow="Users"
        title="All Agents"
        description="Live agent roster pulled from the AEON Dial backend."
        aside={<Badge tone={loading ? 'gold' : error ? 'cyan' : 'green'}>
          {loading ? 'Loading…' : error ? 'Error' : 'Live'}
        </Badge>}
      />

      <StatGrid>
        <StatCard label="Total Agents"    value={String(agents.length)} delta="Registered in system" />
        <StatCard label="On Dialer"       value={String(active)}        delta="Ready or in a call"   tone="green" />
        <StatCard label="Calls Today"     value={String(totalCalls)}    delta="Across all agents" />
        <StatCard label="Avg Conversion"  value={avgConv}               delta="Today aggregate"      tone="gold" />
      </StatGrid>

      <SplitGrid>
        <Panel title="Agent Roster" subtitle="Live data">
          {error ? (
            <div style={{ color: '#fca5a5', fontSize: 13 }}>⚠ {error}</div>
          ) : loading ? (
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Loading agents…</div>
          ) : (
            <SimpleTable
              columns={['Agent', 'Role', 'Dialer State', 'Account', 'Calls Today', 'Talk Time']}
              rows={agents.map(a => [
                a.name,
                a.role,
                <Badge
                  key={`${a.id}-status`}
                  tone={a.active ? 'green' : a.session_state === 'REGISTERED' ? 'cyan' : 'gold'}
                >
                  {a.session_state ?? 'OFFLINE'}
                </Badge>,
                a.enabled === false ? 'Disabled' : 'Enabled',
                String(a.calls_today ?? 0),
                a.talk_time_today ?? '—',
              ])}
            />
          )}
        </Panel>

        <Panel title="Team Notes" subtitle="Live context">
          <ul className="bullet-list">
            <li>Data refreshes on every page load.</li>
            <li>On Dialer counts READY, RESERVED, IN_CALL, and WRAP_UP sessions.</li>
            <li>Talk time and calls update after each wrap-up submission.</li>
          </ul>
        </Panel>
      </SplitGrid>
    </div>
  )
}
