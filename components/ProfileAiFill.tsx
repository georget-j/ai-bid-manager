"use client";

// "Fill my profile with AI" card (pinned component contract).
//
// Draft-only by design: this component NEVER writes to the server. It calls
// POST /api/profile/ai-fill for proposals, shows each one with its evidence
// quote and source, and Apply only hands the chosen fields to the parent via
// onApply — merging them into the page's form state. The user still presses
// the normal Save to keep anything.

import { useEffect, useState } from "react";
// Type-only import: lib/profile-ai is a server module (OpenAI client, retrieval),
// so nothing from it may reach the client bundle at runtime.
import type {
  ProfileAiDraft,
  ProfileProposal,
  ProposalConfidence,
} from "@/lib/profile-ai";

/**
 * Group proposals by section, preserving the server's ordering (proposals
 * arrive sorted by profile-page section order). Local to the client on
 * purpose — see the type-only import note above.
 */
function groupBySection(
  proposals: ProfileProposal[],
): Array<{ id: string; label: string; proposals: ProfileProposal[] }> {
  const groups: Array<{
    id: string;
    label: string;
    proposals: ProfileProposal[];
  }> = [];
  const byId = new Map<string, (typeof groups)[number]>();
  for (const p of proposals) {
    let group = byId.get(p.section);
    if (!group) {
      group = { id: p.section, label: p.sectionLabel, proposals: [] };
      byId.set(p.section, group);
      groups.push(group);
    }
    group.proposals.push(p);
  }
  return groups;
}

interface ProfileAiFillProps {
  profile: Record<string, unknown> | null;
  onApply: (fields: Record<string, unknown>) => void;
}

type Phase = "idle" | "loading" | "ready" | "error";

const LOADING_STEPS = [
  "Reading your documents…",
  "Reading your website…",
  "Checking public registers…",
  "Drafting suggestions for you to review…",
];

const CONFIDENCE_COPY: Record<
  ProposalConfidence,
  { label: string; color: string; tint: string }
> = {
  high: {
    label: "Strong evidence",
    color: "var(--success)",
    tint: "var(--success-tint)",
  },
  medium: {
    label: "Good evidence",
    color: "var(--warn)",
    tint: "var(--warn-tint)",
  },
  low: {
    label: "Check this one",
    color: "var(--terra)",
    tint: "var(--terra-soft)",
  },
};

function SourceBadge({ source }: { source: ProfileProposal["source"] }) {
  return (
    <span
      style={{
        fontSize: 11,
        padding: "1px 8px",
        borderRadius: 999,
        background: "var(--accent-tint)",
        color: "var(--accent)",
        whiteSpace: "nowrap",
      }}
    >
      From {source}
    </span>
  );
}

function ConfidenceChip({ confidence }: { confidence: ProposalConfidence }) {
  const c = CONFIDENCE_COPY[confidence];
  return (
    <span
      style={{
        fontSize: 11,
        padding: "1px 8px",
        borderRadius: 999,
        background: c.tint,
        color: c.color,
        whiteSpace: "nowrap",
      }}
    >
      {c.label}
    </span>
  );
}

function LoadingSteps() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timer = setInterval(
      () => setStep((s) => Math.min(s + 1, LOADING_STEPS.length - 1)),
      4000,
    );
    return () => clearInterval(timer);
  }, []);
  return (
    <div>
      <p style={{ fontSize: 13, color: "var(--ink)", marginBottom: 4 }}>
        {LOADING_STEPS[step]}
      </p>
      <p style={{ fontSize: 12, color: "var(--muted)" }}>
        This usually takes 15–30 seconds. Nothing is saved — you review every
        suggestion first.
      </p>
    </div>
  );
}

