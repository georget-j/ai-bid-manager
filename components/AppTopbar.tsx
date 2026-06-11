"use client";

import { useEffect, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";

// Breadcrumb labels by route. Keys may contain dynamic segments
// (e.g. "/opportunities/[id]/gaps") which match any value in that position.
// The most specific (longest) matching key wins, so
// "/opportunities/[id]/gaps" beats "/opportunities".
export const CRUMB_MAP: Record<string, string> = {
  "/": "Home",
  // Tenders
  "/opportunities/[id]/gaps": "Evidence gaps",
  "/opportunities": "Find tenders",
  "/my-opportunities": "Matched to you",
  "/pipeline": "Bid pipeline",
  "/buyers": "Buyers",
  // Grants
  "/grants": "Find grants",
  "/my-grants": "Matched to you",
  "/my-applications": "My applications",
  "/funders": "Funders",
  // Investors
  "/investor-events/organizers": "Event organiser",
  "/investor-events": "Investor events",
  "/programmes": "Programmes",
  // Your workspace
  "/ask": "Ask",
  "/documents": "Evidence library",
  "/responses": "Responses",
  "/review": "Review queue",
  "/alerts": "Alerts",
  "/compliance": "Compliance",
  "/history": "History",
  "/profile": "Organisation profile",
  "/team": "Team",
  // Answer builder (legacy path — URL doesn't change, label does)
  "/rfp/drafts": "Application",
  // Agency workspace
  "/clients/[id]/evidence": "Evidence vault",
  "/clients": "Clients",
  // Operator
  "/sources": "Sources",
  "/grant-sources": "Sources",
  "/admin": "Admin",
};

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Pre-compiled matchers, most specific first. "[param]" segments match any
// single path segment, so real URLs like /opportunities/abc123/gaps resolve.
const CRUMB_PATTERNS = Object.entries(CRUMB_MAP)
  .filter(([key]) => key !== "/")
  .sort(([a], [b]) => b.length - a.length)
  .map(([key, label]) => ({
    label,
    regex: new RegExp(
      "^" +
        key
          .split("/")
          .map((seg) =>
            seg.startsWith("[") && seg.endsWith("]")
              ? "[^/]+"
              : escapeRegExp(seg),
          )
          .join("/") +
        "(?:/|$)",
    ),
  }));

/**
 * Resolve the breadcrumb label for a pathname. Falls back to a humanised
 * last path segment so the crumb never reads "Page".
 */
export function crumbLabelFor(path: string): string {
  const exact = CRUMB_MAP[path];
  if (exact) return exact;
  const match = CRUMB_PATTERNS.find((p) => p.regex.test(path));
  if (match) return match.label;
  const last = path.split("/").filter(Boolean).pop() ?? "";
  const words = decodeURIComponent(last).replace(/[-_]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Home";
}

export function AppTopbar() {
  const path = usePathname();
  const router = useRouter();
  const label = crumbLabelFor(path);

  const handleSignOut = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }, [router]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        router.push("/ask");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [router]);

  return (
    <header className="topbar">
      <button
        className="icon-btn hamburger"
        aria-label="Open navigation"
        onClick={() => window.dispatchEvent(new Event("toggle-sidebar"))}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <path d="M2 4h12M2 8h12M2 12h12" />
        </svg>
      </button>
      <div className="crumb">
        <span>Bid Intelligence</span>
        <span className="crumb-sep">›</span>
        <b>{label}</b>
      </div>
      <div className="topbar-right">
        <div
          className="search-pill"
          role="button"
          tabIndex={0}
          onClick={() => router.push("/ask")}
          onKeyDown={(e) => e.key === "Enter" && router.push("/ask")}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="6.5" cy="6.5" r="5" />
            <path d="M10.5 10.5l3.5 3.5" />
          </svg>
          <span>Search your evidence…</span>
          <kbd>⌘K</kbd>
        </div>

        <button
          className="icon-btn"
          onClick={() => window.dispatchEvent(new Event("show-welcome"))}
          aria-label="About this tool"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="8" cy="8" r="6.5" />
            <path d="M8 7v1.5" />
            <circle cx="8" cy="11" r=".5" fill="currentColor" strokeWidth="0" />
            <path d="M6.5 5.5a1.5 1.5 0 0 1 3 0c0 1-1.5 1.5-1.5 2.5" />
          </svg>
        </button>

        <button
          className="icon-btn"
          onClick={handleSignOut}
          aria-label="Sign out"
          title="Sign out"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
            <path d="M10.5 11l3.5-3-3.5-3" />
            <path d="M14 8H6" />
          </svg>
        </button>
      </div>
    </header>
  );
}
