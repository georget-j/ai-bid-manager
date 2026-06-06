"use client";

import { useState } from "react";
import type { NormalizedDocument } from "@/lib/procurement/types";
import { RequirementsSection } from "./RequirementsSection";
import { QuestionsSection, ExportSection } from "./QuestionsSection";

// ── Types ─────────────────────────────────────────────────────────────────────

interface OppData {
  id: string;
  title: string;
  buyer_name: string | null;
  buyer_region: string | null;
  description: string | null;
  source_url: string | null;
  submission_url: string | null;
  value_amount: number | null;
  value_currency: string | null;
  deadline_at: string | null;
  contract_start_at: string | null;
  contract_end_at: string | null;
  notice_type: string | null;
  procurement_stage: string;
  status: string;
  cpv_codes: string[];
  framework_flag: boolean;
}

interface QuestionCounts {
  requirements: number;
  questions: number;
  guidance: number;
  total: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatValue(amount: number | null | undefined, currency = "GBP") {
  if (!amount) return null;
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency || "GBP",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  return Math.ceil(
    (new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );
}

// ── Section heading ───────────────────────────────────────────────────────────

function SectionHeading({
  step,
  title,
  subtitle,
}: {
  step: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: subtitle ? 4 : 0,
        }}
      >
        <span
          style={{
            width: 26,
            height: 26,
            borderRadius: "50%",
            background: "var(--accent)",
            color: "#fff",
            fontSize: 12,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {step}
        </span>
        <h2
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: "var(--ink)",
            margin: 0,
          }}
        >
          {title}
        </h2>
      </div>
      {subtitle && (
        <p
          style={{
            fontSize: 12.5,
            color: "var(--muted)",
            margin: "4px 0 0 36px",
          }}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function RFPWorkflow({
  opp,
  initialDocs,
  initialCounts,
}: {
  opp: OppData;
  initialDocs: NormalizedDocument[];
  initialCounts: QuestionCounts;
}) {
  const [summary, setSummary] = useState("");
  const [summarising, setSummarising] = useState(false);
  const [showFullDescription, setShowFullDescription] = useState(false);

  const [docs, setDocs] = useState<NormalizedDocument[]>(initialDocs);
  const [fetchingDocs, setFetchingDocs] = useState(false);
  const [fetchDocsError, setFetchDocsError] = useState<string | null>(null);

  const [counts, setCounts] = useState<QuestionCounts>(initialCounts);
  const [approvalKey, setApprovalKey] = useState(0);

  const [gettingDetails, setGettingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [detailsResult, setDetailsResult] = useState<
    (QuestionCounts & { sources: string[] }) | null
  >(null);

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const days = daysUntil(opp.deadline_at);
  const accessibleDocs = docs.filter((d) => d.url);

  // ── AI summary ──────────────────────────────────────────────────────────────

  async function generateSummary() {
    setSummarising(true);
    setSummary("");
    try {
      const res = await fetch(`/api/opportunities/${opp.id}/summarise`, {
        method: "POST",
      });
      if (!res.ok || !res.body) {
        setSummary("• Summary unavailable — please try again.");
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let text = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        setSummary(text);
      }
    } catch {
      setSummary("• Summary unavailable — please try again.");
    } finally {
      setSummarising(false);
    }
  }

  // ── Fetch documents (discovery) ───────────────────────────────────────────────

  async function fetchDocuments() {
    setFetchingDocs(true);
    setFetchDocsError(null);
    try {
      const res = await fetch(`/api/opportunities/${opp.id}/fetch-documents`, {
        method: "POST",
      });
      const data = (await res.json()) as {
        documents?: NormalizedDocument[];
        error?: string;
      };
      if (res.ok && data.documents) {
        setDocs(data.documents.filter((d) => d.url));
      } else {
        setFetchDocsError(data.error ?? "Could not fetch documents");
      }
    } catch {
      setFetchDocsError("Network error");
    } finally {
      setFetchingDocs(false);
    }
  }

  // ── Refresh counts ───────────────────────────────────────────────────────────

  async function refreshCounts() {
    try {
      const res = await fetch(`/api/opportunities/${opp.id}/questions`);
      const data = (await res.json()) as {
        questions?: Array<{ question_class: string }>;
      };
      const arr = data.questions ?? [];
      setCounts({
        requirements: arr.filter((q) => q.question_class === "requirement")
          .length,
        questions: arr.filter((q) => q.question_class === "question").length,
        guidance: arr.filter((q) => q.question_class === "guidance").length,
        total: arr.length,
      });
    } catch {
      // silently fail
    }
  }

  // ── Get all details (unified extraction) ──────────────────────────────────────

  async function getAllDetails() {
    setGettingDetails(true);
    setDetailsError(null);
    try {
      const res = await fetch(`/api/opportunities/${opp.id}/extract-all`, {
        method: "POST",
      });
      const data = (await res.json()) as {
        counts?: QuestionCounts;
        sources?: string[];
        error?: string;
      };
      if (!res.ok || !data.counts) {
        setDetailsError(data.error ?? "Extraction failed");
        return;
      }
      setCounts(data.counts);
      setDetailsResult({ ...data.counts, sources: data.sources ?? [] });
    } catch {
      setDetailsError("Network error — please try again.");
    } finally {
      setGettingDetails(false);
    }
  }

  // ── Manual upload (portal-locked docs) → central store, then re-extract ────────

  async function uploadTenderFile(file: File) {
    setUploading(true);
    setUploadError(null);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch(
        `/api/opportunities/${opp.id}/tender-documents/upload`,
        { method: "POST", body: formData },
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setUploadError(
          data.error === "access-denied"
            ? "Could not read this file."
            : (data.error ?? "Upload failed"),
        );
        return;
      }
      setUploadFile(null);
      await getAllDetails();
    } catch {
      setUploadError("Network error — please try again.");
    } finally {
      setUploading(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  const description = opp.description ?? "";
  const DESCRIPTION_PREVIEW = 500;
  const descriptionTruncated =
    description.length > DESCRIPTION_PREVIEW && !showFullDescription;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* ── Step 1: Tender Overview ── */}
      <div className="card card-pad">
        <SectionHeading step="1" title="Tender overview" />

        {/* Header row */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 16,
            flexWrap: "wrap",
            marginBottom: 16,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3
              style={{
                fontSize: 18,
                fontFamily: "var(--font-serif)",
                lineHeight: 1.3,
                margin: "0 0 6px",
              }}
            >
              {opp.title}
            </h3>
            {opp.buyer_name && (
              <p style={{ fontSize: 13.5, color: "var(--ink-2)", margin: 0 }}>
                {opp.buyer_name}
                {opp.buyer_region ? ` · ${opp.buyer_region}` : ""}
              </p>
            )}
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              gap: 6,
              flexShrink: 0,
            }}
          >
            {opp.value_amount && (
              <span
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  fontFamily: "var(--font-mono)",
                  color: "var(--ink)",
                }}
              >
                {formatValue(
                  Number(opp.value_amount),
                  opp.value_currency ?? "GBP",
                )}
              </span>
            )}
            {opp.framework_flag && (
              <span
                style={{
                  fontSize: 11,
                  padding: "2px 8px",
                  borderRadius: 999,
                  background: "#dbeafe",
                  color: "#1d4ed8",
                  fontWeight: 600,
                }}
              >
                Framework
              </span>
            )}
          </div>
        </div>

        {/* Deadline banner */}
        {days !== null && (
          <div
            style={{
              padding: "8px 14px",
              borderRadius: "var(--r-sm)",
              background:
                days <= 0
                  ? "#f3f4f6"
                  : days <= 7
                    ? "#fee2e2"
                    : days <= 21
                      ? "#fef3c7"
                      : "var(--surface-2)",
              color:
                days <= 0
                  ? "#6b7280"
                  : days <= 7
                    ? "#dc2626"
                    : days <= 21
                      ? "#b45309"
                      : "var(--ink-2)",
              fontSize: 13,
              fontWeight: days > 0 && days <= 7 ? 600 : 400,
              marginBottom: 14,
            }}
          >
            {days < 0
              ? `Deadline passed · ${formatDate(opp.deadline_at)}`
              : days === 0
                ? `Deadline today · ${formatDate(opp.deadline_at)}`
                : `${days} day${days === 1 ? "" : "s"} until deadline · ${formatDate(opp.deadline_at)}`}
          </div>
        )}

        {/* Key details grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: "8px 16px",
            marginBottom: 14,
          }}
        >
          {opp.notice_type && (
            <div>
              <span
                style={{
                  fontSize: 11,
                  color: "var(--muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Notice type
              </span>
              <p
                style={{ fontSize: 13, color: "var(--ink)", margin: "2px 0 0" }}
              >
                {opp.notice_type}
              </p>
            </div>
          )}
          {opp.procurement_stage && opp.procurement_stage !== "unknown" && (
            <div>
              <span
                style={{
                  fontSize: 11,
                  color: "var(--muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Stage
              </span>
              <p
                style={{ fontSize: 13, color: "var(--ink)", margin: "2px 0 0" }}
              >
                {opp.procurement_stage}
              </p>
            </div>
          )}
          {opp.contract_start_at && (
            <div>
              <span
                style={{
                  fontSize: 11,
                  color: "var(--muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Contract start
              </span>
              <p
                style={{ fontSize: 13, color: "var(--ink)", margin: "2px 0 0" }}
              >
                {formatDate(opp.contract_start_at)}
              </p>
            </div>
          )}
          {opp.contract_end_at && (
            <div>
              <span
                style={{
                  fontSize: 11,
                  color: "var(--muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Contract end
              </span>
              <p
                style={{ fontSize: 13, color: "var(--ink)", margin: "2px 0 0" }}
              >
                {formatDate(opp.contract_end_at)}
              </p>
            </div>
          )}
          {opp.cpv_codes?.length > 0 && (
            <div style={{ gridColumn: "1 / -1" }}>
              <span
                style={{
                  fontSize: 11,
                  color: "var(--muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                CPV codes
              </span>
              <p
                style={{
                  fontSize: 12.5,
                  color: "var(--ink)",
                  margin: "2px 0 0",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {opp.cpv_codes.join(" · ")}
              </p>
            </div>
          )}
        </div>

        {/* Links */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {opp.source_url && (
            <a
              href={opp.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn ghost"
              style={{ fontSize: 12, padding: "4px 12px" }}
            >
              View source notice ↗
            </a>
          )}
          {opp.submission_url && (
            <a
              href={opp.submission_url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn ghost"
              style={{ fontSize: 12, padding: "4px 12px" }}
            >
              Submit here ↗
            </a>
          )}
        </div>
      </div>

      {/* ── Step 2: What this tender wants ── */}
      <div className="card card-pad">
        <SectionHeading
          step="2"
          title="What this tender wants"
          subtitle="Read the summary to understand the buyer's needs before extracting questions."
        />

        {description ? (
          <>
            <p
              style={{
                fontSize: 13.5,
                lineHeight: 1.7,
                color: "var(--ink-2)",
                whiteSpace: "pre-wrap",
                marginBottom: 8,
              }}
            >
              {descriptionTruncated
                ? description.slice(0, DESCRIPTION_PREVIEW) + "…"
                : description}
            </p>
            {description.length > DESCRIPTION_PREVIEW && (
              <button
                className="btn ghost"
                onClick={() => setShowFullDescription((v) => !v)}
                style={{ fontSize: 12, padding: "3px 10px", marginBottom: 14 }}
              >
                {showFullDescription ? "Show less" : "Show more"}
              </button>
            )}
          </>
        ) : (
          <p
            style={{
              fontSize: 13,
              color: "var(--muted)",
              marginBottom: 14,
            }}
          >
            No description available for this opportunity.
          </p>
        )}

        {/* AI Summary */}
        {summary ? (
          <div
            style={{
              padding: "12px 16px",
              background: "var(--surface-2)",
              borderRadius: "var(--r-sm)",
              border: "1px solid var(--border)",
              marginTop: 4,
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--muted)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: 8,
              }}
            >
              AI summary
            </div>
            <p
              style={{
                fontSize: 13.5,
                lineHeight: 1.75,
                color: "var(--ink)",
                margin: 0,
                whiteSpace: "pre-wrap",
              }}
            >
              {summary}
            </p>
            <button
              className="btn ghost"
              onClick={generateSummary}
              disabled={summarising}
              style={{ fontSize: 11, padding: "2px 8px", marginTop: 10 }}
            >
              Regenerate
            </button>
          </div>
        ) : (
          <button
            className="btn"
            onClick={generateSummary}
            disabled={summarising || !description}
            style={{ fontSize: 13, padding: "6px 16px" }}
          >
            {summarising ? "Summarising…" : "Summarise with AI"}
          </button>
        )}
      </div>

      {/* ── Step 3: Get all details ── */}
      <div className="card card-pad">
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 10,
            marginBottom: 16,
          }}
        >
          <SectionHeading
            step="3"
            title="Extract requirements & questions"
            subtitle="Pull every requirement and question from the description and all tender documents into one list — each tagged with where it came from."
          />
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <button
              className="btn primary"
              onClick={getAllDetails}
              disabled={gettingDetails}
              style={{ fontSize: 12, padding: "5px 14px" }}
            >
              {gettingDetails
                ? "Working…"
                : counts.total > 0
                  ? "Re-extract all"
                  : "Get all details"}
            </button>
            {docs.length === 0 && (
              <button
                className="btn ghost"
                onClick={fetchDocuments}
                disabled={fetchingDocs}
                style={{ fontSize: 12, padding: "5px 14px" }}
              >
                {fetchingDocs ? "Finding…" : "Find documents"}
              </button>
            )}
          </div>
        </div>

        {/* Working note */}
        {gettingDetails && (
          <p
            style={{
              fontSize: 12.5,
              color: "var(--muted)",
              marginBottom: 12,
            }}
          >
            Reading the description and tender documents, then extracting
            requirements and questions…
          </p>
        )}

        {/* Result summary */}
        {detailsResult && !gettingDetails && (
          <div
            style={{
              marginBottom: 12,
              padding: "10px 14px",
              background: "#d1fae5",
              border: "1px solid #6ee7b7",
              borderRadius: "var(--r-sm)",
              fontSize: 13,
              color: "#065f46",
            }}
          >
            ✓ Found <strong>{detailsResult.requirements}</strong> requirement
            {detailsResult.requirements !== 1 ? "s" : ""} and{" "}
            <strong>{detailsResult.questions}</strong> question
            {detailsResult.questions !== 1 ? "s" : ""}
            {detailsResult.guidance > 0
              ? ` (+ ${detailsResult.guidance} guidance)`
              : ""}
            .
            {detailsResult.sources.length > 0 && (
              <div style={{ fontSize: 11.5, color: "#047857", marginTop: 4 }}>
                Sources: {detailsResult.sources.join(" · ")}
              </div>
            )}
          </div>
        )}

        {/* Current counts (when already extracted, before a fresh run) */}
        {counts.total > 0 && !detailsResult && !gettingDetails && (
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {counts.requirements > 0 && (
              <span
                style={{
                  fontSize: 12,
                  padding: "3px 10px",
                  borderRadius: 99,
                  background: "#dbeafe",
                  color: "#1d4ed8",
                  fontWeight: 600,
                }}
              >
                {counts.requirements} requirement
                {counts.requirements !== 1 ? "s" : ""}
              </span>
            )}
            {counts.questions > 0 && (
              <span
                style={{
                  fontSize: 12,
                  padding: "3px 10px",
                  borderRadius: 99,
                  background: "#d1fae5",
                  color: "#065f46",
                  fontWeight: 600,
                }}
              >
                {counts.questions} question{counts.questions !== 1 ? "s" : ""}
              </span>
            )}
            {counts.guidance > 0 && (
              <span
                style={{
                  fontSize: 12,
                  padding: "3px 10px",
                  borderRadius: 99,
                  background: "var(--surface-2)",
                  color: "var(--muted)",
                }}
              >
                {counts.guidance} guidance
              </span>
            )}
          </div>
        )}

        {detailsError && (
          <p style={{ fontSize: 12.5, color: "#dc2626", marginBottom: 12 }}>
            {detailsError}
          </p>
        )}
        {fetchDocsError && (
          <p style={{ fontSize: 12.5, color: "#dc2626", marginBottom: 12 }}>
            {fetchDocsError}
          </p>
        )}

        {/* Tender documents (context) */}
        {accessibleDocs.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--muted)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: 6,
              }}
            >
              Tender documents ({accessibleDocs.length})
            </div>
            {accessibleDocs.map((doc, i) => (
              <div
                key={doc.id ?? doc.url ?? i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "7px 0",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <span
                  style={{
                    fontSize: 13,
                    color: "var(--ink)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  {doc.title}
                </span>
                {doc.url && (
                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn ghost"
                    style={{
                      fontSize: 12,
                      padding: "3px 10px",
                      flexShrink: 0,
                    }}
                  >
                    Open ↗
                  </a>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Manual upload (portal-locked fallback) */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <label style={{ cursor: "pointer" }}>
            <input
              type="file"
              accept=".pdf,.docx,.xlsx,.txt,.md"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setUploadFile(f);
              }}
            />
            <span
              className="btn ghost"
              style={{ fontSize: 12, padding: "4px 12px" }}
            >
              Upload file…
            </span>
          </label>
          {uploadFile && (
            <>
              <span
                style={{
                  fontSize: 12,
                  color: "var(--ink)",
                  maxWidth: 200,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {uploadFile.name}
              </span>
              <button
                className="btn primary"
                onClick={() => uploadTenderFile(uploadFile)}
                disabled={uploading}
                style={{ fontSize: 12, padding: "4px 12px" }}
              >
                {uploading ? "Adding…" : "Add & extract"}
              </button>
              <button
                className="btn ghost"
                onClick={() => setUploadFile(null)}
                style={{ fontSize: 12, padding: "4px 8px" }}
              >
                ✕
              </button>
            </>
          )}
          {uploadError && (
            <span style={{ fontSize: 12, color: "#dc2626" }}>
              {uploadError}
            </span>
          )}
        </div>
        <p style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 8 }}>
          Portal-locked document? Download it and upload here — it&apos;ll be
          stored and included in the extraction.
        </p>
      </div>

      {/* ── Step 4: Requirements compliance statements ── */}
      {counts.requirements > 0 && (
        <div className="card card-pad">
          <SectionHeading
            step="4"
            title="Compliance requirements"
            subtitle="Draft a compliance statement for each requirement using your knowledge base."
          />
          <RequirementsSection
            opportunityId={opp.id}
            initialTotal={counts.requirements}
            onApproval={() => setApprovalKey((k) => k + 1)}
          />
        </div>
      )}

      {/* ── Step 5: Questions & answers ── */}
      {counts.questions > 0 && (
        <div className="card card-pad">
          <SectionHeading
            step="5"
            title="Questions to answer"
            subtitle="AI drafts each answer from your knowledge base. Review, edit, and approve before exporting."
          />
          <QuestionsSection
            opportunityId={opp.id}
            initialTotal={counts.questions}
            onApproval={() => setApprovalKey((k) => k + 1)}
          />
        </div>
      )}

      {/* ── Step 6: Export ── */}
      {counts.total > 0 && (
        <ExportSection
          opportunityId={opp.id}
          requirements={counts.requirements}
          questions={counts.questions}
          approvalKey={approvalKey}
        />
      )}
    </div>
  );
}
