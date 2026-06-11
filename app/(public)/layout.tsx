import Link from "next/link";
import type { ReactNode } from "react";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        background: "var(--bg)",
      }}
    >
      {/* Public nav */}
      <header
        style={{
          borderBottom: "1px solid var(--border)",
          padding: "0 24px",
          height: 56,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "var(--bg)",
          position: "sticky",
          top: 0,
          zIndex: 40,
        }}
      >
        <Link
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            textDecoration: "none",
          }}
        >
          <span
            style={{
              width: 28,
              height: 28,
              borderRadius: "var(--r-sm)",
              background: "var(--accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontWeight: 700,
              fontSize: 13,
              flexShrink: 0,
            }}
          >
            B
          </span>
          <span
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 15,
              color: "var(--ink)",
            }}
          >
            Bid Intelligence
          </span>
        </Link>

        <nav
          style={{
            display: "flex",
            gap: 24,
            alignItems: "center",
          }}
        >
          {[
            { href: "/how-it-works", label: "How it works" },
            { href: "/services", label: "Services" },
            { href: "/industries", label: "Industries" },
            { href: "/resources", label: "Resources" },
            { href: "/pricing", label: "Pricing" },
          ].map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              style={{
                fontSize: 13.5,
                color: "var(--ink-2)",
                textDecoration: "none",
              }}
            >
              {label}
            </Link>
          ))}
          <Link href="/login" className="btn primary" style={{ fontSize: 13 }}>
            Sign in
          </Link>
        </nav>
      </header>

      {/* Content */}
      <main
        style={{
          flex: 1,
          padding: "48px 24px",
          maxWidth: 860,
          margin: "0 auto",
          width: "100%",
        }}
      >
        {children}
      </main>

      {/* Footer */}
      <footer
        style={{
          borderTop: "1px solid var(--border)",
          padding: "20px 24px",
          display: "flex",
          gap: 24,
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span style={{ fontSize: 12, color: "var(--muted)" }}>
          UK Bid Intelligence Agent
        </span>
        <div style={{ display: "flex", gap: 20 }}>
          {[
            { href: "/how-it-works", label: "How it works" },
            { href: "/services", label: "Services" },
            { href: "/resources", label: "Resources" },
            { href: "/pricing", label: "Pricing" },
            { href: "/contact", label: "Contact" },
          ].map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              style={{
                fontSize: 12,
                color: "var(--muted)",
                textDecoration: "none",
              }}
            >
              {label}
            </Link>
          ))}
        </div>
      </footer>
    </div>
  );
}
