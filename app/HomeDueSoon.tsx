// "Due soon" on the home page — tender deadlines and grant-application deadlines
// merged into one list, soonest first, each row labelled with its offering.
// Server component; data assembled in app/home-data.ts.

import Link from "next/link";
import type { DueSoonItem } from "./home-data";
import { formatDaysLeft } from "@/lib/dates";

export function HomeDueSoon({ items }: { items: DueSoonItem[] | null }) {
  // Nothing due → no section at all; only a failed query earns fallback copy.
  if (items !== null && items.length === 0) return null;

  return (
    <section style={{ marginBottom: 36 }}>
      <div className="section-title">Due soon</div>
      {items === null ? (
        <div className="card card-pad">
          <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
            We couldn&apos;t check your deadlines just now — refresh the page to
            try again.
          </p>
        </div>
      ) : (
        <div className="card" style={{ overflow: "hidden" }}>
          {items.map((item, i) => {
            const urgent = item.daysLeft <= 3;
            return (
              <div
                key={item.href}
                style={{
                  padding: "12px 16px",
                  borderBottom:
                    i < items.length - 1 ? "1px solid var(--border)" : "none",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <span
                  className={`badge ${item.kind === "grant" ? "accent" : "ink"}`}
                  style={{ flexShrink: 0 }}
                >
                  {item.kind === "grant" ? "Grant" : "Tender"}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Link
                    href={item.href}
                    style={{
                      fontSize: 13.5,
                      fontWeight: 500,
                      color: "var(--ink)",
                      textDecoration: "none",
                      display: "block",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {item.title}
                  </Link>
                  {item.from && (
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--muted)",
                        marginTop: 2,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {item.from}
                    </div>
                  )}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: urgent ? "#dc2626" : "var(--muted)",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                >
                  {formatDaysLeft(item.daysLeft)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
