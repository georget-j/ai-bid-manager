"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
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

interface ExtractedItem {
  question_text: string;
  section_ref: string | null;
  question_type: string;
  question_class: string;
  sort_order: number;
  word_limit: number | null;
  is_mandatory: boolean;
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

function parseRetrySeconds(message: string): number {
  const minutesMatch = message.match(/(\d+)\s*minute/i);
  if (minutesMatch) return parseInt(minutesMatch[1], 10) * 60;
  const secondsMatch = message.match(/(\d+)\s*second/i);
  if (secondsMatch) return parseInt(secondsMatch[1], 10);
  return 3600;
}

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// ── DocExtractRow ─────────────────────────────────────────────────────────────

function DocExtractRow({
  doc,
  opportunityId,
  onExtracted,
}: {
  doc: NormalizedDocument;
  opportunityId: string;
  onExtracted: () => void;
}) {
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [retrySecondsLeft, setRetrySecondsLeft] = useState<number | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (retrySecondsLeft === null) return;
    if (retrySecondsLeft <= 0) {
      setRetrySecondsLeft(null);
      extract();
      return;
    }
    const t = setTimeout(
      () => setRetrySecondsLeft((s) => (s !== null ? s - 1 : null)),
      1000,
    );
    return () => clearTimeout(t);
  }, [retrySecondsLeft]); // eslint-disable-line react-hooks/exhaustive-deps

  const extract = useCallback(async () => {
    if (!doc.url) return;
    setExtracting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/opportunities/${opportunityId}/extract-from-document`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: doc.url }),
        },
      );
      const data = (await res.json()) as {
        questions_saved?: number;
        error?: string;
        message?: string;
        retryAfter?: string | null;
      };
      if (!res.ok) {
        if (res.status === 403 || data.error === "access-denied") {
          setError("portal-blocked");
        } else if (res.status === 429 || data.error === "rate-limited") {
          const secs = data.retryAfter
            ? parseInt(data.retryAfter, 10)
            : parseRetrySeconds(data.message ?? "");
          const waitSecs = isFinite(secs) && secs > 0 ? secs : 3600;
          setError(
            "rate-limited:" +
              (data.message ?? "Rate limited — retrying automatically."),
          );
          setRetrySecondsLeft(waitSecs);
        } else {
          setError(data.error ?? "Extraction failed");
        }
      } else {
        setDone(true);
        onExtracted();
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setExtracting(false);
    }
  }, [doc.url, opportunityId, onExtracted]);

  async function handleDroppedFile(file: File) {
    setUploadingFile(true);
    setError(null);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const extractRes = await fetch("/api/rfp/extract", {
        method: "POST",
        body: formData,
      });
      const extracted = (await extractRes.json()) as {
        questions?: Array<{
          id: number;
          text: string;
          section: string;
          topic: string;
          risk_level: string;
          question_class?: string;
        }>;
        error?: string;
      };
      if (!extractRes.ok || !extracted.questions) {
        setError(extracted.error ?? "Extraction failed");
        return;
      }
      const TOPIC_TO_TYPE: Record<string, string> = {
        security_compliance: "technical",
        legal: "general",
        pricing: "financial",
        technical: "technical",
        engineering: "technical",
        commercial: "general",
        implementation: "general",
        support: "general",
        general: "general",
      };
      const saveRes = await fetch(
        `/api/opportunities/${opportunityId}/questions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            questions: extracted.questions.map((q, i) => ({
              question_text: q.text,
              section_ref: q.section || null,
              question_type: TOPIC_TO_TYPE[q.topic] ?? "general",
              question_class: q.question_class ?? "question",
              sort_order: i,
              word_limit: null,
              is_mandatory: q.risk_level !== "low",
            })),
          }),
        },
      );
      if (saveRes.ok) {
        setDone(true);
        onExtracted();
      } else {
        const d = (await saveRes.json()) as { error?: string };
        setError(d.error ?? "Save failed");
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setUploadingFile(false);
    }
  }

  const isBlocked =
    error === "portal-blocked" || error?.startsWith("rate-limited:");
  const showDropZone = isBlocked && !done;

  return (
    <div style={{ borderBottom: "1px solid var(--border)", padding: "8px 0" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <span
            style={{
              fontSize: 13,
              color: "var(--ink)",
              display: "block",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {doc.title}
          </span>
          {error && !isBlocked && (
            <span style={{ fontSize: 11.5, color: "#dc2626" }}>{error}</span>
          )}
          {error === "portal-blocked" && (
            <span style={{ fontSize: 11.5, color: "#b45309", lineHeight: 1.5 }}>
              Requires authentication.{" "}
              {doc.url && (
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "#b45309", textDecoration: "underline" }}
                >
                  Download directly
                </a>
              )}{" "}
              then drop below.
            </span>
          )}
          {error?.startsWith("rate-limited:") && (
            <span style={{ fontSize: 11.5, color: "#b45309" }}>
              {retrySecondsLeft !== null
                ? `Rate limited — retrying in ${formatCountdown(retrySecondsLeft)}…`
                : error.slice("rate-limited:".length)}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          {doc.url && (
            <a
              href={doc.url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn ghost"
              style={{ fontSize: 12, padding: "4px 10px" }}
            >
              Open ↗
            </a>
          )}
          {done ? (
            <span
              style={{ fontSize: 12, color: "#059669", padding: "4px 10px" }}
            >
              ✓ Extracted
            </span>
          ) : retrySecondsLeft !== null ? (
            <button
              className="btn ghost"
              onClick={() => setRetrySecondsLeft(0)}
              style={{ fontSize: 12, padding: "4px 10px" }}
            >
              Retry now
            </button>
          ) : (
            <button
              className="btn primary"
              onClick={extract}
              disabled={extracting || !doc.url || uploadingFile}
              style={{ fontSize: 12, padding: "4px 10px" }}
            >
              {extracting || uploadingFile ? "Extracting…" : "Extract"}
            </button>
          )}
        </div>
      </div>
      {showDropZone && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOver(false);
            const file = e.dataTransfer.files[0];
            if (file) handleDroppedFile(file);
          }}
          onClick={() => fileInputRef.current?.click()}
          style={{
            marginTop: 8,
            padding: "10px 14px",
            borderRadius: "var(--r-sm)",
            border: `1.5px dashed ${isDragOver ? "var(--accent)" : "#d97706"}`,
            background: isDragOver
              ? "color-mix(in oklch, var(--accent) 8%, transparent)"
              : "color-mix(in oklch, #f59e0b 5%, transparent)",
            cursor: "pointer",
            textAlign: "center",
          }}
        >
          <p
            style={{
              fontSize: 12,
              color: isDragOver ? "var(--accent)" : "#92400e",
              margin: 0,
            }}
          >
            {uploadingFile
              ? "Extracting…"
              : isDragOver
                ? "Drop to extract"
                : "Drop downloaded file here · or click to browse"}
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.xlsx,.txt"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleDroppedFile(f);
            }}
          />
        </div>
      )}
    </div>
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
  const [extracting, setExtracting] = useState(false);
  const [extractPreview, setExtractPreview] = useState<ExtractedItem[] | null>(
    null,
  );
  const [extractError, setExtractError] = useState<string | null>(null);
  const [confirmReextract, setConfirmReextract] = useState(false);
  const [saving, setSaving] = useState(false);

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [extractingAll, setExtractingAll] = useState(false);
  const [allProgress, setAllProgress] = useState<{
    current: number;
    total: number;
    currentTitle: string;
    retryingIn?: number;
  } | null>(null);
  const [allErrors, setAllErrors] = useState<string[]>([]);

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

  // ── Fetch documents ─────────────────────────────────────────────────────────

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

  // ── Extract all docs ────────────────────────────────────────────────────────

  async function extractAllDocs() {
    if (accessibleDocs.length === 0) return;
    setExtractingAll(true);
    setAllErrors([]);
    const errors: string[] = [];
    for (let i = 0; i < accessibleDocs.length; i++) {
      const doc = accessibleDocs[i];
      setAllProgress({
        current: i + 1,
        total: accessibleDocs.length,
        currentTitle: doc.title,
      });
      let attempt = 0;
      while (attempt < 2) {
        try {
          const res = await fetch(
            `/api/opportunities/${opp.id}/extract-from-document`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ url: doc.url, append: i > 0 }),
            },
          );
          const data = (await res.json()) as {
            questions_saved?: number;
            error?: string;
            message?: string;
            retryAfter?: string | null;
          };
          if (!res.ok) {
            if (res.status === 429 || data.error === "rate-limited") {
              const secs = data.retryAfter
                ? parseInt(data.retryAfter, 10)
                : parseRetrySeconds(data.message ?? "");
              const waitSecs =
                isFinite(secs) && secs > 0 ? Math.min(secs, 120) : 120;
              if (attempt === 0) {
                for (let w = waitSecs; w > 0; w--) {
                  setAllProgress({
                    current: i + 1,
                    total: accessibleDocs.length,
                    currentTitle: doc.title,
                    retryingIn: w,
                  });
                  await new Promise((r) => setTimeout(r, 1000));
                }
                attempt++;
                continue;
              } else {
                errors.push(
                  `${doc.title}: rate limited — drop the file onto the row to extract manually`,
                );
              }
            } else if (res.status === 403 || data.error === "access-denied") {
              errors.push(
                `${doc.title}: requires authentication — download manually and drop onto the row`,
              );
            } else {
              errors.push(`${doc.title}: ${data.error ?? "extraction failed"}`);
            }
          }
          break;
        } catch {
          errors.push(`${doc.title}: network error`);
          break;
        }
      }
    }
    setAllProgress(null);
    setAllErrors(errors);
    setExtractingAll(false);
    refreshCounts();
  }

  // ── Extract from description ─────────────────────────────────────────────────

  async function extractFromDescription() {
    setExtracting(true);
    setExtractError(null);
    setExtractPreview(null);
    try {
      const res = await fetch(
        `/api/opportunities/${opp.id}/extract-questions`,
        { method: "POST" },
      );
      const data = (await res.json()) as {
        questions?: ExtractedItem[];
        error?: string;
      };
      if (!res.ok || !data.questions) {
        setExtractError(data.error ?? "Extraction failed");
      } else {
        setExtractPreview(data.questions);
      }
    } catch {
      setExtractError("Network error — please try again.");
    } finally {
      setExtracting(false);
    }
  }

  async function saveExtracted() {
    if (!extractPreview) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/opportunities/${opp.id}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions: extractPreview }),
      });
      if (res.ok) {
        setExtractPreview(null);
        setConfirmReextract(false);
        refreshCounts();
      }
    } finally {
      setSaving(false);
    }
  }

  // ── Upload file ──────────────────────────────────────────────────────────────

  async function handleFileUpload(file: File) {
    setUploading(true);
    setUploadError(null);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const extractRes = await fetch("/api/rfp/extract", {
        method: "POST",
        body: formData,
      });
      const extracted = (await extractRes.json()) as {
        questions?: Array<{
          id: number;
          text: string;
          section: string;
          topic: string;
          risk_level: string;
          question_class?: string;
        }>;
        error?: string;
      };
      if (!extractRes.ok || !extracted.questions) {
        setUploadError(extracted.error ?? "Extraction failed");
        return;
      }
      const TOPIC_TO_TYPE: Record<string, string> = {
        security_compliance: "technical",
        legal: "general",
        pricing: "financial",
        technical: "technical",
        engineering: "technical",
        commercial: "general",
        implementation: "general",
        support: "general",
        general: "general",
      };
      const saveRes = await fetch(`/api/opportunities/${opp.id}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questions: extracted.questions.map((q, i) => ({
            question_text: q.text,
            section_ref: q.section || null,
            question_type: TOPIC_TO_TYPE[q.topic] ?? "general",
            question_class: q.question_class ?? "question",
            sort_order: i,
            word_limit: null,
            is_mandatory: q.risk_level !== "low",
          })),
        }),
      });
      if (saveRes.ok) {
        setUploadFile(null);
        refreshCounts();
      } else {
        const d = (await saveRes.json()) as { error?: string };
        setUploadError(d.error ?? "Save failed");
      }
    } catch {
      setUploadError("Network error — please try again.");
    } finally {
      setUploading(false);
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

      {/* ── Step 3: Tender documents ── */}
      <div className="card card-pad">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            marginBottom: 16,
          }}
        >
          <SectionHeading
            step="3"
            title="Tender documents"
            subtitle="Extract requirements and questions directly from ITT documents."
          />
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            {accessibleDocs.length >= 2 && (
              <button
                className="btn primary"
                onClick={extractAllDocs}
                disabled={extractingAll}
                style={{ fontSize: 12, padding: "4px 12px" }}
              >
                {extractingAll ? "Extracting…" : "Extract all"}
              </button>
            )}
            {docs.length === 0 && (
              <button
                className="btn ghost"
                onClick={fetchDocuments}
                disabled={fetchingDocs}
                style={{ fontSize: 12, padding: "4px 12px" }}
              >
                {fetchingDocs ? "Fetching…" : "Fetch documents"}
              </button>
            )}
          </div>
        </div>

        {/* Extract-all progress */}
        {allProgress && (
          <div
            style={{
              marginBottom: 12,
              padding: "8px 12px",
              background:
                "color-mix(in oklch, var(--accent) 8%, var(--surface))",
              borderRadius: "var(--r-sm)",
              border:
                "1px solid color-mix(in oklch, var(--accent) 20%, transparent)",
              fontSize: 12.5,
              color: "var(--ink)",
            }}
          >
            {allProgress.retryingIn ? (
              <span style={{ color: "#b45309" }}>
                Rate limited on {allProgress.currentTitle} — retrying in{" "}
                {formatCountdown(allProgress.retryingIn)}…
              </span>
            ) : (
              <>
                <span style={{ color: "var(--muted)" }}>
                  Extracting {allProgress.current} of {allProgress.total}:
                </span>{" "}
                {allProgress.currentTitle}
              </>
            )}
            <span
              style={{
                display: "block",
                marginTop: 6,
                height: 3,
                borderRadius: 99,
                background: "var(--border)",
              }}
            >
              <span
                style={{
                  display: "block",
                  height: "100%",
                  borderRadius: 99,
                  background: allProgress.retryingIn
                    ? "#d97706"
                    : "var(--accent)",
                  width: `${Math.round((allProgress.current / allProgress.total) * 100)}%`,
                  transition: "width 300ms ease",
                }}
              />
            </span>
          </div>
        )}

        {allErrors.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            {allErrors.map((e, i) => (
              <p key={i} style={{ fontSize: 11.5, color: "#b45309" }}>
                {e}
              </p>
            ))}
          </div>
        )}

        {fetchDocsError && (
          <p style={{ fontSize: 12.5, color: "#dc2626", marginBottom: 12 }}>
            {fetchDocsError}
          </p>
        )}

        {accessibleDocs.length > 0 ? (
          <div style={{ marginBottom: 14 }}>
            {accessibleDocs.map((doc, i) => (
              <DocExtractRow
                key={doc.id ?? doc.url ?? i}
                doc={doc}
                opportunityId={opp.id}
                onExtracted={refreshCounts}
              />
            ))}
          </div>
        ) : (
          <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 14 }}>
            {fetchingDocs
              ? "Fetching…"
              : "No accessible documents found. Try fetching from source, or upload a file below."}
          </p>
        )}

        {/* Manual upload */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <label
            style={{
              fontSize: 12,
              color: "var(--muted)",
              cursor: "pointer",
            }}
          >
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
                onClick={() => handleFileUpload(uploadFile)}
                disabled={uploading}
                style={{ fontSize: 12, padding: "4px 12px" }}
              >
                {uploading ? "Extracting…" : "Extract questions"}
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
      </div>

      {/* ── Step 4: Extract from description ── */}
      <div className="card card-pad">
        <SectionHeading
          step="4"
          title="Extract from description"
          subtitle="If no documents are available, extract requirements and questions from the tender description."
        />

        {counts.total > 0 && !confirmReextract && !extractPreview ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", gap: 8 }}>
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
            <button
              className="btn ghost"
              onClick={() => setConfirmReextract(true)}
              style={{ fontSize: 12, padding: "4px 12px" }}
            >
              Re-extract
            </button>
          </div>
        ) : null}

        {confirmReextract && !extractPreview && (
          <div
            style={{
              padding: "10px 14px",
              background: "#fef3c7",
              border: "1px solid #fcd34d",
              borderRadius: "var(--r-sm)",
              fontSize: 13,
              color: "#92400e",
              marginBottom: 12,
            }}
          >
            Re-extracting will replace the {counts.total} existing item
            {counts.total !== 1 ? "s" : ""}.
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button
                className="btn primary"
                onClick={extractFromDescription}
                disabled={extracting}
                style={{ fontSize: 12, padding: "4px 12px" }}
              >
                {extracting ? "Extracting…" : "Confirm re-extract"}
              </button>
              <button
                className="btn ghost"
                onClick={() => setConfirmReextract(false)}
                style={{ fontSize: 12, padding: "4px 12px" }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {counts.total === 0 && !extractPreview && (
          <div>
            <button
              className="btn primary"
              onClick={extractFromDescription}
              disabled={extracting || !description}
              style={{ fontSize: 13, padding: "7px 18px" }}
            >
              {extracting ? "Extracting…" : "Extract requirements & questions"}
            </button>
            {extractError && (
              <p
                style={{
                  fontSize: 12.5,
                  color: "#dc2626",
                  marginTop: 8,
                }}
              >
                {extractError}
              </p>
            )}
          </div>
        )}

        {extractPreview && (
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                marginBottom: 10,
              }}
            >
              <p style={{ fontSize: 13, color: "var(--ink)", margin: 0 }}>
                Found{" "}
                <strong>
                  {
                    extractPreview.filter(
                      (q) => q.question_class === "requirement",
                    ).length
                  }{" "}
                  requirements
                </strong>{" "}
                and{" "}
                <strong>
                  {
                    extractPreview.filter(
                      (q) => q.question_class === "question",
                    ).length
                  }{" "}
                  questions
                </strong>
                .
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="btn primary"
                  onClick={saveExtracted}
                  disabled={saving}
                  style={{ fontSize: 12, padding: "4px 14px" }}
                >
                  {saving ? "Saving…" : `Save ${extractPreview.length} items`}
                </button>
                <button
                  className="btn ghost"
                  onClick={() => setExtractPreview(null)}
                  style={{ fontSize: 12, padding: "4px 10px" }}
                >
                  Discard
                </button>
              </div>
            </div>
            <div
              style={{
                maxHeight: 240,
                overflowY: "auto",
                border: "1px solid var(--border)",
                borderRadius: "var(--r-sm)",
              }}
            >
              {extractPreview.map((item, i) => (
                <div
                  key={i}
                  style={{
                    padding: "8px 12px",
                    borderBottom:
                      i < extractPreview.length - 1
                        ? "1px solid var(--border)"
                        : "none",
                    display: "flex",
                    gap: 10,
                    alignItems: "flex-start",
                  }}
                >
                  <span
                    style={{
                      fontSize: 10.5,
                      padding: "1px 6px",
                      borderRadius: 999,
                      background:
                        item.question_class === "requirement"
                          ? "#dbeafe"
                          : item.question_class === "guidance"
                            ? "#f3f4f6"
                            : "#d1fae5",
                      color:
                        item.question_class === "requirement"
                          ? "#1d4ed8"
                          : item.question_class === "guidance"
                            ? "#6b7280"
                            : "#065f46",
                      flexShrink: 0,
                      marginTop: 1,
                      textTransform: "capitalize",
                    }}
                  >
                    {item.question_class}
                  </span>
                  <p
                    style={{
                      fontSize: 12.5,
                      color: "var(--ink)",
                      margin: 0,
                      lineHeight: 1.5,
                    }}
                  >
                    {item.question_text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Step 5: Requirements compliance statements ── */}
      {counts.requirements > 0 && (
        <div className="card card-pad">
          <SectionHeading
            step="5"
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

      {/* ── Step 6: Questions & answers ── */}
      {counts.questions > 0 && (
        <div className="card card-pad">
          <SectionHeading
            step="6"
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

      {/* ── Step 7: Export ── */}
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
