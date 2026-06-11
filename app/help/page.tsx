import type { Metadata } from "next";
import Link from "next/link";

// Authenticated like every other app page — middleware redirects signed-out
// visitors to /login, so this stays a plain server component.

export const metadata: Metadata = {
  title: "Help — UK Bid Intelligence",
  description:
    "How to find tenders and grants, draft evidence-backed answers, and keep your documents private to your team.",
};

// Long-form copy. Plain English only — no internal or engineering words
// (tests/help-content.test.ts scans this file).

const GET_STARTED = [
  {
    title: "Tell us about your organisation",
    body: "What you do, where you work, and what you can prove. Everything — matching, eligibility checks, fit — starts from your profile, so this is the best ten minutes you'll spend in the app.",
    links: [{ label: "Set up your profile →", href: "/profile" }],
  },
  {
    title: "Upload your evidence",
    body: "Add past bids, case studies, policies and certificates to your evidence library. Your answers are drafted from these documents and nothing else — the more you add, the better the drafts. Good things to upload: past bids and tender responses, case studies and project write-ups, policies (security, quality, environmental, HR), certificates and accreditations such as Cyber Essentials or ISO 27001, team CVs and key company facts.",
    links: [{ label: "Open your evidence library →", href: "/documents" }],
  },
  {
    title: "See what matches",
    body: "We compare new tenders and grants against your profile and show you the best fits, each with a plain-English reason why it suits you. Check in every few days — new opportunities arrive all the time.",
    links: [
      { label: "Tenders matched to you →", href: "/my-opportunities" },
      { label: "Grants matched to you →", href: "/my-grants" },
    ],
  },
  {
    title: "Start a response",
    body: "Open anything promising and start. We walk you through it step by step, and you review everything before it goes anywhere.",
    links: [
      { label: "Find tenders →", href: "/opportunities" },
      { label: "Find grants →", href: "/grants" },
    ],
  },
];

const TENDERS = [
  {
    title: "Find tenders",
    body: "Browse open UK public-sector tenders under Find tenders, with filters for region, stage and keyword. Or go straight to Matched to you, where we've already shortlisted the ones that fit your profile.",
    links: [{ label: "Find tenders →", href: "/opportunities" }],
  },
  {
    title: "Check the fit",
    body: "Save a tender that looks promising, then check the fit. We compare it with your profile and tell you, in plain English, what's strong, what's missing, and whether it's worth your time — before you spend days writing.",
    links: [{ label: "Tenders matched to you →", href: "/my-opportunities" }],
  },
  {
    title: "Answer with AI help",
    body: "Add the tender's question document and we pull out every question for you — no copying and pasting. Drafts are written from your own evidence library, and each answer shows which of your documents it came from, so you can check the source in one click.",
    links: [{ label: "Open your evidence library →", href: "/documents" }],
  },
  {
    title: "Review before anything leaves",
    body: "Anything weakly evidenced is flagged for a person to check in the review queue. Edit, approve, or send a question to the right teammate. Nothing is submitted without your say-so.",
    links: [{ label: "Go to the review queue →", href: "/review" }],
  },
  {
    title: "Export and submit",
    body: "When you're happy, download the finished response as a Word document, ready for the buyer's portal, with a checklist of the must-have requirements so nothing gets missed.",
    links: [{ label: "See your responses →", href: "/responses" }],
  },
];

const GRANTS = [
  {
    title: "Find grants",
    body: "Browse UK grant funding in one place under Find grants, or see Matched to you for the grants that fit your organisation, ranked with reasons.",
    links: [{ label: "Find grants →", href: "/grants" }],
  },
  {
    title: "Check you can apply",
    body: "Before you invest any time, we check the funder's rules against your profile and tell you whether you're likely eligible — and exactly what would hold you back if not.",
    links: [{ label: "Grants matched to you →", href: "/my-grants" }],
  },
  {
    title: "Apply step by step",
    body: "Start an application and we guide you through six steps, in order. You can stop and pick it up again any time — your progress is saved, and your applications live in My applications.",
    links: [{ label: "Go to my applications →", href: "/my-applications" }],
  },
];

// Must match the step labels in lib/grants/application-flow.ts —
// tests/help-content.test.ts keeps them in sync.
const GRANT_APPLICATION_STEP_NAMES = [
  "Check you're eligible",
  "What the funder needs",
  "Gather your evidence",
  "Answer the questions",
  "Build your budget",
  "Review & submit",
];

const PRIVACY_FACTS = [
  "Your files are stored privately, for your organisation only.",
  "Only your own team can see or search them.",
  "They are used for one thing: drafting and evidencing your organisation's answers.",
];

