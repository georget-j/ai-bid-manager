"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RFPProcessor, type AnsweredQuestion } from "@/components/RFPProcessor";
import { BudgetBuilder } from "./BudgetBuilder";
import { ApplicationGuide } from "@/app/grants/[id]/ApplicationGuide";
import type { ExtractedQuestion } from "@/lib/rfp-extract";
import type {
  GrantRow,
  ApplicationGuide as GrantGuide,
} from "@/lib/grants/types";
import type { GrantScoringResult } from "@/lib/grants/scoring";
import type { GrantBudget } from "@/lib/grants/budget";
import type {
  ApplicationFlow,
  FlowStep,
  StepStatus,
} from "@/lib/grants/application-flow";
import { matchColor, matchVerdict } from "@/lib/grants/copy";
import { daysUntil } from "@/lib/dates";

type Step = "upload" | "reviewing" | "answering" | "done";

interface Props {
  draftId: string;
  grant: GrantRow;
  fit: GrantScoringResult | null;
  flow: ApplicationFlow;
  guide: GrantGuide | null;
  kbDocCount: number;
  availableResources: number;
  initialTitle: string;
  initialQuestions: ExtractedQuestion[];
  initialSelected: number[];
  initialAnswers: Record<string, AnsweredQuestion>;
  initialStep: Step;
  initialBudget: GrantBudget | null;
}

// ── module-level helpers (impure Date kept out of render) ──────────────────────
function deadlineInfo(
  iso: string | null,
): { label: string; color: string } | null {
  if (!iso) return null;
  const days = daysUntil(iso);
  if (days < 0) return { label: `Closed ${-days}d ago`, color: "#dc2626" };
  if (days === 0) return { label: "Due today", color: "#dc2626" };
  if (days <= 14) return { label: `${days} days left`, color: "#b45309" };
  return { label: `${days} days left`, color: "#059669" };
}

