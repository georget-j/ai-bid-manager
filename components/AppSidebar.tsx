"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";

const NAV_INTELLIGENCE = [
  {
    href: "/opportunities",
    label: "Opportunities",
    icon: (
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="8" cy="8" r="3" />
        <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.2 3.2l1.4 1.4M11.4 11.4l1.4 1.4M3.2 12.8l1.4-1.4M11.4 4.6l1.4-1.4" />
      </svg>
    ),
  },
  {
    href: "/pipeline",
    label: "Bid Pipeline",
    icon: (
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="1" y="3" width="3" height="10" rx="1" />
        <rect x="6" y="5" width="3" height="8" rx="1" />
        <rect x="11" y="7" width="3" height="6" rx="1" />
      </svg>
    ),
  },
  {
    href: "/buyers",
    label: "Buyers",
    icon: (
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M2 14V7l6-5 6 5v7H2z" />
        <path d="M6 14v-4h4v4" />
      </svg>
    ),
  },
  {
    href: "/sources",
    label: "Sources",
    icon: (
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="3" cy="8" r="1.5" />
        <circle cx="13" cy="4" r="1.5" />
        <circle cx="13" cy="12" r="1.5" />
        <path d="M4.5 8h4M7 4.5l2.5-1M7 11.5l2.5 1" strokeWidth="1.2" />
      </svg>
    ),
  },
  {
    href: "/alerts",
    label: "Alerts",
    icon: (
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M8 1a5 5 0 0 1 5 5c0 4 1.5 5 1.5 5h-13S3 10 3 6a5 5 0 0 1 5-5z" />
        <path d="M6.5 13a1.5 1.5 0 0 0 3 0" />
      </svg>
    ),
  },
  {
    href: "/profile",
    label: "Organisation Profile",
    icon: (
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="8" cy="5" r="2.5" />
        <path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      </svg>
    ),
  },
];

const NAV_RESPOND = [
  {
    href: "/",
    label: "Dashboard",
    icon: (
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="1" y="1" width="6" height="6" rx="1" />
        <rect x="9" y="1" width="6" height="6" rx="1" />
        <rect x="1" y="9" width="6" height="6" rx="1" />
        <rect x="9" y="9" width="6" height="6" rx="1" />
      </svg>
    ),
    exact: true,
  },
  {
    href: "/ask",
    label: "Ask",
    icon: (
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M8 1.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13z" />
        <path d="M8 7v1.5" />
        <circle cx="8" cy="11" r=".5" fill="currentColor" />
        <path d="M6.5 5.5a1.5 1.5 0 0 1 3 0c0 1-1.5 1.5-1.5 2.5" />
      </svg>
    ),
  },
  {
    href: "/documents",
    label: "Knowledge Base",
    icon: (
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 2h7l3 3v9H3V2z" />
        <path d="M10 2v3h3" />
        <path d="M6 7h4M6 10h4" />
      </svg>
    ),
  },
  {
    href: "/compliance",
    label: "Compliance Matrices",
    icon: (
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M2 2h12v12H2z" />
        <path d="M5 6h6M5 9h4" />
        <path d="M5 12h2" />
      </svg>
    ),
  },
  {
    href: "/rfp",
    label: "RFP Runs",
    icon: (
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 2h7l3 3v9H3V2z" />
        <path d="M10 2v3h3" />
        <path d="M6 10l1.5 1.5 3-3" />
      </svg>
    ),
  },
  {
    href: "/review",
    label: "Review Queue",
    icon: (
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M2 4h12M2 8h8M2 12h5" />
      </svg>
    ),
  },
  {
    href: "/history",
    label: "History",
    icon: (
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="8" cy="8" r="6.5" />
        <path d="M8 4.5V8l2.5 2.5" />
      </svg>
    ),
  },
];

const NAV_BOTTOM = [
  {
    href: "/demo",
    label: "Demo Scenarios",
    icon: (
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polygon points="4,2 13,8 4,14" />
      </svg>
    ),
  },
  {
    href: "/admin",
    label: "Admin",
    icon: (
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="8" cy="8" r="2.5" />
        <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.2 3.2l1.4 1.4M11.4 11.4l1.4 1.4M3.2 12.8l1.4-1.4M11.4 4.6l1.4-1.4" />
      </svg>
    ),
  },
];

const HELP_ICON = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="8" cy="8" r="6.5" />
    <path d="M6.5 5.5a1.5 1.5 0 0 1 3 0c0 1-1.5 1.5-1.5 2.5" />
    <circle cx="8" cy="11" r=".5" fill="currentColor" />
  </svg>
);

export function AppSidebar() {
  const path = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const toggle = () => setOpen((v) => !v);
    const close = () => setOpen(false);
    window.addEventListener("toggle-sidebar", toggle);
    window.addEventListener("close-sidebar", close);
    return () => {
      window.removeEventListener("toggle-sidebar", toggle);
      window.removeEventListener("close-sidebar", close);
    };
  }, []);

  function isActive(href: string, exact = false) {
    if (exact) return path === href;
    return path === href || path.startsWith(href + "/");
  }

  return (
    <>
      <div
        className={`sidebar-scrim${open ? " sidebar-open" : ""}`}
        onClick={() => setOpen(false)}
      />
      <aside className={`sidebar${open ? " sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">B</div>
          <div className="brand-text">
            Bid Intelligence
            <small>UK Public Sector</small>
          </div>
        </div>

        <nav className="nav-section">
          <div className="nav-group-label">Intelligence</div>
          {NAV_INTELLIGENCE.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item ${isActive(item.href) ? "active" : ""}`}
              onClick={() => setOpen(false)}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        <nav className="nav-section" style={{ marginTop: 8 }}>
          <div className="nav-group-label">Respond</div>
          {NAV_RESPOND.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item ${isActive(item.href, item.exact) ? "active" : ""}`}
              onClick={() => setOpen(false)}
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
            onClick={() => window.dispatchEvent(new Event("show-welcome"))}
          >
            <span className="nav-icon">{HELP_ICON}</span>
            Help
          </button>
          {NAV_BOTTOM.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item ${isActive(item.href) ? "active" : ""}`}
              onClick={() => setOpen(false)}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="avatar petrol">B</div>
          <div className="user-line">
            <div className="name">UK Bid Intelligence</div>
            <div className="role">Demo mode active</div>
          </div>
        </div>
      </aside>
    </>
  );
}
