// One "Recommended for you" column (tenders or grants) — same card language for
// both offerings: name, who it's from, deadline, NN/100 match + one reason.
// Server component; the data is assembled in app/home-data.ts.

import Link from "next/link";
import type { RecommendedItem } from "./home-data";
import { daysUntil, formatDaysLeft } from "@/lib/dates";
import { matchColor } from "@/lib/grants/copy";

export function HomeRecommendations({
  heading,
  items,
  hasProfile,
  seeAllHref,
  browseHref,
  browseLabel,
}: {
  heading: string;
  /** null = the query failed; [] = nothing matched (or no profile yet). */
  items: RecommendedItem[] | null;
  hasProfile: boolean;
  seeAllHref: string;
  browseHref: string;
  browseLabel: string;
}) {
  return (
    <div>
      <div
        className="section-title"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>{heading}</span>
        <Link
          href={seeAllHref}
          style={{
            fontSize: 12,
            color: "var(--accent)",
            textDecoration: "none",
            fontWeight: 400,
          }}
        >
          See all →
        </Link>
      </div>

      {!hasProfile ? (
        <div className="card card-pad">
          <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
            We match these to your organisation — tell us about yours first.
          </p>
          <Link
            href="/profile"
            style={{
              fontSize: 13,
              color: "var(--accent)",
              textDecoration: "none",
            }}
          >
            Add your profile to see matches →
          </Link>
        </div>
      ) : items === null ? (
        <div className="card card-pad">
          <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
            We couldn&apos;t load these just now — refresh the page to try
            again.
          </p>
        </div>
      ) : items.length === 0 ? (
        <div className="card card-pad">
          <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
            No strong matches right now — new ones arrive as sources update.
          </p>
          <Link
            href={browseHref}
            style={{
              fontSize: 13,
              color: "var(--accent)",
              textDecoration: "none",
            }}
          >
            {browseLabel} →
          </Link>
        </div>
      ) : (
        <div className="card" style={{ overflow: "hidden" }}>
          {items.map((item, i) => {
            const days =
              item.deadlineAt != null ? daysUntil(item.deadlineAt) : null;
            return (
              <div
                key={item.id}
                style={{
                  padding: "12px 16px",
                  borderBottom:
                    i < items.length - 1 ? "1px solid var(--border)" : "none",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 10,
                  }}
                >
                  <Link
                    href={item.href}
                    style={{
                      flex: 1,
                      minWidth: 0,
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
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      fontFamily: "var(--font-mono)",
                      color: matchColor(item.score),
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                    }}
                  >
                    {item.score}/100 match
                  </span>
                </div>
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
                  {item.from ?? "Unknown"}
                  {days !== null && (
                    <>
                      {" · "}
                      <span
                        style={{
                          color: days <= 7 ? "#dc2626" : "var(--muted)",
                        }}
                      >
                        {formatDaysLeft(days)}
                      </span>
                    </>
                  )}
                </div>
                {item.reason && (
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--muted)",
                      marginTop: 3,
                      lineHeight: 1.45,
                      overflow: "hidden",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                    }}
                  >
                    {item.reason}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
