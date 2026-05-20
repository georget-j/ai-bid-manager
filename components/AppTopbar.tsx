'use client'

import { usePathname } from 'next/navigation'

const CRUMB_MAP: Record<string, string> = {
  '/': 'Dashboard',
  '/ask': 'Ask',
  '/documents': 'Knowledge Base',
  '/history': 'History',
  '/review': 'Review Queue',
  '/rfp': 'RFP Runs',
  '/demo': 'Demo Scenarios',
  '/admin': 'Admin',
}

export function AppTopbar() {
  const path = usePathname()
  const label = CRUMB_MAP[path] ?? CRUMB_MAP[Object.keys(CRUMB_MAP).find(k => k !== '/' && path.startsWith(k)) ?? ''] ?? 'Page'

  return (
    <header className="topbar">
      <button
        className="icon-btn hamburger"
        aria-label="Open navigation"
        onClick={() => window.dispatchEvent(new Event('toggle-sidebar'))}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M2 4h12M2 8h12M2 12h12" />
        </svg>
      </button>
      <div className="crumb">
        <span>RFP Agent</span>
        <span className="crumb-sep">›</span>
        <b>{label}</b>
      </div>
      <span className="demo-pill">Demo</span>

      <div className="topbar-right">
        <div className="search-pill">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="6.5" cy="6.5" r="5" />
            <path d="M10.5 10.5l3.5 3.5" />
          </svg>
          <span>Search knowledge base…</span>
          <kbd>⌘K</kbd>
        </div>

        <button
          className="icon-btn"
          onClick={() => window.dispatchEvent(new Event('show-welcome'))}
          aria-label="About this tool"
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="8" cy="8" r="6.5" />
            <path d="M8 7v1.5" />
            <circle cx="8" cy="11" r=".5" fill="currentColor" strokeWidth="0" />
            <path d="M6.5 5.5a1.5 1.5 0 0 1 3 0c0 1-1.5 1.5-1.5 2.5" />
          </svg>
        </button>
      </div>
    </header>
  )
}
