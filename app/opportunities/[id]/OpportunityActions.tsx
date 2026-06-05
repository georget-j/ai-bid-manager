"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { RecommendedAction } from "@/lib/procurement/types";

interface ScoringResult {
  fitScore: number;
  readinessScore: number;
  recommendedAction: RecommendedAction;
  reasons: string[];
  risks: string[];
  missingRequirements: string[];
}

const ACTION_STYLES: Record<
  RecommendedAction,
  { label: string; color: string; bg: string }
> = {
  bid: { label: "Bid", color: "#059669", bg: "#d1fae5" },
  maybe: { label: "Maybe", color: "#d97706", bg: "#fef3c7" },
  "needs-review": { label: "Needs review", color: "#7c3aed", bg: "#ede9fe" },
  "do-not-bid": { label: "Do not bid", color: "#dc2626", bg: "#fee2e2" },
};

export function OpportunityActions({
  opportunityId,
  opportunityTitle,
  sourceUrl,
}: {
  opportunityId: string;
  opportunityTitle: string;
  sourceUrl: string | null;
}) {
  const [analysing, setAnalysing] = useState(false);
  const [addingPipeline, setAddingPipeline] = useState(false);
  const [generatingMatrix, setGeneratingMatrix] = useState(false);
  const [matrixId, setMatrixId] = useState<string | null>(null);
  const [score, setScore] = useState<ScoringResult | null>(null);
  const [pipelineAdded, setPipelineAdded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/opportunities/${opportunityId}/pipeline-status`)
      .then((r) => r.json())
      .then((d: { saved?: boolean }) => {
        if (d.saved) setPipelineAdded(true);
      })
      .catch(() => {});
  }, [opportunityId]);

  async function analyse() {
    setAnalysing(true);
    setError(null);
    try {
      const res = await fetch(`/api/opportunities/${opportunityId}/analyse`, {
        method: "POST",
      });
      const data = (await res.json()) as ScoringResult & {
        error?: string;
        profileRequired?: boolean;
      };
      if (!res.ok) {
        setError(
          data.profileRequired
            ? "profile-required"
            : (data.error ?? "Analysis failed"),
        );
      } else {
        setScore(data);
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setAnalysing(false);
    }
  }

  async function addToPipeline() {
    setAddingPipeline(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/opportunities/${opportunityId}/add-to-pipeline`,
        { method: "POST" },
      );
      if (res.ok) {
        setPipelineAdded(true);
      } else {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Failed to add to pipeline");
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setAddingPipeline(false);
    }
  }

  async function generateMatrix() {
    setGeneratingMatrix(true);
    setError(null);
    try {
      const res = await fetch("/api/compliance-matrix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opportunity_id: opportunityId,
          title: opportunityTitle,
          requirements: [
            {
              requirement_text:
                "Describe your organisation's relevant experience and track record delivering similar projects.",
              section_reference: "Experience",
              mandatory: true,
            },
            {
              requirement_text:
                "Provide evidence of relevant certifications, accreditations, and compliance frameworks held.",
              section_reference: "Certifications",
              mandatory: true,
            },
            {
              requirement_text:
                "Describe your approach to social value and how you will deliver measurable community benefits.",
              section_reference: "Social Value",
              mandatory: true,
            },
            {
              requirement_text:
                "Provide details of your cyber security posture, controls, and any relevant certifications.",
              section_reference: "Cyber Security",
              mandatory: false,
            },
            {
              requirement_text:
                "Describe your data protection and GDPR compliance arrangements.",
              section_reference: "Data Protection",
              mandatory: true,
            },
          ],
        }),
      });
      const data = (await res.json()) as { matrix_id?: string; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed to generate matrix");
      } else if (data.matrix_id) {
        setMatrixId(data.matrix_id);
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setGeneratingMatrix(false);
    }
  }

  return (
    <div>
      {/* Action buttons */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button className="btn primary" onClick={analyse} disabled={analysing}>
          {analysing ? "Analysing…" : score ? "Re-analyse fit" : "Analyse fit"}
        </button>
        <button
          className="btn"
          onClick={addToPipeline}
          disabled={addingPipeline || pipelineAdded}
          style={
            pipelineAdded
              ? { color: "#059669", borderColor: "#059669" }
              : undefined
          }
        >
          {pipelineAdded
            ? "✓ Saved"
            : addingPipeline
              ? "Saving…"
              : "Save opportunity"}
        </button>
        {matrixId ? (
          <Link href={`/compliance/${matrixId}`} className="btn">
            ✓ View matrix
          </Link>
        ) : (
          <button
            className="btn"
            onClick={generateMatrix}
            disabled={generatingMatrix}
          >
            {generatingMatrix ? "Generating…" : "Generate compliance matrix"}
          </button>
        )}
        <Link
          href={`/rfp?title=${encodeURIComponent(opportunityTitle)}&opportunityId=${opportunityId}`}
          className="btn ghost"
        >
          Start RFP response
        </Link>
        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn ghost"
          >
            View source notice ↗
          </a>
        )}
      </div>

      {pipelineAdded && (
        <div
          style={{
            marginTop: 10,
            padding: "8px 12px",
            borderRadius: "var(--r-sm)",
            background: "#d1fae5",
            color: "#059669",
            fontSize: 12.5,
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          Saved to My Opportunities.{" "}
          <Link
            href="/my-opportunities"
            style={{ color: "#059669", fontWeight: 500 }}
          >
            View →
          </Link>
        </div>
      )}

      {error && (
        <div
          style={{
            marginTop: 10,
            padding: "8px 12px",
            borderRadius: "var(--r-sm)",
            background: "#fee2e2",
            color: "#dc2626",
            fontSize: 12.5,
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          {error === "profile-required" ? (
            <>
              No organisation profile set up.{" "}
              <Link
                href="/profile"
                style={{ color: "#dc2626", fontWeight: 600 }}
              >
                Set up your profile →
              </Link>
            </>
          ) : (
            error
          )}
        </div>
      )}

      {/* Scoring result */}
      {score && (
        <div className="card" style={{ marginTop: 16, overflow: "hidden" }}>
          <div
            style={{
              padding: "14px 20px",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              gap: 16,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <div className="eyebrow">AI fit analysis</div>
            <div style={{ display: "flex", gap: 10, marginLeft: "auto" }}>
              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    fontFamily: "var(--font-mono)",
                    color: "var(--ink)",
                  }}
                >
                  {score.fitScore}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  Fit
                </div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    fontFamily: "var(--font-mono)",
                    color: "var(--ink)",
                  }}
                >
                  {score.readinessScore}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  Readiness
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center" }}>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    padding: "4px 12px",
                    borderRadius: 999,
                    background:
                      ACTION_STYLES[score.recommendedAction]?.bg ??
                      "var(--bg-tint)",
                    color:
                      ACTION_STYLES[score.recommendedAction]?.color ??
                      "var(--muted)",
                  }}
                >
                  {ACTION_STYLES[score.recommendedAction]?.label ??
                    score.recommendedAction}
                </span>
              </div>
            </div>
          </div>

          {score.reasons.length > 0 && (
            <div
              style={{
                padding: "12px 20px",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.07em",
                  color: "#059669",
                  marginBottom: 8,
                }}
              >
                Reasons
              </div>
              {score.reasons.map((r) => (
                <div
                  key={r}
                  style={{
                    fontSize: 13,
                    color: "var(--ink-2)",
                    marginBottom: 4,
                    display: "flex",
                    gap: 8,
                  }}
                >
                  <span style={{ color: "#059669", flexShrink: 0 }}>✓</span>
                  {r}
                </div>
              ))}
            </div>
          )}

          {score.risks.length > 0 && (
            <div
              style={{
                padding: "12px 20px",
                borderBottom:
                  score.missingRequirements.length > 0
                    ? "1px solid var(--border)"
                    : "none",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.07em",
                  color: "#dc2626",
                  marginBottom: 8,
                }}
              >
                Risks
              </div>
              {score.risks.map((r) => (
                <div
                  key={r}
                  style={{
                    fontSize: 13,
                    color: "var(--ink-2)",
                    marginBottom: 4,
                    display: "flex",
                    gap: 8,
                  }}
                >
                  <span style={{ color: "#dc2626", flexShrink: 0 }}>⚠</span>
                  {r}
                </div>
              ))}
            </div>
          )}

          {score.missingRequirements.length > 0 && (
            <div style={{ padding: "12px 20px" }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.07em",
                  color: "#d97706",
                  marginBottom: 8,
                }}
              >
                Missing evidence
              </div>
              {score.missingRequirements.map((r) => (
                <div
                  key={r}
                  style={{
                    fontSize: 13,
                    color: "var(--ink-2)",
                    marginBottom: 4,
                    display: "flex",
                    gap: 8,
                  }}
                >
                  <span style={{ color: "#d97706", flexShrink: 0 }}>→</span>
                  {r}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
