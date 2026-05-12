'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'

const STORAGE_KEY = 'rfp_agent_welcomed_v2'

type Tab = 'guide' | 'demo' | 'features' | 'pipeline'

const TAB_LABELS: Record<Tab, string> = {
  guide: 'Guide',
  demo: 'Demo',
  features: 'Features',
  pipeline: 'How it works',
}

// ── Data ──────────────────────────────────────────────────────────────────

const GUIDE_STEPS = [
  {
    num: 1,
    title: 'Frame the problem',
    narrative: 'Open with: "This is a RAG pipeline — the model can only cite chunks it actually retrieved from your knowledge base. It cannot invent answers without tripping a confidence threshold. Every claim traces back to a source document." Point to the dashboard document count and the three-step workflow.',
    links: [] as { label: string; href: string }[],
  },
  {
    num: 2,
    title: 'Knowledge base tour',
    narrative: 'Navigate to Knowledge Base. Show the document grid — 8 file types accepted. Click a document to open the chunk panel and show how each section becomes its own embedding. The section title prefix in each chunk is what gives the vector a clearer topic signal than a raw character slice.',
    links: [{ label: 'Knowledge Base →', href: '/documents' }],
  },
  {
    num: 3,
    title: 'Core AML query',
    narrative: 'Go to Ask. Run the AML review time question from the Fintech scenario. Walk through every response section: executive summary, full draft, confidence badge, citations panel (each citation traces to a real chunk), missing information flags, and suggested next actions. Point out that the model was forced to be explicit about gaps rather than fill them in.',
    links: [{ label: 'Ask →', href: '/ask' }, { label: 'Demo Scenarios →', href: '/demo' }],
  },
  {
    num: 4,
    title: 'Hallucination test',
    narrative: 'Run the "Off-topic test" from the Enterprise Security scenario (hospital staffing / NHS workforce). The agent returns low confidence and a "no relevant sources" flag — it does not invent a healthcare pitch. This is the most important thing to demonstrate: failure mode is graceful degradation, not plausible fiction.',
    links: [{ label: 'Enterprise Security →', href: '/demo' }],
  },
  {
    num: 5,
    title: 'Full RFP batch run',
    narrative: 'Navigate to RFP Runs. Upload a PDF or DOCX (or show a past run from History). The agent extracts every numbered requirement, lets you deselect any you don\'t want, then answers all selected questions in parallel with a live progress bar. Low-confidence answers surface a confirmation prompt to send for human review. Export the complete response as Word.',
    links: [{ label: 'RFP Runs →', href: '/rfp' }, { label: 'RFP History →', href: '/rfp/history' }],
  },
  {
    num: 6,
    title: 'Human review & tech stack',
    narrative: 'Show the Review Queue — answers routed there by confidence score or risk level. Each item has an SLA timer, topic-owner assignment, and a full audit trail. Close with the stack: pgvector + BM25 hybrid search → RRF fusion → gpt-4o-mini rerank (14→6 chunks) → GPT-4o structured generation → citation check → SSE stream to client.',
    links: [{ label: 'Review Queue →', href: '/review' }, { label: 'Admin →', href: '/admin' }],
  },
]

