"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function OpportunityTabs({ id }: { id: string }) {
  const pathname = usePathname();
  const rfpPath = `/opportunities/${id}/rfp`;
  const gapsPath = `/opportunities/${id}/gaps`;
  const isRfp = pathname === rfpPath || pathname.startsWith(rfpPath + "/");
  const isGaps = pathname === gapsPath || pathname.startsWith(gapsPath + "/");

  const tabStyle = (active: boolean): React.CSSProperties => ({
    fontSize: 13.5,
    fontWeight: active ? 600 : 400,
    padding: "8px 18px",
    textDecoration: "none",
    color: active ? "var(--ink)" : "var(--muted)",
    borderBottom: active ? "2px solid var(--ink)" : "2px solid transparent",
    marginBottom: -1,
    display: "inline-block",
    transition: "color 0.15s",
  });

  return (
    <div
      style={{
        display: "flex",
        borderBottom: "1px solid var(--border)",
        marginBottom: 20,
      }}
    >
      <Link href={`/opportunities/${id}`} style={tabStyle(!isRfp)}>
        Details
      </Link>
      <Link href={rfpPath} style={tabStyle(isRfp)}>
        RFP Response
      </Link>
      <Link href={gapsPath} style={tabStyle(isGaps)}>
        Evidence Gaps
      </Link>
    </div>
  );
}
