"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";

// v4: rewritten guide (tenders + grants + privacy) — bumping the key shows
// the new content once to people who dismissed the old drawer.
const STORAGE_KEY = "rfp_agent_welcomed_v4";

type Tab = "start" | "tenders" | "grants" | "documents";

const TAB_LABELS: Record<Tab, string> = {
  start: "Get started",
  tenders: "Tenders",
  grants: "Grants",
  documents: "Your documents & privacy",
};

// ── Content ───────────────────────────────────────────────────────────────
// Everything here is user-facing copy. Plain English only — no internal or
// engineering words (see tests/help-content.test.ts, which enforces this).

export interface HelpStep {
  step: string;
  colour: string;
  title: string;
  desc: string;
  actions: { label: string; href: string }[];
}

export const GET_STARTED_STEPS: HelpStep[] = [
  {
    step: "1",
    colour: "var(--accent)",
    title: "Tell us about your organisation",
    desc: "What you do, where you work, and what you can prove. Everything — matching, eligibility checks, fit — starts from your profile, so this is the best ten minutes you'll spend.",
    actions: [{ label: "Set up your profile →", href: "/profile" }],
  },
  {
    step: "2",
    colour: "var(--warn)",
    title: "Upload your evidence",
    desc: "Add past bids, case studies, policies and certificates to your evidence library. Your answers are drafted from these documents and nothing else — the more you add, the better the drafts.",
    actions: [{ label: "Open your evidence library →", href: "/documents" }],
  },
  {
    step: "3",
    colour: "var(--terra)",
    title: "See what matches",
    desc: "We compare new tenders and grants against your profile and show you the best fits, each with a plain-English reason why it suits you.",
    actions: [
      { label: "Tenders matched to you →", href: "/my-opportunities" },
      { label: "Grants matched to you →", href: "/my-grants" },
    ],
  },
  {
    step: "4",
    colour: "var(--success)",
    title: "Start a response",
    desc: "Open anything promising and start. We walk you through it step by step, and you review everything before it goes anywhere.",
    actions: [
      { label: "Find tenders →", href: "/opportunities" },
      { label: "Find grants →", href: "/grants" },
    ],
  },
];

export const TENDER_STEPS: HelpStep[] = [
  {
    step: "1",
    colour: "var(--accent)",
    title: "Find tenders",
    desc: "Browse open UK public-sector tenders, or go straight to Matched to you for the ones that fit your profile.",
    actions: [{ label: "Find tenders →", href: "/opportunities" }],
  },
  {
    step: "2",
    colour: "var(--warn)",
    title: "Check the fit",
    desc: "Save a tender and check the fit. We compare it with your profile and tell you, in plain English, what's strong and what's missing — before you spend days writing.",
    actions: [{ label: "Tenders matched to you →", href: "/my-opportunities" }],
  },
  {
    step: "3",
    colour: "var(--terra)",
    title: "Answer with AI help",
    desc: "Add the tender's question document and we pull out every question for you. Drafts are written from your own evidence library, and each answer shows which of your documents it came from.",
    actions: [{ label: "Open your evidence library →", href: "/documents" }],
  },
  {
    step: "4",
    colour: "var(--success)",
    title: "Review the drafts",
    desc: "Anything weakly evidenced is flagged for a person to check. Edit, approve, or send a question to the right teammate — nothing leaves without your say-so.",
    actions: [{ label: "Go to the review queue →", href: "/review" }],
  },
  {
    step: "5",
    colour: "var(--accent)",
    title: "Export and submit",
    desc: "Download your finished response as a Word document, ready for the buyer's portal.",
    actions: [{ label: "See your responses →", href: "/responses" }],
  },
];

export const GRANT_STEPS: HelpStep[] = [
  {
    step: "1",
    colour: "var(--accent)",
    title: "Find grants",
    desc: "Browse UK grant funding in one place, or see Matched to you for the grants that fit your organisation, ranked with reasons.",
    actions: [{ label: "Find grants →", href: "/grants" }],
  },
  {
    step: "2",
    colour: "var(--warn)",
    title: "Check you can apply",
    desc: "Before you invest any time, we check the funder's rules against your profile and tell you whether you're likely eligible — and what would hold you back.",
    actions: [{ label: "Grants matched to you →", href: "/my-grants" }],
  },
];

// Must match the step labels in lib/grants/application-flow.ts —
// tests/help-content.test.ts keeps them in sync.
export const GRANT_APPLICATION_STEP_NAMES = [
  "Check you're eligible",
  "What the funder needs",
  "Gather your evidence",
  "Answer the questions",
  "Build your budget",
  "Review & submit",
];

export const GRANT_APPLY_INTRO =
  "Start an application and we guide you through six steps, in order. You can stop and pick it up again any time — your progress is saved.";

