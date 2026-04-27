'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { NAV_SECTIONS, NavSection, ICONS } from './nav-config'
import { getAgent, clearAuth, isAuthenticated } from '@/lib/auth'
import type { StoredAgent } from '@/lib/auth'

function Icon({ d, size = 14 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none"
      stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0 }}>
      <path d={d} />
    </svg>
  )
}

function NavSectionGroup({ section, pathname }: { section: NavSection; pathname: string }) {
  const hasActive = section.items.some(
    (item) => pathname.startsWith(item.href) && item.href !== '/',
  )
  const [open, setOpen] = useState(!section.collapsible || hasActive)
  return (
    <div className="nav-section">
      <button className={`nav-section-label${section.collapsible ? ' collapsible' : ''}`}
        onClick={() => section.collapsible && setOpen((c) => !c)}
        style={{ cursor: section.collapsible ? undefined : 'default' }}>
        <span>{section.label}</span>
        {section.collapsible && (
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5"
            style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', opacity: 0.4 }}>
            <path d="M1 2l3 3 3-3" />
          </svg>
        )}
      </button>
      {open && (
        <div className="nav-items">
          {section.items.map((item) => {
            const isActive = pathname === item.href || (pathname.startsWith(item.href) && item.href !== '/')
            return (
              <Link key={item.href} href={item.href} className={`nav-item${isActive ? ' active' : ''}`}>
                <Icon d={item.icon} />
                <span className="nav-item-label">{item.label}</span>
                {item.badge && (
                  <span className={`nav-badge${item.badgeVariant === 'hot' ? ' hot' : ''}`}>{item.badge}</span>
                )}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

interface Blob { x: number; y: number; vx: number; vy: number; r: number; color: [number,number,number]; alpha: number }

function ShellChrome({ pathname, children }: { pathname: string; children: React.ReactNode }) {
  const router    = useRouter()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const blobsRef  = useRef<Blob[]>([])
  const mouseRef  = useRef({ x: 0, y: 0 })
  const rafRef    = useRef(0)

  const [sidebarOpen,  setSidebarOpen]  = useState(true)
  const [time,         setTime]         = useState('')
  const [sessionId]                     = useState(() => Math.random().toString(36).slice(2, 8).toUpperCase())
  const [toastMsg,     setToastMsg]     = useState({ title: '', body: '' })
  const [toastVisible, setToastVisible] = useState(false)
  const [agent,        setAgent]        = useState<StoredAgent | null>(null)
  // ← key fix: don't render shell chrome until we've confirmed auth client-side
  const [authChecked,  setAuthChecked]  = useState(false)

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace('/login')
      return
    }
    setAgent(getAgent())
    setAuthChecked(true)
  }, [router])

  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString('en-US', { hour12: false }))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const COLORS: Array<[number,number,number]> = [[0,229,255],[255,76,160],[0,255,136]]

    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight }

    const initBlobs = () => {
      blobsRef.current = Array.from({ length: 6 }, (_, i) => ({
        x: Math.random() * window.innerWidth, y: Math.random() * window.innerHeight,
        vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4,
        r: 180 + Math.random() * 160, color: COLORS[i % 3], alpha: 0.04 + Math.random() * 0.04,
      }))
      blobsRef.current.push({ x: window.innerWidth/2, y: window.innerHeight/2, vx:0, vy:0, r:120, color:[0,229,255], alpha:0.05 })
    }

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const blobs = blobsRef.current
      const mag   = blobs[blobs.length - 1]
      mag.x += (mouseRef.current.x - mag.x) * 0.05
      mag.y += (mouseRef.current.y - mag.y) * 0.05
      blobs.forEach((b, i) => {
        if (i === blobs.length - 1) return
        b.x += b.vx; b.y += b.vy
        if (b.x < -b.r || b.x > canvas.width  + b.r) b.vx *= -1
        if (b.y < -b.r || b.y > canvas.height + b.r) b.vy *= -1
        const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r)
        g.addColorStop(0, `rgba(${b.color.join(',')},${b.alpha})`)
        g.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI*2)
        ctx.fillStyle = g; ctx.fill()
      })
      const mg = ctx.createRadialGradient(mag.x, mag.y, 0, mag.x, mag.y, mag.r * 2.5)
      mg.addColorStop(0, 'rgba(0,80,110,0.07)'); mg.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.beginPath(); ctx.arc(mag.x, mag.y, mag.r * 2.5, 0, Math.PI*2)
      ctx.fillStyle = mg; ctx.fill()
      rafRef.current = requestAnimationFrame(draw)
    }

    resize(); initBlobs()
    const onMove = (e: MouseEvent) => { mouseRef.current = { x: e.clientX, y: e.clientY } }
    window.addEventListener('resize', resize)
    window.addEventListener('mousemove', onMove)
    draw()
    return () => {
      window.removeEventListener('resize', resize)
      window.removeEventListener('mousemove', onMove)
      cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const showToast = useCallback((title: string, body: string) => {
    setToastMsg({ title, body }); setToastVisible(true)
    setTimeout(() => setToastVisible(false), 4000)
  }, [])

  const logout = useCallback(() => { clearAuth(); router.replace('/login') }, [router])

  const crumb = pathname.split('/').filter(Boolean)
    .map(s => s.replace(/-/g, ' ').toUpperCase()).join(' / ') || 'HOME'

  const initials = agent?.name
    ? agent.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : 'AE'

  // Render nothing (blank) until auth confirmed — kills all hydration mismatches
  if (!authChecked) return null

  return (
    <>
      <canvas ref={canvasRef} style={{ position:'fixed', inset:0, zIndex:0, pointerEvents:'none' }} />
      <div className="aeon-grid-overlay" />
      <div className="aeon-scanline" />

      <div className={`aeon-app${sidebarOpen ? '' : ' sidebar-collapsed'}`}>
        <aside className="aeon-sidebar">
          <div className="sidebar-logo">
            <div className="sidebar-wordmark real-brand-wordmark">
              <img src="/favicon.svg" alt="AEON Dial" className="brand-favicon" />
              <span>AEON</span>
            </div>
            <div className="sidebar-sub">Dial · CRM · Intelligence</div>
          </div>
          <nav className="aeon-nav">
            {NAV_SECTIONS.map(section => (
              <NavSectionGroup key={section.label} section={section} pathname={pathname} />
            ))}
          </nav>
          <div className="sidebar-footer">
            <div className="user-chip">
              <div className="user-avatar">{initials}</div>
              <div className="user-info">
                <div className="user-name">{agent?.name ?? 'AGENT'}</div>
                <div className="user-role">{agent?.role ?? 'agent'}</div>
              </div>
            </div>
            <button onClick={logout}
              style={{ background:'none', border:'1px solid rgba(255,255,255,0.08)', borderRadius:6,
                color:'rgba(255,255,255,0.35)', cursor:'pointer', fontSize:10, letterSpacing:'0.12em',
                padding:'6px 10px', marginTop:8, width:'100%', textTransform:'uppercase', transition:'color 0.15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color='#ef4444' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color='rgba(255,255,255,0.35)' }}>
              ⊗ Logout
            </button>
          </div>
        </aside>

        <header className="aeon-topbar">
          <button className="sidebar-toggle" onClick={() => setSidebarOpen(c => !c)} aria-label="Toggle sidebar">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
              <path d="M1 3h12M1 7h12M1 11h8" />
            </svg>
          </button>
          <div className="topbar-breadcrumb">
            <span className="bc-root">AEON</span>
            <span className="bc-sep">/</span>
            <span className="bc-current">{crumb}</span>
          </div>
          <div className="topbar-search-wrap">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4">
              <circle cx="5" cy="5" r="3.5" /><line x1="7.5" y1="7.5" x2="11" y2="11" />
            </svg>
            <input className="topbar-search" type="text" placeholder="SEARCH SYSTEM..." spellCheck={false} autoComplete="off" />
          </div>
          <div className="topbar-actions">
            <button className="icon-btn" onClick={() => showToast('AEON DIAL', 'System nominal')} aria-label="Notifications">
              <Icon d={ICONS.inbox} /><span className="notif-dot" />
            </button>
            <button className="icon-btn" aria-label="Lists">
              <Icon d={ICONS.list} />
            </button>
            <div className="topbar-time">{time}</div>
          </div>
        </header>

        <main className="aeon-main">{children}</main>

        <footer className="aeon-statusbar">
          <div className="status-indicator"><div className="status-dot" /><span>SYSTEM: NOMINAL</span></div>
          <div className="status-sep" />
          <span>AGENT: {agent?.name ?? '—'}</span>
          <div className="status-sep" />
          <span>SESSION: {sessionId}</span>
          <div className="status-sep" />
          <span className="status-time">{time}</span>
        </footer>
      </div>

      <div className={`aeon-toast${toastVisible ? ' show' : ''}`}>
        <div className="toast-title">{toastMsg.title}</div>
        <div className="toast-body">{toastMsg.body}</div>
      </div>
    </>
  )
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  if (pathname === '/login') return <>{children}</>
  return <ShellChrome pathname={pathname}>{children}</ShellChrome>
}
