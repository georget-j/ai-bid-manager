import Link from "next/link";
import { notFound } from "next/navigation";
import { getOpportunity } from "@/lib/procurement/data";
import { OpportunityTabs } from "../OpportunityTabs";
import { RFPResponseContent } from "./RFPResponseContent";
import type { NormalizedDocument } from "@/lib/procurement/types";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function RFPResponsePage({ params }: PageProps) {
  const { id } = await params;
  const opp = await getOpportunity(id);
  if (!opp) notFound();

  const docs = ((opp.documents ?? []) as NormalizedDocument[]).filter(
    (d) => d.url,
  );

  return (
    <div style={{ maxWidth: 840 }}>
      <Link
        href={`/opportunities/${id}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 13,
          color: "var(--muted)",
          textDecoration: "none",
          marginBottom: 20,
        }}
      >
        ← Back to opportunity
      </Link>

      <div style={{ marginBottom: 20 }}>
        <div className="eyebrow" style={{ marginBottom: 4 }}>
          RFP Response
        </div>
        <h1
          style={{
            fontSize: 22,
            fontFamily: "var(--font-serif)",
            lineHeight: 1.25,
            marginBottom: 6,
          }}
        >
          {opp.title}
        </h1>
        {opp.buyer_name && (
          <p style={{ fontSize: 13.5, color: "var(--ink-2)" }}>
            {opp.buyer_name}
            {opp.buyer_region ? ` · ${opp.buyer_region}` : ""}
          </p>
        )}
      </div>

      <OpportunityTabs id={id} />

      <RFPResponseContent
        opportunityId={id}
        opportunityTitle={opp.title}
        docs={docs}
      />
    </div>
  );
}