export const UPLOAD_SUGGESTIONS = [
  "Past bids and tender responses — your best source of ready-made answers",
  "Case studies and project write-ups",
  "Policies — security, quality, environmental, HR",
  "Certificates and accreditations, such as Cyber Essentials or ISO 27001",
  "Team CVs and key company facts",
];

export const PRIVACY_FACTS = [
  "Your files are stored privately, for your organisation only.",
  "Only your own team can see or search them.",
  "They are used for one thing: drafting and evidencing your organisation's answers.",
];

export const HOW_ANSWERS_WORK =
  "When the AI drafts an answer, it searches your evidence library for the most relevant passages and writes from them — each answer shows which of your documents it drew on. Nothing is made up: anything weakly evidenced is flagged for your review.";

export const ALSO_IN_THE_APP = {
  text: "Also in the app: Investor events — UK pitch days and investor meetups, on a map, under Investors in the menu.",
  action: { label: "See investor events →", href: "/investor-events" },
};

/** Every user-visible help string, for the plain-English tests. */
export function allHelpStrings(): string[] {
  return [
    ...Object.values(TAB_LABELS),
    ...[...GET_STARTED_STEPS, ...TENDER_STEPS, ...GRANT_STEPS].flatMap((s) => [
      s.title,
      s.desc,
      ...s.actions.map((a) => a.label),
    ]),
    ...GRANT_APPLICATION_STEP_NAMES,
    GRANT_APPLY_INTRO,
    ...UPLOAD_SUGGESTIONS,
    ...PRIVACY_FACTS,
    HOW_ANSWERS_WORK,
    ALSO_IN_THE_APP.text,
    ALSO_IN_THE_APP.action.label,
  ];
}

// ── Shared bits ───────────────────────────────────────────────────────────