function scrollToAnchor(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  if (el.tagName === "DETAILS") (el as HTMLDetailsElement).open = true;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

const STATUS_DOT: Record<
  StepStatus,
  { bg: string; border: string; fg: string }
> = {
  done: { bg: "#059669", border: "#059669", fg: "#fff" },
  current: { bg: "#2563eb", border: "#2563eb", fg: "#fff" },
  blocked: { bg: "#fef2f2", border: "#dc2626", fg: "#dc2626" },
  todo: { bg: "transparent", border: "var(--border)", fg: "var(--muted)" },
};

// ── the sticky step spine ──────────────────────────────────────────────────────
function StepSpine({
  steps,
  progress,
  submitted,
  nextStep,
}: {
  steps: FlowStep[];
  progress: number;
  submitted: boolean;
  nextStep: FlowStep | null;
}) {
  const [active, setActive] = useState<string | null>(
    steps[0]?.anchorId ?? null,
  );
  const [wide, setWide] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => setWide(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
      },
      { rootMargin: "-15% 0px -75% 0px", threshold: 0 },
    );
    for (const s of steps) {
      const el = document.getElementById(s.anchorId);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [steps]);

  function next() {
    if (!nextStep) return;
    if (nextStep.action?.href) {
      window.location.href = nextStep.action.href;
      return;
    }
    scrollToAnchor(nextStep.anchorId);
  }

  return (
    <nav
      aria-label="Your application steps"
      style={{
        position: wide ? "sticky" : "static",
        top: 16,
        alignSelf: "flex-start",
        width: wide ? 250 : "100%",
        flexShrink: 0,
      }}
    >
      <div className="card card-pad" style={{ padding: 16 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: 8,
          }}
        >
          <div className="eyebrow">Your application</div>
          <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
            {submitted ? "Submitted" : `${progress}% done`}
          </span>
        </div>
        <div
          style={{
            height: 5,
            borderRadius: 999,
            background: "var(--border)",
            overflow: "hidden",
            marginBottom: 14,
          }}
        >
          <div
            style={{
              width: `${progress}%`,
              height: "100%",
              background: submitted ? "#059669" : "var(--accent)",
              transition: "width .2s",
            }}
          />
        </div>

        <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {steps.map((s) => {
            const isActive = active === s.anchorId;
            const dot = STATUS_DOT[s.status];
            return (
              <li key={s.key} style={{ marginBottom: 2 }}>
                <button
                  onClick={() => scrollToAnchor(s.anchorId)}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 9,
                    width: "100%",
                    textAlign: "left",
                    background: isActive ? "var(--accent-tint)" : "transparent",
                    border: "none",
                    borderRadius: 7,
                    padding: "7px 8px",
                    cursor: "pointer",
                  }}
                >
                  <span
                    style={{
                      flexShrink: 0,
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      border: `1.5px solid ${dot.border}`,
                      background: dot.bg,
                      color: dot.fg,
                      fontSize: 11,
                      fontWeight: 600,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      marginTop: 1,
                    }}
                  >
                    {s.status === "done"
                      ? "✓"
                      : s.status === "blocked"
                        ? "!"
                        : s.number}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span
                      style={{
                        display: "block",
                        fontSize: 12.5,
                        lineHeight: 1.3,
                        fontWeight: isActive ? 600 : 500,
                        color: isActive ? "var(--accent)" : "var(--ink)",
                      }}
                    >
                      {s.label}
                    </span>
                    <span
                      style={{
                        display: "block",
                        fontSize: 11,
                        color:
                          s.status === "blocked" ? "#dc2626" : "var(--muted)",
                        marginTop: 1,
                      }}
                    >
                      {s.detail}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        {!submitted && nextStep && (
          <button
            className="btn primary"
            onClick={next}
            style={{
              width: "100%",
              marginTop: 12,
              fontSize: 13,
              justifyContent: "center",
            }}
          >
            Next: {nextStep.action?.label ?? nextStep.label} →
          </button>
        )}
      </div>
    </nav>
  );
}

// ── section heading ────────────────────────────────────────────────────────────
function SectionHead({ step }: { step: FlowStep }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            flexShrink: 0,
            width: 22,
            height: 22,
            borderRadius: "50%",
            border: `1.5px solid ${STATUS_DOT[step.status].border}`,
            background: STATUS_DOT[step.status].bg,
            color: STATUS_DOT[step.status].fg,
            fontSize: 11,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {step.status === "done"
            ? "✓"
            : step.status === "blocked"
              ? "!"
              : step.number}
        </span>
        <h2 style={{ fontSize: 17, margin: 0 }}>{step.label}</h2>
      </div>
      <p
        style={{
          fontSize: 13,
          color: "var(--muted)",
          margin: "6px 0 0 30px",
        }}
      >
        {step.help}
      </p>
    </div>
  );
}

// ── inline action: add the funder's documents ──────────────────────────────────
function AddEvidenceButton({
  grantId,
  available,
  onDone,
}: {
  grantId: string;
  available: number;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/grants/${grantId}/ingest-documents`, {
        method: "POST",
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        setError(b.error ?? "Could not add the documents.");
      } else {
        onDone();
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        className="btn"
        onClick={run}
        disabled={busy || available === 0}
        style={{ fontSize: 13 }}
      >
        {busy
          ? "Adding…"
          : available > 0
            ? `Add the funder's documents (${available})`
            : "No documents to add"}
      </button>
      {error && <span style={{ fontSize: 12, color: "#dc2626" }}>{error}</span>}
    </>
  );
}

// ── review step: mark as submitted ─────────────────────────────────────────────
function MarkSubmittedButton({
  draftId,
  ready,
}: {
  draftId: string;
  ready: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/rfp/drafts/${draftId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: "submitted" }),
      });
      if (!res.ok) setError("Could not update — please try again.");
      else {
        setDone(true);
        router.refresh();
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <span style={{ fontSize: 13, color: "#059669" }}>
        ✓ Marked as submitted ·{" "}
        <Link href="/my-applications" style={{ color: "var(--accent)" }}>
          View in My applications →
        </Link>
      </span>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <button
        className="btn primary"
        onClick={submit}
        disabled={busy}
        style={{ fontSize: 13, alignSelf: "flex-start" }}
      >
        {busy ? "Saving…" : "Mark as submitted"}
      </button>
      {!ready && (
        <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
          Some checks above are still open — only mark this submitted once
          you&apos;ve actually applied to the funder.
        </span>
      )}
      {error && <span style={{ fontSize: 12, color: "#dc2626" }}>{error}</span>}
    </div>
  );
}

