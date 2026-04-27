import type { ReactNode } from 'react'

export function PageIntro({ eyebrow, title, description, aside }: {
  eyebrow: string
  title: string
  description: string
  aside?: ReactNode
}) {
  return (
    <section className="page-intro">
      <div>
        <div className="page-eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {aside ? <div className="page-intro-aside">{aside}</div> : null}
    </section>
  )
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <section className="stat-grid">{children}</section>
}

export function StatCard({ label, value, delta, tone = 'cyan' }: {
  label: string
  value: string
  delta: string
  tone?: 'cyan' | 'green' | 'gold'
}) {
  return (
    <article className={`panel stat-card tone-${tone}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-delta">{delta}</div>
    </article>
  )
}

export function Panel({ title, subtitle, children }: {
  title: string
  subtitle?: string
  children: ReactNode
}) {
  return (
    <section className="panel section-panel">
      <div className="panel-head">
        <div>
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
      </div>
      {children}
    </section>
  )
}

export function SimpleTable({ columns, rows }: { columns: string[]; rows: ReactNode[][] }) {
  return (
    <div className="table-wrap">
      <table className="aeon-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Badge({ children, tone = 'cyan' }: { children: ReactNode; tone?: 'cyan' | 'green' | 'gold' | 'red' }) {
  return <span className={`inline-badge tone-${tone}`}>{children}</span>
}

export function SplitGrid({ children }: { children: ReactNode }) {
  return <section className="split-grid">{children}</section>
}