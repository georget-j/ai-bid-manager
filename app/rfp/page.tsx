import Link from "next/link";
import { RFPProcessor } from "@/components/RFPProcessor";

interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function RFPPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const initialTitle = params.title ?? "";
  const initialOpportunityId = params.opportunityId;

  return (
    <div style={{ maxWidth: 900 }}>
      <div className="page-head">
        <div className="title-block">
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            RFP Runs
          </div>
          <h1>
            RFP document <em>processor</em>
          </h1>
          <p className="subtitle">
            Upload a full RFP document. The agent will extract every requirement
            and draft a grounded response for each one — sourced from your
            knowledge base.
          </p>
        </div>
        <div className="actions">
          <Link href="/rfp/history" className="btn ghost sm">
            View history →
          </Link>
        </div>
      </div>

      {initialTitle && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: "var(--r-sm)",
            background: "var(--accent-tint)",
            color: "var(--accent)",
            fontSize: 13,
            marginBottom: 20,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
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
            <path d="M8 1v2M8 13v2M1 8h2M13 8h2" />
          </svg>
          <span>
            Starting RFP response for: <strong>{initialTitle}</strong>
          </span>
          {initialOpportunityId && (
            <Link
              href={`/opportunities/${initialOpportunityId}`}
              style={{
                marginLeft: "auto",
                fontSize: 12,
                color: "var(--accent)",
                textDecoration: "none",
              }}
            >
              ← Back to opportunity
            </Link>
          )}
        </div>
      )}

      <RFPProcessor
        initialTitle={initialTitle}
        initialOpportunityId={initialOpportunityId}
      />
    </div>
  );
}