const SCENARIOS = [
  {
    id: 'fintech-aml',
    title: 'Fintech AML RFP',
    description: 'A digital bank evaluating AI vendors to improve AML compliance. Covers past success, implementation approach, and security posture.',
    industry: 'Fintech',
    questions: [
      { label: 'Reduction in AML review time', query: 'Draft a response to a fintech customer asking how we reduce AML review time. Include quantified evidence if available.', context: { industry: 'fintech', response_type: 'case-study' } },
      { label: 'Security and data handling', query: 'The customer is a regulated financial institution asking about our data handling and security certifications. What can we tell them?', context: { industry: 'fintech', response_type: 'security-compliance' } },
      { label: 'Implementation timeline', query: 'What is our standard implementation timeline and what do we need from the customer team?', context: { industry: 'fintech', response_type: 'implementation-approach' } },
    ],
  },
  {
    id: 'legaltech',
    title: 'Legaltech Contract Review',
    description: 'A law firm wanting to reduce associate time on first-pass contract review. Evaluating AI for clause extraction and playbook comparison.',
    industry: 'Legaltech',
    questions: [
      { label: 'Contract review case study', query: 'Which case studies are relevant to a legaltech workflow automation pitch for contract review?', context: { industry: 'legaltech', response_type: 'case-study' } },
      { label: 'First-pass review time reduction', query: 'What evidence do we have that our platform reduces first-pass contract review time?', context: { industry: 'legaltech' } },
      { label: 'Human-in-the-loop oversight', query: 'The law firm wants to understand how we maintain human oversight and accountability when using AI for legal document review.', context: { industry: 'legaltech', response_type: 'technical-answer' } },
    ],
  },
  {
    id: 'enterprise-security',
    title: 'Enterprise Security Due Diligence',
    description: "An enterprise buyer's infosec team reviewing the platform before procurement. Specifics on certifications, data handling, and access controls.",
    industry: 'Enterprise SaaS',
    questions: [
      { label: 'SOC 2 and certifications', query: 'Do we have SOC 2 certification? What security certifications do we hold?', context: { response_type: 'security-compliance' } },
      { label: 'Data isolation and residency', query: 'The customer wants to know how we isolate their data and whether they can choose data residency.', context: { response_type: 'security-compliance' } },
      { label: 'Off-topic test — hallucination check', query: 'Can this platform help with hospital staffing optimisation and NHS workforce planning?', context: {} },
    ],
  },
]

const FEATURES = [
  { icon: '⬆', title: 'Document ingestion', desc: '8 file types: PDF, DOCX, CSV, XLSX, HTML, JSON, Markdown, plain text. Documents are split into overlapping ~500-token chunks, embedded with text-embedding-3-small, and stored in Supabase (pgvector).' },
  { icon: '⌕', title: 'Hybrid search + reranking', desc: 'BM25 keyword search and pgvector semantic search run in parallel, fused with Reciprocal Rank Fusion. A second gpt-4o-mini pass reranks the top 14 candidates down to the 6 most relevant chunks.' },
  { icon: '≋', title: 'Streaming generation', desc: 'Responses stream token-by-token via Server-Sent Events. Executive summary and draft appear within ~1 second; citations and confidence fade in as the stream completes.' },
  { icon: '✓', title: 'Citation verification', desc: 'After generation, every cited chunk ID is checked against what was actually retrieved. Citations the model invented are stripped before the response reaches the client.' },
  { icon: '⬡', title: 'RFP batch processing', desc: 'Upload a full RFP PDF or DOCX. The agent extracts every numbered requirement, lets you review and remove questions, then answers all selected requirements in parallel. Export the complete response as a formatted Word document.' },
  { icon: '⚐', title: 'Human review queue', desc: 'Answers below the confidence threshold or classified as high-risk are routed to the Review Queue. Each item shows topic, risk level, SLA countdown, and assigned reviewer. Bulk approve or reject.' },
  { icon: '✎', title: 'Review detail', desc: 'Reviewers read the AI draft, edit it inline, and approve or reject. Editing and approval are separate steps. Notify missing-information owners by team. Full audit trail per item.' },
  { icon: '⚙', title: 'Admin routing', desc: 'Configure which team owns each topic (Legal, Engineering, Commercial, etc.), set owner and backup emails, choose notification channel (Email / Slack / Both), and set escalation SLAs in hours.' },
  { icon: '▶', title: 'Demo scenarios', desc: '3 preloaded industry scenarios — Fintech AML, Legaltech Contract Review, Enterprise Security — each with representative questions and one-click launch links.' },
  { icon: '◷', title: 'Query history', desc: 'Every question and full response is stored. Expand any past query inline to see the complete response with context tags, confidence level, and citations. Re-run with one click.' },
  { icon: '⚑', title: 'Edit flagging', desc: 'When a reviewer edits an AI draft, the approved answer displays a persistent "Edited by reviewer" badge. Hovering the badge reveals the original generated text so recipients know what changed.' },
]

