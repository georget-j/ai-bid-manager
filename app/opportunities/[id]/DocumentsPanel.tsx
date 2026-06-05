"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { NormalizedDocument } from "@/lib/procurement/types";
import type {
  EnrichedDocument,
  PortalInfo,
} from "@/app/api/opportunities/[id]/fetch-documents/route";

const BADGE: Record<
  EnrichedDocument["accessibility"],
  { label: string; color: string; bg: string }
> = {
  accessible: { label: "Accessible", color: "#059669", bg: "#d1fae5" },
  "portal-required": {
    label: "Portal required",
    color: "#b45309",
    bg: "#fef3c7",
  },
  unknown: { label: "Unknown", color: "#6b7280", bg: "#f3f4f6" },
  error: { label: "Error", color: "#dc2626", bg: "#fee2e2" },
};

function PortalAccordion({ portal }: { portal: PortalInfo }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: 6 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
          fontSize: 12,
          color: "var(--accent)",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        <span style={{ fontSize: 10 }}>{open ? "▼" : "▶"}</span>
        How to access via {portal.name}
      </button>
      {open && (
        <ol
          style={{
            marginTop: 8,
            marginLeft: 16,
            fontSize: 12.5,
            color: "var(--ink-2)",
            lineHeight: 1.6,
          }}
        >
          {portal.instructions.map((step, i) => (
            <li key={i} style={{ marginBottom: 4 }}>
              {step}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function DocRow({
  doc,
  opportunityId,
  onAdded,
  initiallyAdded = false,
}: {
  doc: EnrichedDocument;
  opportunityId: string;
  onAdded: (docId: string) => void;
  initiallyAdded?: boolean;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(initiallyAdded);
  const [addError, setAddError] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);

  async function extractQuestions() {
    if (!doc.url) return;
    setExtracting(true);
    setExtractError(null);
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
        if (res.status === 403 || data.error === "access-denied") {
          setExtractError("portal-blocked");
        } else {
          setExtractError(data.error ?? "Extraction failed");
        }
      } else {
        router.push(`/opportunities/${opportunityId}/rfp`);
      }
    } catch {
      setExtractError("Network error — please try again.");
    } finally {
      setExtracting(false);
    }
  }

  const badge = BADGE[doc.accessibility];

  async function addToKb() {
    setAdding(true);
    setAddError(null);
    try {
      const res = await fetch(
        `/api/opportunities/${opportunityId}/add-document-to-kb`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: doc.url, title: doc.title }),
        },
      );
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok) {
        setAddError(data.error ?? "Failed to add to knowledge base");
      } else {
        setAdded(true);
        if (data.id) onAdded(data.id);
      }
    } catch {
      setAddError("Network error — please try again.");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div
      style={{
        padding: "12px 0",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
            marginBottom: 2,
          }}
        >
          <span
            style={{ fontSize: 13.5, color: "var(--ink)", fontWeight: 500 }}
          >
            {doc.title}
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: "2px 8px",
              borderRadius: 999,
              background: badge.bg,
              color: badge.color,
              flexShrink: 0,
            }}
          >
            {badge.label}
          </span>
          {doc.format && (
            <span
              style={{
                fontSize: 11,
                padding: "2px 8px",
                borderRadius: 999,
                background: "var(--bg-tint)",
                color: "var(--muted)",
              }}
            >
              {doc.format.toUpperCase()}
            </span>
          )}
        </div>
        {doc.documentType && (
          <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 2 }}>
            {doc.documentType}
          </p>
        )}
        {doc.accessibility === "portal-required" && doc.portal && (
          <PortalAccordion portal={doc.portal} />
        )}
        {doc.accessibility === "portal-required" && (
          <p style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 4 }}>
            Download from the portal, then upload on the{" "}
            <a
              href={`/opportunities/${opportunityId}/rfp`}
              style={{ color: "var(--accent)" }}
            >
              RFP Response tab
            </a>
            .
          </p>
        )}
        {extractError === "portal-blocked" && (
          <p style={{ fontSize: 11.5, color: "#b45309", marginTop: 4 }}>
            This document requires authentication to download.{" "}
            <a
              href={doc.url ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#b45309", textDecoration: "underline" }}
            >
              Download it directly
            </a>
            , then upload on the{" "}
            <a
              href={`/opportunities/${opportunityId}/rfp`}
              style={{ color: "#b45309", textDecoration: "underline" }}
            >
              RFP Response tab
            </a>
            .
          </p>
        )}
        {(doc.accessibility === "unknown" || doc.accessibility === "error") &&
          doc.errorMessage && (
            <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
              {doc.errorMessage}
            </p>
          )}
        {addError && (
          <p style={{ fontSize: 12, color: "#dc2626", marginTop: 4 }}>
            {addError}
          </p>
        )}
      </div>

      <div
        style={{
          display: "flex",
          gap: 6,
          flexShrink: 0,
          alignItems: "flex-start",
        }}
      >
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
        {doc.accessibility === "accessible" && doc.url && (
          <button
            className="btn primary"
            onClick={extractQuestions}
            disabled={extracting}
            style={{ fontSize: 12, padding: "4px 10px" }}
          >
            {extracting ? "Extracting…" : "Extract questions"}
          </button>
        )}
        {doc.accessibility === "accessible" && !added && (
          <button
            className="btn"
            onClick={addToKb}
            disabled={adding}
            style={{ fontSize: 12, padding: "4px 10px" }}
          >
            {adding ? "Adding…" : "Add to KB"}
          </button>
        )}
        {added && (
          <span
            style={{
              fontSize: 12,
              padding: "4px 10px",
              color: "#059669",
              fontWeight: 500,
            }}
          >
            ✓ In KB
          </span>
        )}
        {extractError && extractError !== "portal-blocked" && (
          <span style={{ fontSize: 11, color: "#dc2626", maxWidth: 140 }}>
            {extractError}
          </span>
        )}
      </div>
    </div>
  );
}