// ── the flow ───────────────────────────────────────────────────────────────────
export function GrantApplicationFlow({
  draftId,
  grant,
  fit,
  flow,
  guide,
  kbDocCount,
  availableResources,
  initialTitle,
  initialQuestions,
  initialSelected,
  initialAnswers,
  initialStep,
  initialBudget,
}: Props) {
  const router = useRouter();
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // After an autosave lands, recompute the server-side flow (single source of truth)
  // so the spine + review gate update without losing in-component state.
  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => router.refresh(), 600);
  }, [router]);

  const stepByKey = (k: FlowStep["key"]) =>
    flow.steps.find((s) => s.key === k)!;

  const deadline = deadlineInfo(grant.deadline_at);

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto" }}>
      {/* breadcrumbs */}
      <div
        style={{
          display: "flex",
          gap: 16,
          fontSize: 13,
          marginBottom: 14,
          flexWrap: "wrap",
        }}
      >
        <Link
          href={`/grants/${grant.id}`}
          style={{ color: "var(--muted)", textDecoration: "none" }}
        >
          ← {grant.title}
        </Link>
        <Link
          href="/my-applications"
          style={{ color: "var(--muted)", textDecoration: "none" }}
        >
          My applications
        </Link>
      </div>

      {/* grant header */}
      <div
        className="card card-pad"
        style={{
          marginBottom: 18,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 0 }}>
          {grant.funder_name && (
            <div className="eyebrow" style={{ marginBottom: 4 }}>
              {grant.funder_name}
            </div>
          )}
          <h1 style={{ fontSize: 22, margin: 0, lineHeight: 1.25 }}>
            {grant.title}
          </h1>
          <p style={{ fontSize: 13, color: "var(--muted)", margin: "6px 0 0" }}>
            Your application
          </p>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 6,
          }}
        >
          {fit && (
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                padding: "3px 11px",
                borderRadius: 999,
                background: fit.eligible ? "#ecfdf5" : "#fef2f2",
                color: matchColor(fit.fitScore, fit.eligible),
              }}
            >
              {matchVerdict(fit.fitScore, fit.eligible)} · {fit.fitScore}
            </span>
          )}
          {deadline && (
            <span
              style={{ fontSize: 12, color: deadline.color, fontWeight: 600 }}
            >
              {deadline.label}
            </span>
          )}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 24,
          alignItems: "flex-start",
          flexWrap: "wrap",
        }}
      >
        <StepSpine
          steps={flow.steps}
          progress={flow.progress}
          submitted={flow.submitted}
          nextStep={flow.nextStep}
        />

        <div style={{ flex: 1, minWidth: 320 }}>
          {/* 1 — eligibility */}
          <section
            id="step-eligible"
            className="card card-pad"
            style={{ marginBottom: 18, scrollMarginTop: 16 }}
          >
            <SectionHead step={stepByKey("eligible")} />
            {!fit ? (
              <p style={{ fontSize: 13.5, color: "var(--ink-2)" }}>
                We can&apos;t check your eligibility yet.{" "}
                <Link
                  href="/profile#grant-eligibility"
                  style={{ color: "var(--accent)" }}
                >
                  Complete your organisation profile →
                </Link>{" "}
                so we can tell you whether you qualify.
              </p>
            ) : (
              <>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    marginBottom: 12,
                  }}
                >
                  <div
                    style={{
                      fontSize: 26,
                      fontWeight: 700,
                      color: matchColor(fit.fitScore, fit.eligible),
                    }}
                  >
                    {fit.fitScore}
                  </div>
                  <div style={{ fontSize: 13.5 }}>
                    <strong>{matchVerdict(fit.fitScore, fit.eligible)}</strong>
                    <span style={{ color: "var(--muted)" }}>
                      {" "}
                      — how well this grant fits your organisation
                    </span>
                  </div>
                </div>
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 5 }}
                >
                  {fit.reasons.map((r, i) => (
                    <Line key={`r${i}`} icon="✓" color="#059669">
                      {r}
                    </Line>
                  ))}
                  {fit.risks.map((r, i) => (
                    <Line key={`k${i}`} icon="!" color="#b45309">
                      {r}
                    </Line>
                  ))}
                  {fit.missingRequirements.map((m, i) => (
                    <Line key={`m${i}`} icon="→" color="var(--muted)">
                      {m}
                    </Line>
                  ))}
                </div>
                {(fit.missingRequirements.length > 0 || !fit.eligible) && (
                  <p style={{ fontSize: 12.5, marginTop: 10 }}>
                    <Link
                      href="/profile#grant-eligibility"
                      style={{ color: "var(--accent)" }}
                    >
                      Fix these in your profile →
                    </Link>
                  </p>
                )}
              </>
            )}
          </section>

          {/* 2 — what the funder needs (how to apply) */}
          <section id="step-requirements" style={{ scrollMarginTop: 16 }}>
            <div className="card card-pad" style={{ marginBottom: 12 }}>
              <SectionHead step={stepByKey("requirements")} />
              <p style={{ fontSize: 13.5, color: "var(--ink-2)", margin: 0 }}>
                {initialQuestions.length > 0
                  ? `This funder asks ${initialQuestions.length} question${initialQuestions.length === 1 ? "" : "s"} — you'll draft answers in step 4 below. First, here's how their process works:`
                  : "Here's how this funder's process works:"}
              </p>
            </div>
            <ApplicationGuide grantId={grant.id} initialGuide={guide} />
          </section>

          {/* 3 — evidence */}
          <section
            id="step-evidence"
            className="card card-pad"
            style={{ marginBottom: 18, scrollMarginTop: 16 }}
          >
            <SectionHead step={stepByKey("evidence")} />
            <p
              style={{
                fontSize: 13.5,
                color: "var(--ink-2)",
                margin: "0 0 12px",
              }}
            >
              {kbDocCount > 0
                ? `${kbDocCount} of the funder's document${kbDocCount === 1 ? "" : "s"} ${kbDocCount === 1 ? "is" : "are"} loaded for this application. Your answers in step 4 are grounded in them, and only this application uses them.`
                : "Add the funder's own documents (guidance, forms, criteria) so your answers are grounded in what they actually ask for. These stay scoped to this application only."}
            </p>
            <AddEvidenceButton
              grantId={grant.id}
              available={availableResources}
              onDone={scheduleRefresh}
            />
          </section>

          {/* 4 — answer the questions */}
          <section
            id="step-answers"
            className="card card-pad"
            style={{ marginBottom: 18, scrollMarginTop: 16 }}
          >
            <SectionHead step={stepByKey("answers")} />
            <RFPProcessor
              draftId={draftId}
              initialTitle={initialTitle}
              initialGrantId={grant.id}
              initialQuestions={initialQuestions}
              initialSelected={initialSelected}
              initialAnswers={initialAnswers}
              initialStep={initialStep}
              onSaved={scheduleRefresh}
            />
          </section>

          {/* 5 — budget */}
          <section id="step-budget" style={{ scrollMarginTop: 16 }}>
            <div className="card card-pad" style={{ marginBottom: 0 }}>
              <SectionHead step={stepByKey("budget")} />
            </div>
            <BudgetBuilder
              draftId={draftId}
              initialBudget={initialBudget}
              onSaved={scheduleRefresh}
            />
          </section>

          {/* 6 — review & submit */}
          <section
            id="step-review"
            className="card card-pad"
            style={{ marginBottom: 18, scrollMarginTop: 16 }}
          >
            <SectionHead step={stepByKey("review")} />
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {flow.checks.map((c) => (
                <div
                  key={c.label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 13,
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      flexShrink: 0,
                      width: 16,
                      height: 16,
                      borderRadius: "50%",
                      background: c.ok ? "#059669" : "var(--border)",
                      color: "#fff",
                      fontSize: 11,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {c.ok ? "✓" : "!"}
                  </span>
                  <span style={{ color: c.ok ? "var(--ink-2)" : "var(--ink)" }}>
                    {c.label}
                  </span>
                  {c.detail && (
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>
                      · {c.detail}
                    </span>
                  )}
                  {!c.ok && c.action && (
                    <button
                      onClick={() => c.anchorId && scrollToAnchor(c.anchorId)}
                      style={{
                        fontSize: 12,
                        background: "none",
                        border: "none",
                        color: "var(--accent)",
                        cursor: "pointer",
                        padding: 0,
                        textDecoration: "underline",
                      }}
                    >
                      {c.action.label} →
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div
              style={{
                display: "flex",
                gap: 12,
                alignItems: "center",
                flexWrap: "wrap",
                marginTop: 16,
                paddingTop: 14,
                borderTop: "1px solid var(--border)",
              }}
            >
              <a
                href={`/api/grants/applications/${draftId}/export`}
                className="btn ghost sm"
                style={{ fontSize: 13 }}
              >
                ⬇ Export your answers (Word)
              </a>
              <MarkSubmittedButton
                draftId={draftId}
                ready={flow.readyToSubmit}
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Line({
  icon,
  color,
  children,
}: {
  icon: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        fontSize: 13,
        lineHeight: 1.45,
        color: "var(--ink-2)",
      }}
    >
      <span style={{ color, flexShrink: 0, fontWeight: 700 }}>{icon}</span>
      <span>{children}</span>
    </div>
  );
}