const PIPELINE_STEPS = [
  {
    phase: 'Ingest',
    colour: 'var(--accent)',
    headline: 'Documents → chunks → embeddings → Postgres',
    tech: '8 file types accepted. Each document is split on markdown headings into overlapping ~500-token chunks, each prefixed with document title and section name. OpenAI text-embedding-3-small converts each chunk to a 1536-dim vector stored in Supabase via the pgvector extension.',
  },
  {
    phase: 'Retrieve',
    colour: 'var(--warn)',
    headline: 'BM25 + pgvector → RRF fusion → gpt-4o-mini rerank',
    tech: 'Two searches run in parallel: full-text BM25 (Postgres tsvector) and cosine similarity (pgvector). Results merge with Reciprocal Rank Fusion. The top 14 candidates pass to gpt-4o-mini which reranks them to the 6 chunks most genuinely relevant to the specific question.',
  },
  {
    phase: 'Generate',
    colour: 'var(--terra)',
    headline: 'GPT-4o structured output → SSE stream → citation check',
    tech: 'The 6 chunks plus the question go to GPT-4o with a Zod-schema structured output format — one source of truth from database to UI. The response streams token-by-token via SSE. After streaming, a citation verification pass strips any chunk IDs the model invented that were not in the retrieved set.',
  },
  {
    phase: 'Review',
    colour: 'var(--success)',
    headline: 'Confidence threshold → review queue → human approval',
    tech: 'Answers with score below 0.75 or classified as high-risk are surfaced to the user for confirmation before routing to the Review Queue. Each review item is assigned to a topic owner with email or Slack notification. Approvals are saved back to the knowledge base for future retrieval.',
  },
]

// ── Sub-tab components ────────────────────────────────────────────────────