function StepBlock({
  n,
  title,
  body,
  links,
}: {
  n: number;
  title: string;
  body: string;
  links: { label: string; href: string }[];
}) {
  return (
    <div className="card card-pad" style={{ marginBottom: 12 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 8,
        }}
      >
        <span
          style={{
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: "color-mix(in oklch, var(--accent) 14%, transparent)",
            color: "var(--accent)",
            fontSize: 11,
            fontWeight: 700,
            fontFamily: "var(--font-mono)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {n}
        </span>
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>
          {title}
        </span>
      </div>
      <p
        style={{
          fontSize: 13,
          color: "var(--muted)",
          lineHeight: 1.65,
          marginBottom: 10,
        }}
      >
        {body}
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="btn ghost sm"
            style={{ fontSize: 11.5 }}
          >
            {l.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function HelpPage() {
  return (
    <div style={{ maxWidth: 760 }}>
      <div
        className="page-head"
        style={{ flexDirection: "column", alignItems: "flex-start", gap: 8 }}
      >
        <div className="eyebrow">Help</div>
        <h1>
          How to use <em>Bid Intelligence</em>
        </h1>
        <p className="subtitle">
          Find UK tenders and grants that fit your organisation, draft answers
          from your own evidence, and review everything before it goes out. No
          jargon, no surprises.
        </p>
      </div>

      <div className="section-title">Get started</div>
      <p
        style={{
          fontSize: 13,
          color: "var(--muted)",
          lineHeight: 1.65,
          margin: "0 0 14px",
        }}
      >
        Four steps to get set up — after that, the app does the heavy lifting.
      </p>
      {GET_STARTED.map((s, i) => (
        <StepBlock key={s.title} n={i + 1} {...s} />
      ))}

      <div className="section-title" style={{ marginTop: 36 }}>
        Tenders — selling to the public sector
      </div>
      <p
        style={{
          fontSize: 13,
          color: "var(--muted)",
          lineHeight: 1.65,
          margin: "0 0 14px",
        }}
      >
        From finding a tender to a finished, reviewed response.
      </p>
      {TENDERS.map((s, i) => (
        <StepBlock key={s.title} n={i + 1} {...s} />
      ))}

      <div className="section-title" style={{ marginTop: 36 }}>
        Grants — funding for your work
      </div>
      <p
        style={{
          fontSize: 13,
          color: "var(--muted)",
          lineHeight: 1.65,
          margin: "0 0 14px",
        }}
      >
        From finding a grant to a submitted application.
      </p>
      {GRANTS.map((s, i) => (
        <StepBlock key={s.title} n={i + 1} {...s} />
      ))}
      <div className="card card-pad" style={{ marginBottom: 12 }}>
        <p
          style={{
            fontSize: 13.5,
            fontWeight: 600,
            color: "var(--ink)",
            marginBottom: 8,
          }}
        >
          The six application steps
        </p>
        <ol
          style={{
            margin: 0,
            paddingLeft: 20,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          {GRANT_APPLICATION_STEP_NAMES.map((name) => (
            <li
              key={name}
              style={{ fontSize: 13, color: "var(--ink)", lineHeight: 1.5 }}
            >
              {name}
            </li>
          ))}
        </ol>
      </div>

      <div className="section-title" style={{ marginTop: 36 }}>
        How the AI works, honestly
      </div>
      <div className="card card-pad" style={{ marginBottom: 12 }}>
        <p
          style={{
            fontSize: 13,
            color: "var(--muted)",
            lineHeight: 1.65,
            margin: 0,
          }}
        >
          We search your evidence library for the most relevant passages and
          draft an answer that cites them. Nothing is made up — anything weakly
          evidenced is flagged for your review. Each answer shows which of your
          documents it drew on, so you can check the source in one click. The AI
          drafts; you decide.
        </p>
      </div>

      <div className="section-title" style={{ marginTop: 36 }}>
        Your documents &amp; privacy
      </div>
      <div className="card card-pad" style={{ marginBottom: 12 }}>
        <ul
          style={{
            margin: "0 0 12px",
            paddingLeft: 18,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          {PRIVACY_FACTS.map((f) => (
            <li
              key={f}
              style={{ fontSize: 13, color: "var(--ink)", lineHeight: 1.6 }}
            >
              {f}
            </li>
          ))}
        </ul>
        <p
          style={{
            fontSize: 13,
            color: "var(--muted)",
            lineHeight: 1.65,
            marginBottom: 12,
          }}
        >
          Nobody outside your organisation — not other customers, not anyone
          browsing the app — can see or search what you upload.
        </p>
        <Link
          href="/documents"
          className="btn ghost sm"
          style={{ fontSize: 11.5 }}
        >
          Open your evidence library →
        </Link>
      </div>

      <div
        className="card"
        style={{
          padding: "14px 18px",
          background: "var(--bg)",
          marginBottom: 24,
        }}
      >
        <p
          style={{
            fontSize: 12.5,
            color: "var(--muted)",
            lineHeight: 1.6,
            margin: 0,
          }}
        >
          Also in the app:{" "}
          <Link
            href="/investor-events"
            style={{ color: "var(--accent)", textDecoration: "none" }}
          >
            Investor events
          </Link>{" "}
          — UK pitch days and investor meetups, on a map, under Investors in the
          menu.
        </p>
      </div>
    </div>
  );
}
