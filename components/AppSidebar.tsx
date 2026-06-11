"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useMemo, useSyncExternalStore } from "react";
import type { ReactNode } from "react";

// Static external "store" for hydration detection: the server snapshot is
// false and the client snapshot is true, so server HTML and the hydration
// render agree (both false) and React re-renders once hydration completes.
const emptySubscribe = () => () => {};

export type NavItem = {
  href: string;
  label: string;
  /** Highlight only on an exact path match (used for "/"). */
  exact?: boolean;
  /** Only visible to platform operators (server gates still enforce). */
  operatorOnly?: boolean;
  /** Only visible to org owners/admins (server gates still enforce). */
  ownerAdmin?: boolean;
  icon: ReactNode;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

const ICONS = {
  home: (
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
  search: (
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
  star: (
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
      <path d="M8 2l1.8 3.6L14 6.5l-3 2.9.7 4.1L8 11.4l-3.7 2.1.7-4.1-3-2.9 4.2-.9z" />
    </svg>
  ),
  pipeline: (
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
  building: (
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
  pound: (
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
      <path d="M8 4.5v7M6 6.5h3a1.3 1.3 0 0 1 0 2.6H7a1.3 1.3 0 0 0 0 2.6h3" />
    </svg>
  ),
  applications: (
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
      <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" />
      <path d="M5 6h6M5 8.5h6M5 11h3.5" />
    </svg>
  ),
  pin: (
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
      <path d="M8 1.5a4.5 4.5 0 0 1 4.5 4.5c0 3.4-4.5 8.5-4.5 8.5S3.5 9.4 3.5 6A4.5 4.5 0 0 1 8 1.5z" />
      <circle cx="8" cy="6" r="1.8" />
    </svg>
  ),
  rosette: (
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
      <path d="M8 1.5l2 4.3 4.5.5-3.4 3 1 4.7L8 11.7 3.9 14l1-4.7-3.4-3L6 5.8z" />
    </svg>
  ),
  ask: (
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
  file: (
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
  clipboard: (
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
      <rect x="3" y="2.5" width="10" height="12" rx="1" />
      <path d="M6 2v1.5h4V2" />
      <path d="M5.5 7.5h5M5.5 10.5h3" />
    </svg>
  ),
  queue: (
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
  bell: (
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
  checklist: (
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
      <path d="M2.5 4l1 1 2-2" />
      <path d="M2.5 9l1 1 2-2" />
      <path d="M8 4h5.5M8 9h5.5M8 13h3.5" />
    </svg>
  ),
  clock: (
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
  person: (
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
  people: (
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
      <circle cx="5.5" cy="5.5" r="2.2" />
      <circle cx="11" cy="6" r="1.8" />
      <path d="M1.5 13.5c0-2.6 1.6-4 4-4s4 1.4 4 4" />
      <path d="M10 13.5c0-2 1-3.2 2.5-3.2" />
    </svg>
  ),
  nodes: (
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
  gear: (
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
} as const;

export const NAV_HOME: NavItem = {
  href: "/",
  label: "Home",
  exact: true,
  icon: ICONS.home,
};

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Tenders",
    items: [
      { href: "/opportunities", label: "Find tenders", icon: ICONS.search },
      { href: "/my-opportunities", label: "Matched to you", icon: ICONS.star },
      { href: "/pipeline", label: "Bid pipeline", icon: ICONS.pipeline },
      { href: "/buyers", label: "Buyers", icon: ICONS.building },
    ],
  },
  {
    label: "Grants",
    items: [
      { href: "/grants", label: "Find grants", icon: ICONS.pound },
      { href: "/my-grants", label: "Matched to you", icon: ICONS.star },
      {
        href: "/my-applications",
        label: "My applications",
        icon: ICONS.applications,
      },
      { href: "/funders", label: "Funders", icon: ICONS.building },
    ],
  },
  {
    label: "Investors",
    items: [
      { href: "/investor-events", label: "Investor events", icon: ICONS.pin },
      { href: "/programmes", label: "Programmes", icon: ICONS.rosette },
    ],
  },
  {
    label: "Your workspace",
    items: [
      { href: "/ask", label: "Ask", icon: ICONS.ask },
      { href: "/documents", label: "Evidence library", icon: ICONS.file },
      { href: "/clients", label: "Clients", icon: ICONS.people },
      { href: "/responses", label: "Responses", icon: ICONS.clipboard },
      { href: "/review", label: "Review queue", icon: ICONS.queue },
      { href: "/alerts", label: "Alerts", icon: ICONS.bell },
      { href: "/compliance", label: "Compliance", icon: ICONS.checklist },
      { href: "/history", label: "History", icon: ICONS.clock },
      { href: "/profile", label: "Organisation profile", icon: ICONS.person },
      { href: "/team", label: "Team", ownerAdmin: true, icon: ICONS.people },
    ],
  },
];

export const NAV_OPERATOR: NavItem[] = [
  { href: "/sources", label: "Sources", operatorOnly: true, icon: ICONS.nodes },
  { href: "/admin", label: "Admin", operatorOnly: true, icon: ICONS.gear },
];

/** Pure active-state check so nested routes (e.g. /grants/123) highlight their parent item. */
export function isNavActive(path: string, href: string, exact = false) {
  if (exact) return path === href;
  return path === href || path.startsWith(href + "/");
}

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

export function AppSidebar({
  isOperator: isOperatorProp = false,
  orgRole: orgRoleProp = null,
  userEmail: userEmailProp,
}: {
  isOperator?: boolean;
  orgRole?: string | null;
  userEmail?: string | null;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  // mounted ensures server HTML and client initial render agree (both false),
  // eliminating hydration mismatches. Role-gated items only render post-mount.
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  // Read the role cookies set by middleware on every authenticated request.
  // Synchronous — no round-trip, no race. UI hint only; server gates enforce.
  const cookieRoles = useMemo(() => {
    if (!mounted) return null;
    const read = (name: string) =>
      document.cookie
        .split("; ")
        .find((r) => r.startsWith(`${name}=`))
        ?.split("=")[1];
    const role = read("x-org-role");
    return {
      isOperator: read("x-is-operator") === "1",
      orgRole: role ? decodeURIComponent(role) : null,
    };
  }, [mounted]);
  const isOperator = cookieRoles ? cookieRoles.isOperator : isOperatorProp;
  const orgRole = cookieRoles
    ? (cookieRoles.orgRole ?? orgRoleProp)
    : orgRoleProp;
  const [userEmail] = useState(userEmailProp ?? null);
  const canManageTeam = orgRole === "owner" || orgRole === "admin";

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

  // Role-gated items only render post-mount; server gates still enforce access.
  function isVisible(item: NavItem) {
    if (item.operatorOnly) return mounted && isOperator;
    if (item.ownerAdmin) return mounted && canManageTeam;
    return true;
  }

  function renderItem(item: NavItem) {
    return (
      <Link
        key={item.href}
        href={item.href}
        className={`nav-item ${isNavActive(path, item.href, item.exact) ? "active" : ""}`}
        onClick={() => setOpen(false)}
      >
        <span className="nav-icon">{item.icon}</span>
        {item.label}
      </Link>
    );
  }

  const operatorItems = NAV_OPERATOR.filter(isVisible);

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
            <small>Tenders · Grants</small>
          </div>
        </div>

        <nav className="nav-section">{renderItem(NAV_HOME)}</nav>

        {NAV_GROUPS.map((group) => {
          const items = group.items.filter(isVisible);
          if (items.length === 0) return null;
          return (
            <nav
              key={group.label}
              className="nav-section"
              style={{ marginTop: 8 }}
            >
              <div className="nav-group-label">{group.label}</div>
              {items.map(renderItem)}
            </nav>
          );
        })}

        <div style={{ flex: 1 }} />

        <nav className="nav-section">
          <button
            className="nav-item"
            onClick={() => window.dispatchEvent(new Event("show-welcome"))}
          >
            <span className="nav-icon">{HELP_ICON}</span>
            Help
          </button>
          {operatorItems.length > 0 && (
            <>
              <div className="nav-group-label">Operator</div>
              {operatorItems.map(renderItem)}
            </>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="avatar petrol">
            {userEmail ? userEmail[0].toUpperCase() : "B"}
          </div>
          <div className="user-line">
            <div
              className="name"
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {userEmail ?? "UK Bid Intelligence"}
            </div>
            <div className="role">
              {orgRole
                ? orgRole.charAt(0).toUpperCase() + orgRole.slice(1)
                : "Member"}
              {isOperator ? " · Operator" : ""}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