function StepCard({ step, onClose }: { step: HelpStep; onClose: () => void }) {
  return (
    <div
      className="card card-pad"
      style={{ borderLeft: `3px solid ${step.colour}` }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 6,
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            fontFamily: "var(--font-mono)",
            color: step.colour,
            background: `color-mix(in oklch, ${step.colour} 12%, var(--surface))`,
            padding: "2px 7px",
            borderRadius: 4,
            letterSpacing: "0.06em",
          }}
        >
          Step {step.step}
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>
          {step.title}
        </span>
      </div>
      <p
        style={{
          fontSize: 12.5,
          color: "var(--muted)",
          lineHeight: 1.6,
          marginBottom: 10,
        }}
      >
        {step.desc}
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {step.actions.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="btn ghost sm"
            style={{ fontSize: 11 }}
            onClick={onClose}
          >
            {a.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

function Intro({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: 12.5,
        color: "var(--muted)",
        lineHeight: 1.6,
        margin: 0,
      }}
    >
      {children}
    </p>
  );
}

// ── Tabs ──────────────────────────────────────────────────────────────────

function GetStartedTab({ onClose }: { onClose: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Intro>
        New here? Four steps to get set up — after that, the app does the heavy
        lifting.
      </Intro>
      {GET_STARTED_STEPS.map((s) => (
        <StepCard key={s.step} step={s} onClose={onClose} />
      ))}
      <div
        className="card"
        style={{ padding: "12px 14px", background: "var(--bg)" }}
      >
        <p
          style={{
            fontSize: 12,
            color: "var(--muted)",
            lineHeight: 1.6,
            marginBottom: 8,
          }}
        >
          {ALSO_IN_THE_APP.text}
        </p>
        <Link
          href={ALSO_IN_THE_APP.action.href}
          className="btn ghost sm"
          style={{ fontSize: 11 }}
          onClick={onClose}
        >
          {ALSO_IN_THE_APP.action.label}
        </Link>
      </div>
    </div>
  );
}

function TendersTab({ onClose }: { onClose: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Intro>From finding a tender to a finished, reviewed response.</Intro>
      {TENDER_STEPS.map((s) => (
        <StepCard key={s.step} step={s} onClose={onClose} />
      ))}
    </div>
  );
}

function GrantsTab({ onClose }: { onClose: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Intro>From finding a grant to a submitted application.</Intro>
      {GRANT_STEPS.map((s) => (
        <StepCard key={s.step} step={s} onClose={onClose} />
      ))}
      <div
        className="card card-pad"
        style={{ borderLeft: "3px solid var(--terra)" }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 6,
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              fontFamily: "var(--font-mono)",
              color: "var(--terra)",
              background:
                "color-mix(in oklch, var(--terra) 12%, var(--surface))",
              padding: "2px 7px",
              borderRadius: 4,
              letterSpacing: "0.06em",
            }}
          >
            Step 3
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>
            Apply step by step
          </span>
        </div>
        <p
          style={{
            fontSize: 12.5,
            color: "var(--muted)",
            lineHeight: 1.6,
            marginBottom: 10,
          }}
        >
          {GRANT_APPLY_INTRO}
        </p>
        <ol
          style={{
            margin: "0 0 12px",
            paddingLeft: 20,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {GRANT_APPLICATION_STEP_NAMES.map((name) => (
            <li
              key={name}
              style={{ fontSize: 12.5, color: "var(--ink)", lineHeight: 1.5 }}
            >
              {name}
            </li>
          ))}
        </ol>
        <Link
          href="/my-applications"
          className="btn ghost sm"
          style={{ fontSize: 11 }}
          onClick={onClose}
        >
          Go to my applications →
        </Link>
      </div>
    </div>
  );
}

function DocumentsTab({ onClose }: { onClose: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="card card-pad">
        <p
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "var(--ink)",
            marginBottom: 8,
          }}
        >
          What to upload
        </p>
        <ul
          style={{
            margin: "0 0 10px",
            paddingLeft: 18,
            display: "flex",
            flexDirection: "column",
            gap: 5,
          }}
        >
          {UPLOAD_SUGGESTIONS.map((s) => (
            <li
              key={s}
              style={{
                fontSize: 12.5,
                color: "var(--muted)",
                lineHeight: 1.55,
              }}
            >
              {s}
            </li>
          ))}
        </ul>
        <Link
          href="/documents"
          className="btn ghost sm"
          style={{ fontSize: 11 }}
          onClick={onClose}
        >
          Open your evidence library →
        </Link>
      </div>

      <div className="card card-pad">
        <p
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "var(--ink)",
            marginBottom: 8,
          }}
        >
          Private to your team
        </p>
        <ul
          style={{
            margin: 0,
            paddingLeft: 18,
            display: "flex",
            flexDirection: "column",
            gap: 5,
          }}
        >
          {PRIVACY_FACTS.map((f) => (
            <li
              key={f}
              style={{
                fontSize: 12.5,
                color: "var(--muted)",
                lineHeight: 1.55,
              }}
            >
              {f}
            </li>
          ))}
        </ul>
      </div>

      <div className="card card-pad">
        <p
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "var(--ink)",
            marginBottom: 8,
          }}
        >
          How answers use your documents
        </p>
        <p
          style={{
            fontSize: 12.5,
            color: "var(--muted)",
            lineHeight: 1.6,
            margin: 0,
          }}
        >
          {HOW_ANSWERS_WORK}
        </p>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export function HelpNavigator() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("start");
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handler = () => {
      setOpen(true);
      setTab("start");
    };
    window.addEventListener("show-welcome", handler);
    if (!localStorage.getItem(STORAGE_KEY)) {
      window.dispatchEvent(new CustomEvent("show-welcome"));
    }
    return () => window.removeEventListener("show-welcome", handler);
  }, []);

  const dismiss = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, "1");
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, dismiss]);

  if (!open) return null;

  return (
    <>
      <div className="drawer-scrim" onClick={dismiss} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-nav-title"
        className="drawer slide-in-right"
        style={{ width: 520 }}
      >
        <div
          className="drawer-head"
          style={{ justifyContent: "space-between" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                background: "var(--accent)",
                color: "var(--bg)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                fontWeight: 700,
                fontFamily: "var(--font-mono)",
                flexShrink: 0,
              }}
            >
              ?
            </div>
            <span
              id="help-nav-title"
              style={{ fontSize: 13.5, fontWeight: 500, color: "var(--ink)" }}
            >
              Help
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Link
              href="/help"
              onClick={dismiss}
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: "var(--accent)",
                textDecoration: "none",
              }}
            >
              Full guide →
            </Link>
            <button
              ref={closeRef}
              onClick={dismiss}
              aria-label="Close"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 4,
                color: "var(--muted)",
                display: "flex",
                alignItems: "center",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M12 4L4 12M4 4l8 8"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            borderBottom: "1px solid var(--border)",
            background: "var(--bg)",
            padding: "0 18px",
            flexShrink: 0,
            overflowX: "auto",
          }}
        >
          {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: "9px 12px",
                fontSize: 12.5,
                fontWeight: tab === t ? 500 : 400,
                color: tab === t ? "var(--ink)" : "var(--muted)",
                marginBottom: -1,
                background: "none",
                border: "none",
                borderBottomWidth: 2,
                borderBottomStyle: "solid",
                borderBottomColor: tab === t ? "var(--accent)" : "transparent",
                cursor: "pointer",
                fontFamily: "var(--font-sans)",
                transition: "color 150ms",
                whiteSpace: "nowrap",
              }}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        <div className="drawer-body">
          {tab === "start" && <GetStartedTab onClose={dismiss} />}
          {tab === "tenders" && <TendersTab onClose={dismiss} />}
          {tab === "grants" && <GrantsTab onClose={dismiss} />}
          {tab === "documents" && <DocumentsTab onClose={dismiss} />}
        </div>
      </div>
    </>
  );
}
