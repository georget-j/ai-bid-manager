"use client";

import { useCallback, useState } from "react";
import { DocumentList } from "@/components/DocumentList";
import { DocumentUpload } from "@/components/DocumentUpload";
import { SampleDataLoader } from "@/components/SampleDataLoader";

const STARTER_CHECKLIST = [
  "Your capability statement or company overview",
  "2–3 case studies of work you're proud of",
  "Certifications and accreditations (ISO 27001, Cyber Essentials…)",
  "Key policies — security, quality, environmental",
  "A past bid you won",
];

export default function DocumentsPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [mainCount, setMainCount] = useState<number | null>(null);

  const handleNewDoc = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const handleCountChange = useCallback(
    (collection: "main" | "procurement", count: number) => {
      if (collection === "main") setMainCount(count);
    },
    [],
  );

  const firstRun = mainCount === 0;

  return (
    <div>
      <div className="page-head">
        <div className="title-block">
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Evidence
          </div>
          <h1>
            Evidence <em>library</em>
          </h1>
          <p className="subtitle">
            Everything here is what the AI quotes when drafting your tender and
            grant answers — the more you add, the stronger and better-evidenced
            your answers get.
          </p>
        </div>
      </div>

      {/* Privacy strip */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 14px",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-sm)",
          background: "var(--surface-2)",
          marginBottom: 24,
          fontSize: 13,
          color: "var(--ink-2)",
        }}
      >
        <span aria-hidden style={{ fontSize: 14 }}>
          🔒
        </span>
        <span>
          Private to your organisation — only your team can see or search these
          files.
        </span>
      </div>

      {firstRun ? (
        /* Teaching first-run state: what to upload, the dropzone, and sample data */
        <div className="card card-pad" style={{ marginBottom: 36 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            Start your library
          </div>
          <h2 style={{ fontSize: 17, margin: "0 0 6px" }}>
            Add the documents you already have
          </h2>
          <p
            style={{
              fontSize: 13.5,
              color: "var(--ink-2)",
              margin: "0 0 10px",
            }}
          >
            Most teams start with:
          </p>
          <ul
            style={{
              listStyle: "none",
              margin: "0 0 18px",
              padding: 0,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {STARTER_CHECKLIST.map((item) => (
              <li
                key={item}
                style={{
                  display: "flex",
                  gap: 8,
                  fontSize: 13,
                  color: "var(--ink-2)",
                  lineHeight: 1.45,
                }}
              >
                <span
                  aria-hidden
                  style={{ color: "#059669", fontWeight: 700, flexShrink: 0 }}
                >
                  ✓
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <DocumentUpload onSuccess={handleNewDoc} />
          <div style={{ marginTop: 18 }}>
            <SampleDataLoader onSuccess={handleNewDoc} />
          </div>
        </div>
      ) : (
        <div className="card card-pad" style={{ marginBottom: 36 }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            Add to your library
          </div>
          <DocumentUpload onSuccess={handleNewDoc} />
        </div>
      )}

      <div className="section-title">Your documents</div>
      <DocumentList refreshKey={refreshKey} onCountChange={handleCountChange} />
    </div>
  );
}
