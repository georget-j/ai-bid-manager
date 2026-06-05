"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { QuestionsPanel } from "../QuestionsPanel";
import type { NormalizedDocument } from "@/lib/procurement/types";

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

  async function extract() {
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
      };
      if (!res.ok) {
        setError(data.error ?? "Extraction failed");
      } else {
        setDone(true);
        onExtracted();
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setExtracting(false);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "8px 0",
        borderBottom: "1px solid var(--border)",
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
        {error && (
          <span style={{ fontSize: 11.5, color: "#dc2626" }}>{error}</span>
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
          <span style={{ fontSize: 12, color: "#059669", padding: "4px 10px" }}>
            ✓ Extracted
          </span>
        ) : (
          <button
            className="btn primary"
            onClick={extract}
            disabled={extracting || !doc.url}
            style={{ fontSize: 12, padding: "4px 10px" }}
          >
            {extracting ? "Extracting…" : "Extract questions"}
          </button>
        )}
      </div>
    </div>
  );
}

export function RFPResponseContent({
  opportunityId,
  opportunityTitle,
  docs,
}: {
  opportunityId: string;
  opportunityTitle: string;
  docs: (NormalizedDocument & { url?: string | null })[];
}) {
  const router = useRouter();
  const [refreshKey, setRefreshKey] = useState(0);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const accessibleDocs = docs.filter((d) => d.url);

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

      const saveRes = await fetch(
        `/api/opportunities/${opportunityId}/questions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            questions: extracted.questions.map((q) => ({
              question_text: q.text,
              section_ref: q.section || null,
              question_type: TOPIC_TO_TYPE[q.topic] ?? "general",
              word_limit: null,
              is_mandatory: q.risk_level !== "low",
            })),
          }),
        },
      );

      if (!saveRes.ok) {
        const d = (await saveRes.json()) as { error?: string };
        setUploadError(d.error ?? "Save failed");
        return;
      }

      setUploadFile(null);
      setRefreshKey((k) => k + 1);
    } catch {
      setUploadError("Network error — please try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      {/* Tender document extraction strip */}
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>
          Extract from tender documents
        </div>
        <p
          style={{
            fontSize: 12.5,
            color: "var(--muted)",
            marginBottom: 12,
            lineHeight: 1.5,
          }}
        >
          Click a document to extract questions automatically, or upload a file
          you&apos;ve downloaded from a procurement portal.
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

      {/* Questions panel — re-mounts when refreshKey changes to pick up newly extracted questions */}
      <QuestionsPanel
        key={refreshKey}
        opportunityId={opportunityId}
        opportunityTitle={opportunityTitle}
      />
    </>
  );
}