function GuideTab() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <p style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 20 }}>
        A 10-minute live demo flow. Each step has the talking points and direct links to the relevant page.
      </p>
      {GUIDE_STEPS.map((step, i) => (
        <div
          key={step.num}
          style={{
            display: 'flex',
            gap: 14,
            paddingBottom: 20,
            marginBottom: i < GUIDE_STEPS.length - 1 ? 20 : 0,
            borderBottom: i < GUIDE_STEPS.length - 1 ? '1px solid var(--border)' : 'none',
          }}
        >
          <div style={{
            width: 24,
            height: 24,
            borderRadius: '50%',
            background: 'var(--accent)',
            color: 'var(--bg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            fontWeight: 600,
            fontFamily: 'var(--font-mono)',
            flexShrink: 0,
            marginTop: 1,
          }}>
            {step.num}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>
              {step.title}
            </p>
            <p style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6, marginBottom: step.links.length ? 10 : 0 }}>
              {step.narrative}
            </p>
            {step.links.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {step.links.map((l) => (
                  <Link key={l.href} href={l.href} className="btn sm" style={{ fontSize: 11.5 }}>
                    {l.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function DemoTab({ onClose }: { onClose: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{
        padding: '8px 12px',
        background: 'color-mix(in oklch, var(--warn) 10%, var(--surface))',
        border: '1px solid color-mix(in oklch, var(--warn) 25%, transparent)',
        borderRadius: 'var(--r-sm)',
        fontSize: 12,
        color: 'var(--muted)',
      }}>
        Load the sample dataset from the Dashboard before running these scenarios.
      </div>
      {SCENARIOS.map((scenario) => (
        <div key={scenario.id} className="card" style={{ overflow: 'hidden' }}>
          <div className="card-head">
            <h3 style={{ fontSize: 13, fontWeight: 600 }}>{scenario.title}</h3>
            <span className="badge mono" style={{ fontSize: 10.5 }}>{scenario.industry}</span>
          </div>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
            <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>{scenario.description}</p>
          </div>
          <div>
            {scenario.questions.map((q, i) => {
              const params = new URLSearchParams({ q: q.query })
              if (q.context) Object.entries(q.context).forEach(([k, v]) => params.set(k, v))
              return (
                <div
                  key={i}
                  style={{
                    padding: '11px 16px',
                    borderBottom: i < scenario.questions.length - 1 ? '1px solid var(--border)' : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--ink)', marginBottom: 2 }}>{q.label}</p>
                    <p style={{
                      fontSize: 11.5,
                      color: 'var(--muted)',
                      lineHeight: 1.4,
                      overflow: 'hidden',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical' as const,
                    }}>
                      {q.query}
                    </p>
                  </div>
                  <Link
                    href={`/ask?${params.toString()}`}
                    className="btn sm"
                    style={{ flexShrink: 0, fontSize: 11.5 }}
                    onClick={onClose}
                  >
                    Ask →
                  </Link>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function FeaturesTab() {
  return (
    <div>
      <p style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 16 }}>
        Everything that has been built into this demo — all features are live and working.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="card"
            style={{ padding: '12px 14px' }}
          >
            <div style={{ fontSize: 18, marginBottom: 6, lineHeight: 1 }}>{f.icon}</div>
            <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>{f.title}</p>
            <p style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5 }}>{f.desc}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function PipelineTab() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 4 }}>
        The four stages every query passes through, from document upload to human-approved answer.
      </p>
      {PIPELINE_STEPS.map((step) => (
        <div
          key={step.phase}
          className="card card-pad"
          style={{ borderLeft: `3px solid ${step.colour}` }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{
              fontSize: 10,
              fontWeight: 700,
              fontFamily: 'var(--font-mono)',
              color: step.colour,
              background: `color-mix(in oklch, ${step.colour} 12%, var(--surface))`,
              padding: '2px 7px',
              borderRadius: 4,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}>
              {step.phase}
            </span>
          </div>
          <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', marginBottom: 6, lineHeight: 1.4, fontFamily: 'var(--font-serif)' }}>
            {step.headline}
          </p>
          <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
            {step.tech}
          </p>
        </div>
      ))}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────

export function HelpNavigator() {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('guide')
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) setOpen(true)
    const handler = () => setOpen(true)
    window.addEventListener('show-welcome', handler)
    return () => window.removeEventListener('show-welcome', handler)
  }, [])

  const dismiss = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, '1')
    setOpen(false)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') dismiss() }
    window.addEventListener('keydown', onKey)
    closeRef.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [open, dismiss])

  if (!open) return null

  return (
    <>
      <div className="drawer-scrim" onClick={dismiss} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-nav-title"
        className="drawer slide-in-right"
        style={{ width: 560 }}
      >
        {/* Header */}
        <div className="drawer-head" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 22,
              height: 22,
              borderRadius: '50%',
              background: 'var(--accent)',
              color: 'var(--bg)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              fontWeight: 700,
              fontFamily: 'var(--font-mono)',
              flexShrink: 0,
            }}>
              ?
            </div>
            <span id="help-nav-title" style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)' }}>
              Help &amp; Demo Guide
            </span>
          </div>
          <button
            ref={closeRef}
            onClick={dismiss}
            aria-label="Close"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 4,
              color: 'var(--muted)',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Tab strip */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg)',
          padding: '0 18px',
          flexShrink: 0,
        }}>
          {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '9px 14px',
                fontSize: 12.5,
                fontWeight: tab === t ? 500 : 400,
                color: tab === t ? 'var(--ink)' : 'var(--muted)',
                borderBottom: `2px solid ${tab === t ? 'var(--accent)' : 'transparent'}`,
                marginBottom: -1,
                background: 'none',
                border: 'none',
                borderBottomWidth: 2,
                borderBottomStyle: 'solid',
                borderBottomColor: tab === t ? 'var(--accent)' : 'transparent',
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
                transition: 'color 150ms',
              }}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        {/* Scrollable body */}
        <div className="drawer-body">
          {tab === 'guide' && <GuideTab />}
          {tab === 'demo' && <DemoTab onClose={dismiss} />}
          {tab === 'features' && <FeaturesTab />}
          {tab === 'pipeline' && <PipelineTab />}
        </div>
      </div>
    </>
  )
}
