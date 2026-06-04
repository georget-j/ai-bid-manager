import Link from 'next/link'
import { SampleDataLoader } from '@/components/SampleDataLoader'
import { getServiceSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Bound the dashboard's DB wait. If the knowledge base is unreachable (e.g. a
// paused free-tier database), the connection can hang for several seconds before
// it fails — which would block this server-rendered page. Abort after 2.5s and
// render without stats rather than make every visitor wait on a dead connection.
const STATS_TIMEOUT_MS = 2500

async function getKnowledgeBaseStats() {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), STATS_TIMEOUT_MS)

  try {
    const supabase = getServiceSupabase()

    const [{ data: docs, error: docsError }, { count: chunkCount, error: chunksError }] =
      await Promise.all([
        supabase.from('documents').select('file_name').abortSignal(controller.signal),
        supabase
          .from('document_chunks')
          .select('id', { count: 'exact', head: true })
          .abortSignal(controller.signal),
      ])

    if (docsError || chunksError) return null

    return {
      total_documents: docs?.length ?? 0,
      total_chunks: chunkCount ?? 0,
    }
  } catch {
    // Timed out or unreachable — degrade gracefully to a stats-free dashboard.
    return null
  } finally {
    clearTimeout(timeout)
  }
}

export default async function HomePage() {
  const stats = await getKnowledgeBaseStats()

  return (
    <div style={{ maxWidth: 900 }}>
      <div className="page-head" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
        <div className="eyebrow">Dashboard</div>
        <h1>
          Your enterprise<br /><em>knowledge agent</em>
        </h1>
        <p className="subtitle">
          Draft RFP responses grounded in your internal knowledge base.
          Upload documents, ask questions, and get structured answers with source citations,
          evidence assessment, and missing information flags.
        </p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 36 }}>
          <div className="kpi">
            <div className="eyebrow">Documents</div>
            <div className="kpi-value">{stats.total_documents}</div>
            <div className="kpi-sub">indexed in knowledge base</div>
          </div>
          <div className="kpi">
            <div className="eyebrow">Chunks</div>
            <div className="kpi-value">{stats.total_chunks.toLocaleString()}</div>
            <div className="kpi-sub">semantic search units</div>
          </div>
          <div className="kpi">
            <div className="eyebrow">Status</div>
            <div className="kpi-value" style={{ fontSize: 22, marginTop: 8 }}>
              <span className="badge success">
                <span className="dot success" />
                Ready
              </span>
            </div>
            <div className="kpi-sub">all systems operational</div>
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="section-title">Get started</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 36 }}>
        <Link href="/ask" className="card card-pad" style={{ display: 'block', textDecoration: 'none', transition: 'all 140ms' }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Ask a question</div>
          <p style={{ fontFamily: 'var(--font-serif)', fontSize: 18, lineHeight: 1.3, letterSpacing: '-0.01em', color: 'var(--ink)', marginBottom: 12 }}>
            Draft an RFP response from your knowledge base
          </p>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16, lineHeight: 1.5 }}>
            Type a question or proposal requirement and get a structured, cited response in seconds.
          </p>
          <span className="btn accent">Ask now →</span>
        </Link>

        <div className="card card-pad">
          <div className="eyebrow" style={{ marginBottom: 10 }}>Knowledge base</div>
          <p style={{ fontFamily: 'var(--font-serif)', fontSize: 18, lineHeight: 1.3, letterSpacing: '-0.01em', color: 'var(--ink)', marginBottom: 12 }}>
            Load sample documents or upload your own
          </p>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16, lineHeight: 1.5 }}>
            Upload PDFs, DOCX, CSV, Markdown, and more. Documents are chunked and embedded for semantic search.
          </p>
          <SampleDataLoader />
        </div>
      </div>

      {/* How it works */}
      <div className="section-title">How it works</div>
      <div className="card" style={{ overflow: 'hidden' }}>
        {[
          { step: '1', title: 'Ingest documents', desc: 'Upload capability statements, case studies, security notes, and implementation guides.' },
          { step: '2', title: 'Ask a question', desc: 'Type an RFP question or proposal requirement in plain language.' },
          { step: '3', title: 'Get a structured response', desc: 'Receive a draft answer with citations, confidence level, evidence assessment, and flagged gaps.' },
        ].map((item, i) => (
          <div key={item.step} style={{ padding: '20px 24px', borderBottom: i < 2 ? '1px solid var(--border)' : 'none', display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent-tint)', color: 'var(--accent)', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
              {item.step}
            </div>
            <div>
              <p style={{ fontWeight: 500, color: 'var(--ink)', marginBottom: 4 }}>{item.title}</p>
              <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>{item.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Quick nav */}
      <div style={{ display: 'flex', gap: 10, marginTop: 28, flexWrap: 'wrap' }}>
        <Link href="/ask" className="btn primary">Ask a question</Link>
        <Link href="/demo" className="btn">View demo scenarios</Link>
        <Link href="/documents" className="btn ghost">Manage documents</Link>
      </div>
    </div>
  )
}