export function DocumentsPanel({
  opportunityId,
  initialDocs,
}: {
  opportunityId: string;
  initialDocs: NormalizedDocument[];
}) {
  const [loading, setLoading] = useState(false);
  const [enriched, setEnriched] = useState<EnrichedDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<string[]>([]);
  // file_name values for docs already in the procurement KB for this opportunity
  const [kbFileNames, setKbFileNames] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch(
      `/api/documents?collection=procurement&opportunityId=${opportunityId}`,
    )
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: { file_name: string | null }[]) => {
        setKbFileNames(
          new Set(rows.map((r) => r.file_name).filter(Boolean) as string[]),
        );
      })
      .catch(() => {});
  }, [opportunityId]);

  async function loadDocuments() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/opportunities/${opportunityId}/fetch-documents`,
        { method: "POST" },
      );
      const data = (await res.json()) as {
        documents?: EnrichedDocument[];
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Failed to load documents");
      } else {
        setEnriched(data.documents ?? []);
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  const docs = enriched ?? (initialDocs as EnrichedDocument[]);
  const hasAny = docs.length > 0;

  if (!hasAny && !enriched) {
    return (
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 0,
          }}
        >
          <div className="eyebrow">Tender documents</div>
          <button
            className="btn ghost"
            onClick={loadDocuments}
            disabled={loading}
            style={{ fontSize: 12, padding: "4px 12px" }}
          >
            {loading ? "Checking…" : "Check for documents"}
          </button>
        </div>
        {!loading && (
          <p style={{ marginTop: 12, fontSize: 13, color: "var(--muted)" }}>
            No documents indexed yet. Click to check the source.
          </p>
        )}
        {error && (
          <p style={{ marginTop: 10, fontSize: 13, color: "#dc2626" }}>
            {error}
          </p>
        )}
      </div>
    );
  }

  const accessibleCount = enriched
    ? enriched.filter((d) => d.accessibility === "accessible").length
    : 0;
  const portalCount = enriched
    ? enriched.filter((d) => d.accessibility === "portal-required").length
    : 0;

  return (
    <div className="card card-pad" id="documents" style={{ marginBottom: 16 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div className="eyebrow">Tender documents</div>
          {enriched && (
            <span style={{ fontSize: 12, color: "var(--muted)" }}>
              {accessibleCount > 0 && (
                <span style={{ color: "#059669" }}>
                  {accessibleCount} accessible
                </span>
              )}
              {accessibleCount > 0 && portalCount > 0 && " · "}
              {portalCount > 0 && (
                <span style={{ color: "#b45309" }}>
                  {portalCount} portal-required
                </span>
              )}
              {addedIds.length > 0 && (
                <span style={{ color: "var(--muted)" }}>
                  {" "}
                  · {addedIds.length} added to KB
                </span>
              )}
            </span>
          )}
        </div>
        <button
          className="btn ghost"
          onClick={loadDocuments}
          disabled={loading}
          style={{ fontSize: 12, padding: "4px 12px" }}
        >
          {loading ? "Checking…" : enriched ? "Refresh" : "Check accessibility"}
        </button>
      </div>

      {error && (
        <p style={{ fontSize: 13, color: "#dc2626", marginBottom: 12 }}>
          {error}
        </p>
      )}

      {docs.map((doc, i) =>
        enriched ? (
          <DocRow
            key={doc.id ?? doc.url ?? i}
            doc={doc}
            opportunityId={opportunityId}
            onAdded={(docId) => setAddedIds((prev) => [...prev, docId])}
            initiallyAdded={(() => {
              const urlFileName = doc.url
                ? decodeURIComponent(
                    doc.url.split("/").pop()?.split("?")[0] ?? "",
                  )
                : null;
              return urlFileName ? kbFileNames.has(urlFileName) : false;
            })()}
          />
        ) : (
          // Static view before enrichment
          <div
            key={doc.id ?? i}
            style={{
              padding: "10px 0",
              borderBottom:
                i < docs.length - 1 ? "1px solid var(--border)" : "none",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div>
              <p
                style={{ fontSize: 13.5, color: "var(--ink)", marginBottom: 2 }}
              >
                {doc.title}
              </p>
              {doc.documentType && (
                <p style={{ fontSize: 12, color: "var(--muted)" }}>
                  {doc.documentType}
                </p>
              )}
            </div>
            {doc.url && (
              <a
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn ghost"
                style={{ fontSize: 12, padding: "4px 12px", flexShrink: 0 }}
              >
                Download ↗
              </a>
            )}
          </div>
        ),
      )}
    </div>
  );
}
