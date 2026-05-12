'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_MAIN = [
  {
    href: '/',
    label: 'Dashboard',
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="1" width="6" height="6" rx="1" />
        <rect x="9" y="1" width="6" height="6" rx="1" />
        <rect x="1" y="9" width="6" height="6" rx="1" />
        <rect x="9" y="9" width="6" height="6" rx="1" />
      </svg>
    ),
    exact: true,
  },
  {
    href: '/ask',
    label: 'Ask',
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 1.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13z" />
        <path d="M8 7v1.5" />
        <circle cx="8" cy="11" r=".5" fill="currentColor" />
        <path d="M6.5 5.5a1.5 1.5 0 0 1 3 0c0 1-1.5 1.5-1.5 2.5" />
      </svg>
    ),
  },
  {
    href: '/documents',
    label: 'Knowledge Base',
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 2h7l3 3v9H3V2z" />
        <path d="M10 2v3h3" />
        <path d="M6 7h4M6 10h4" />
      </svg>
    ),
  },
  {
    href: '/history',
    label: 'History',
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="8" cy="8" r="6.5" />
        <path d="M8 4.5V8l2.5 2.5" />
      </svg>
    ),
  },
  {
    href: '/review',
    label: 'Review Queue',
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 4h12M2 8h8M2 12h5" />
      </svg>
    ),
  },
  {
    href: '/rfp',
    label: 'RFP Runs',
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 2h7l3 3v9H3V2z" />
        <path d="M10 2v3h3" />
        <path d="M6 10l1.5 1.5 3-3" />
      </svg>
    ),
  },
  {
    href: '/demo',
    label: 'Demo Scenarios',
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="4,2 13,8 4,14" />
      </svg>
    ),
  },
]

const NAV_BOTTOM = [
  {
    href: '/admin',
    label: 'Admin',
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="8" cy="8" r="2.5" />
        <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.2 3.2l1.4 1.4M11.4 11.4l1.4 1.4M3.2 12.8l1.4-1.4M11.4 4.6l1.4-1.4" />
      </svg>
    ),
  },
]

const HELP_ICON = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="8" cy="8" r="6.5" />
    <path d="M6.5 5.5a1.5 1.5 0 0 1 3 0c0 1-1.5 1.5-1.5 2.5" />
    <circle cx="8" cy="11" r=".5" fill="currentColor" />
  </svg>
)

export function AppSidebar() {
  const path = usePathname()

  function isActive(href: string, exact = false) {
    if (exact) return path === href
    return path === href || path.startsWith(href + '/')
  }

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">A</div>
        <div className="brand-text">
          RFP Agent
          <small>Enterprise Knowledge</small>
        </div>
      </div>

      <nav className="nav-section">
        {NAV_MAIN.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-item ${isActive(item.href, item.exact) ? 'active' : ''}`}
          >
            <span className="nav-icon">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>

      <div style={{ flex: 1 }} />

      <nav className="nav-section">
        <button
          className="nav-item"
          onClick={() => window.dispatchEvent(new Event('show-welcome'))}
        >
          <span className="nav-icon">{HELP_ICON}</span>
          Help
        </button>
        {NAV_BOTTOM.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-item ${isActive(item.href) ? 'active' : ''}`}
          >
            <span className="nav-icon">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="avatar petrol">AI</div>
        <div className="user-line">
          <div className="name">RFP Agent</div>
          <div className="role">Demo mode active</div>
        </div>
      </div>
    </aside>
  )
}