export function ProfileAiFill({ profile, onApply }: ProfileAiFillProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [draft, setDraft] = useState<ProfileAiDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [appliedSections, setAppliedSections] = useState<Set<string>>(
    new Set(),
  );

  async function run() {
    setPhase("loading");
    setError(null);
    setDraft(null);
    setAppliedSections(new Set());
    try {
      const website =
        typeof profile?.website === "string" && profile.website.trim()
          ? profile.website.trim()
          : undefined;
      const res = await fetch("/api/profile/ai-fill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(website ? { website } : {}),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(
          body?.error ??
            "We couldn't draft your profile this time — please try again.",
        );
      }
      setDraft(body as ProfileAiDraft);
      setPhase("ready");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "We couldn't draft your profile this time — please try again.",
      );
      setPhase("error");
    }
  }

  function applySection(sectionId: string, proposals: ProfileProposal[]) {
    const fields: Record<string, unknown> = {};
    for (const p of proposals) fields[p.field] = p.value;
    onApply(fields);
    setAppliedSections((prev) => new Set(prev).add(sectionId));
  }

  const groups = draft ? groupBySection(draft.proposals) : [];

  return (
    <div className="card card-pad" style={{ marginBottom: 16 }}>
      <div className="eyebrow" style={{ marginBottom: 4 }}>
        Fill my profile with AI
      </div>

      {phase === "idle" && (
        <div>
          <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12 }}>
            Let AI draft your profile from your documents, website and public
            registers — you review every field before it&rsquo;s saved.
          </p>
          <button type="button" className="btn accent" onClick={run}>
            Fill my profile with AI
          </button>
        </div>
      )}

      {phase === "loading" && <LoadingSteps />}

      {phase === "error" && (
        <div>
          <p style={{ fontSize: 13, color: "var(--danger)", marginBottom: 12 }}>
            {error}
          </p>
          <button type="button" className="btn ghost sm" onClick={run}>
            Try again
          </button>
        </div>
      )}

      {phase === "ready" && draft && (
        <div>
          {groups.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }}>
              We couldn&rsquo;t find anything new to suggest. Add documents to
              your evidence library — or your website address — and try again.
            </p>
          ) : (
            <p
              style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12 }}
            >
              {draft.proposals.length} suggestion
              {draft.proposals.length === 1 ? "" : "s"} found. Apply the ones
              that look right, then press Save profile to keep them.
            </p>
          )}

          {groups.map((group) => {
            const applied = appliedSections.has(group.id);
            return (
              <div
                key={group.id}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: "var(--r-md)",
                  padding: 12,
                  marginBottom: 10,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 8,
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--ink)",
                    }}
                  >
                    {group.label}
                  </div>
                  {applied ? (
                    <span style={{ fontSize: 12, color: "var(--success)" }}>
                      ✓ Added to the form — press Save profile to keep it
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="btn ghost sm"
                      onClick={() => applySection(group.id, group.proposals)}
                    >
                      Apply {group.proposals.length} field
                      {group.proposals.length === 1 ? "" : "s"}
                    </button>
                  )}
                </div>

                {group.proposals.map((p) => (
                  <div
                    key={p.field}
                    style={{
                      padding: "8px 0",
                      borderTop: "1px solid var(--border)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        alignItems: "center",
                        gap: 6,
                        marginBottom: 2,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: "var(--ink)",
                        }}
                      >
                        {p.label}
                      </span>
                      <SourceBadge source={p.source} />
                      <ConfidenceChip confidence={p.confidence} />
                    </div>
                    <div style={{ fontSize: 13, color: "var(--ink)" }}>
                      {p.display}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--muted)",
                        fontStyle: "italic",
                        marginTop: 2,
                      }}
                    >
                      &ldquo;{p.evidence}&rdquo;
                    </div>
                  </div>
                ))}
              </div>
            );
          })}

          {draft.notes.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {draft.notes.map((note) => (
                <p
                  key={note}
                  style={{
                    fontSize: 12,
                    color: "var(--muted)",
                    margin: "2px 0",
                  }}
                >
                  {note}
                </p>
              ))}
            </div>
          )}

          <button
            type="button"
            className="btn ghost sm"
            style={{ marginTop: 8 }}
            onClick={run}
          >
            Run again
          </button>
        </div>
      )}
    </div>
  );
}
