"use client";

import { useState, useEffect } from "react";

interface ReevalItem {
  question_id: string;
  question_text: string;
  question_class: string;
  section_ref: string | null;
  source_document: string | null;
  is_mandatory: boolean;
  answer_status: string;
  score: number;
  strengths: string[];
  suggestions: string[];
}

interface Evaluation {
  overall_score: number;
  items: ReevalItem[];
  created_at: string;
}

function scoreColor(s: number) {
  return s >= 75 ? "#059669" : s >= 50 ? "#d97706" : "#dc2626";
}

function verdict(s: number) {
  return s >= 75
    ? "Strong response"
    : s >= 50
      ? "Competitive — room to improve"
      : "Needs work before submission";
}

export function RfpReevaluationSection({
  opportunityId,
  answeredCount,
  refreshKey,
}: {
  opportunityId: string;
  answeredCount: number;
  refreshKey: number;
}) {
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/opportunities/${opportunityId}/reevaluate`)
      .then((r) => r.json())
      .then((d: { evaluation: Evaluation | null }) =>
        setEvaluation(d.evaluation),
      )
      .catch(() => {});
  }, [opportunityId, refreshKey]);

  async function runReeval() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/opportunities/${opportunityId}/reevaluate`,
        { method: "POST" },
      );
      const data = (await res.json()) as {
        evaluation?: Evaluation;
        error?: string;
      };
      if (!res.ok || !data.evaluation) {
        setError(data.error ?? "Re-evaluation failed");
        return;
      }
      setEvaluation(data.evaluation);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setRunning(false);
    }
  }

  if (answeredCount === 0) return null;

  const overall = evaluation?.overall_score ?? 0;
  const items = evaluation
    ? [...evaluation.items].sort((a, b) => a.score - b.score)
    : [];

  return (
    <div className="card card-pad">
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: evaluation ? 16 : 8,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: "var(--ink)",
              margin: "0 0 4px",
            }}
          >
            Re-evaluate response
          </h2>
          <p style={{ fontSize: 12.5, color: "var(--muted)", margin: 0 }}>
            Score every answered item against the original tender and see what
            to improve before submitting.
          </p>
        </div>
        <button
          className="btn primary"
          onClick={runReeval}
          disabled={running}
          style={{ fontSize: 12.5, padding: "6px 14px", flexShrink: 0 }}
        >
          {running
            ? "Evaluating…"
            : evaluation
              ? "Re-evaluate"
              : "Evaluate response"}
        </button>
      </div>

      {error && (
        <p style={{ fontSize: 12.5, color: "#dc2626", marginBottom: 8 }}>
          {error}
        </p>
      )}

      {!evaluation && !running && !error && (
        <p style={{ fontSize: 12.5, color: "var(--muted)" }}>
          Runs an AI assessment of your drafted and approved answers against the
          tender description and documents.
        </p>
      )}

      {evaluation && (
        <>
          {/* Overall gauge */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 18,
              marginBottom: 18,
              paddingBottom: 16,
              borderBottom: "1px solid var(--border)",
            }}
          >
            <div
              style={{
                position: "relative",
                width: 72,
                height: 72,
                flexShrink: 0,
              }}
            >
              <svg width="72" height="72" viewBox="0 0 72 72">
                <circle
                  cx="36"
                  cy="36"
                  r="28"
                  fill="none"
                  stroke="var(--border)"
                  strokeWidth="6"
                />
                <circle
                  cx="36"
                  cy="36"
                  r="28"
                  fill="none"
                  stroke={scoreColor(overall)}
                  strokeWidth="6"
                  strokeDasharray={`${(overall / 100) * 175.9} 175.9`}
                  strokeLinecap="round"
                  transform="rotate(-90 36 36)"
                />
              </svg>
              <span
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 18,
                  fontWeight: 700,
                  fontFamily: "var(--font-mono)",
                  color: scoreColor(overall),
                }}
              >
                {overall}
              </span>
            </div>
            <div>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: scoreColor(overall),
                  marginBottom: 2,
                }}
              >
                {verdict(overall)}
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                {evaluation.items.length} item
                {evaluation.items.length !== 1 ? "s" : ""} scored ·{" "}
                {new Date(evaluation.created_at).toLocaleString("en-GB", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            </div>
          </div>

          {/* Per-item scores (weakest first) */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {items.map((item) => (
              <div key={item.question_id}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    gap: 10,
                    marginBottom: 4,
                  }}
                >
                  <span
                    style={{
                      fontSize: 12.5,
                      color: "var(--ink)",
                      lineHeight: 1.45,
                      flex: 1,
                      minWidth: 0,
                    }}
                  >
                    {item.is_mandatory && (
                      <span
                        style={{
                          fontSize: 9.5,
                          fontWeight: 700,
                          color: "#dc2626",
                          marginRight: 6,
                        }}
                      >
                        MANDATORY
                      </span>
                    )}
                    {item.question_text}
                  </span>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      fontFamily: "var(--font-mono)",
                      color: scoreColor(item.score),
                      flexShrink: 0,
                    }}
                  >
                    {item.score}
                  </span>
                </div>
                <div
                  style={{
                    height: 6,
                    background: "var(--border)",
                    borderRadius: 99,
                    overflow: "hidden",
                    marginBottom:
                      item.suggestions.length > 0 || item.strengths.length > 0
                        ? 6
                        : 0,
                  }}
                >
                  <div
                    style={{
                      width: `${item.score}%`,
                      height: "100%",
                      background: scoreColor(item.score),
                      borderRadius: 99,
                      transition: "width 300ms",
                    }}
                  />
                </div>
                {item.suggestions.length > 0 && (
                  <ul
                    style={{
                      margin: "4px 0 0",
                      padding: "0 0 0 16px",
                      listStyle: "disc",
                    }}
                  >
                    {item.suggestions.map((s, i) => (
                      <li
                        key={i}
                        style={{
                          fontSize: 11.5,
                          color: "#92400e",
                          marginBottom: 2,
                          lineHeight: 1.45,
                        }}
                      >
                        {s}
                      </li>
                    ))}
                  </ul>
                )}
                {item.strengths.length > 0 && (
                  <p
                    style={{
                      fontSize: 11,
                      color: "#047857",
                      margin: "3px 0 0",
                      lineHeight: 1.45,
                    }}
                  >
                    ✓ {item.strengths.join(" · ")}
                  </p>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
