"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { QuestionsPanel } from "../QuestionsPanel";
import type { NormalizedDocument } from "@/lib/procurement/types";

// ── Shared file-upload + extract helper ──────────────────────────────────────

async function extractFromFile(
  file: File,
  opportunityId: string,
  append: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const formData = new FormData();
  formData.append("file", file);

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
    return { ok: false, error: extracted.error ?? "Extraction failed" };
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

  const saveRes = await fetch(`/api/opportunities/${opportunityId}/questions`, {
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
        append,
      })),
    }),
  });

  if (!saveRes.ok) {
    const d = (await saveRes.json()) as { error?: string };
    return { ok: false, error: d.error ?? "Save failed" };
  }
  return { ok: true };
}

// ── Per-document row ──────────────────────────────────────────────────────────

function DocExtractRow({
  doc,
  opportunityId,
  onExtracted,
}: {
  doc: NormalizedDocument & { url?: string | null };
  opportunityId: string;
  onExtracted: () => void;
}) {
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [retrySecondsLeft, setRetrySecondsLeft] = useState<number | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const retryTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Countdown timer — auto-retries when it reaches 0
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

  useEffect(() => {
    return () => {
      if (retryTimer.current) clearInterval(retryTimer.current);
    };
  }, []);

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
        cached?: boolean;
        error?: string;
        message?: string;
        retryAfter?: string | null;
      };
      if (!res.ok) {
        if (res.status === 403 || data.error === "access-denied") {
          setError("portal-blocked");
        } else if (res.status === 429 || data.error === "rate-limited") {
          // Parse retry-after: prefer header value, then message text
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
    const result = await extractFromFile(file, opportunityId, false);
    if (result.ok) {
      setDone(true);
      onExtracted();
    } else {
      setError(result.error ?? "Upload failed");
    }
    setUploadingFile(false);
  }

  const isBlocked =
    error === "portal-blocked" || error?.startsWith("rate-limited:");
  const showDropZone = isBlocked && !done;

  return (
    <div
      style={{
        borderBottom: "1px solid var(--border)",
        padding: "8px 0",
      }}
    >
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
              then drop below or use Upload file.
            </span>
          )}

          {error?.startsWith("rate-limited:") && (
            <span style={{ fontSize: 11.5, color: "#b45309", lineHeight: 1.5 }}>
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
              {extracting || uploadingFile
                ? "Extracting…"
                : "Extract questions"}
            </button>
          )}
        </div>
      </div>

      {/* Drop zone — shown when blocked/rate-limited */}
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
            transition: "all 0.15s",
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
                : "Drop downloaded file here to extract · or click to browse"}
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseRetrySeconds(message: string): number {
  // "Try again in up to 60 minutes" → 3600
  // "retry after 120 seconds" → 120
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

// ── Main component ────────────────────────────────────────────────────────────

export function RFPResponseContent({
  opportunityId,
  opportunityTitle,
  docs,
}: {
  opportunityId: string;
  opportunityTitle: string;
  docs: (NormalizedDocument & { url?: string | null })[];
}) {
  const [refreshKey, setRefreshKey] = useState(0);
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

  const accessibleDocs = docs.filter((d) => d.url);

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
            `/api/opportunities/${opportunityId}/extract-from-document`,
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
                // Show countdown and auto-retry once
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
                continue; // retry
              } else {
                errors.push(
                  `${doc.title}: rate limited — drop the file onto the document row to extract manually`,
                );
              }
            } else if (res.status === 403 || data.error === "access-denied") {
              errors.push(
                `${doc.title}: requires authentication — download manually and drop onto the row below`,
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
    setRefreshKey((k) => k + 1);
  }

  async function handleFileUpload(file: File) {
    setUploading(true);
    setUploadError(null);
    const result = await extractFromFile(file, opportunityId, false);
    if (result.ok) {
      setUploadFile(null);
      setRefreshKey((k) => k + 1);
    } else {
      setUploadError(result.error ?? "Upload failed");
    }
    setUploading(false);
  }

  return (
    <>
      {/* Tender document extraction strip */}
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 10,
            gap: 10,
          }}
        >
          <div className="eyebrow">Extract from tender documents</div>
          {accessibleDocs.length >= 1 && (
            <button
              className="btn primary"
              onClick={extractAllDocs}
              disabled={extractingAll}
              style={{ fontSize: 12, padding: "4px 14px", flexShrink: 0 }}
            >
              {extractingAll ? "Extracting…" : "Extract all documents"}
            </button>
          )}
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
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    display: "inline-block",
                    maxWidth: 260,
                    verticalAlign: "bottom",
                  }}
                >
                  {allProgress.currentTitle}
                </span>
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

        {/* Per-run errors */}
        {allErrors.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            {allErrors.map((e, i) => (
              <p key={i} style={{ fontSize: 11.5, color: "#b45309" }}>
                {e}
              </p>
            ))}
          </div>
        )}

        <p
          style={{
            fontSize: 12.5,
            color: "var(--muted)",
            marginBottom: 12,
            lineHeight: 1.5,
          }}
        >
          Extract questions from all accessible documents at once. Rate-limited
          documents retry automatically. Portal-blocked or still-limited
          documents show a drop zone — download and drop the file directly.
        </p>

        {accessibleDocs.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            {accessibleDocs.map((doc, i) => (
              <DocExtractRow
                key={doc.id ?? doc.url ?? i}
                doc={doc}
                opportunityId={opportunityId}
                onExtracted={() => setRefreshKey((k) => k + 1)}
              />
            ))}
          </div>
        )}

        {/* Manual upload fallback */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            paddingTop: accessibleDocs.length > 0 ? 10 : 0,
          }}
        >
          <label
            style={{
              fontSize: 12,
              color: "var(--muted)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
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

      {/* Questions panel */}
      <QuestionsPanel
        key={refreshKey}
        opportunityId={opportunityId}
        opportunityTitle={opportunityTitle}
      />
    </>
  );
}
