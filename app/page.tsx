import Link from "next/link";
import { SampleDataLoader } from "@/components/SampleDataLoader";
import { getServiceSupabase } from "@/lib/supabase";
import { getAuthUser } from "@/lib/supabase-server";
import { getOrgIdForUser } from "@/lib/org";

export const dynamic = "force-dynamic";

const STATS_TIMEOUT_MS = 2500;

async function getDashboardStats() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), STATS_TIMEOUT_MS);

  try {
    const supabase = getServiceSupabase();

    // Resolve org_id — null in demo mode
    const user = await getAuthUser().catch(() => null);
    const orgId = user ? await getOrgIdForUser(user.id) : null;

    const now = new Date().toISOString();
    const sevenDays = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const fourteenDays = new Date(
      Date.now() + 14 * 24 * 60 * 60 * 1000,
    ).toISOString();

    // Fetch org's document IDs first so we can scope chunk count to this org.
    // document_chunks has no org_id column, so we filter via document_id.
    const orgDocIds: string[] = orgId
      ? (
          (
            await supabase
              .from("documents")
              .select("id")
              .eq("org_id", orgId)
              .abortSignal(controller.signal)
          ).data ?? []
        ).map((d) => d.id)
      : [];

    const [
      { count: docCount },
      { count: chunkCount },
      { count: oppCount },
      { count: deadlineCount },
      { count: pipelineCount },
      { count: unseenCount },
      { data: upcomingRaw },
      { data: sourcesRaw },
    ] = await Promise.all([
      Promise.resolve({ count: orgDocIds.length }),
      orgDocIds.length > 0
        ? supabase
            .from("document_chunks")
            .select("id", { count: "exact", head: true })
            .in("document_id", orgDocIds)
            .abortSignal(controller.signal)
        : Promise.resolve({ count: 0 }),
      supabase
        .from("opportunities")
        .select("id", { count: "exact", head: true })
        .abortSignal(controller.signal),
      supabase
        .from("opportunities")
        .select("id", { count: "exact", head: true })
        .eq("status", "active")
        .gte("deadline_at", now)
        .lte("deadline_at", sevenDays)
        .abortSignal(controller.signal),
      orgId
        ? supabase
            .from("bid_pipeline")
            .select("id", { count: "exact", head: true })
            .eq("org_id", orgId)
            .in("status", [
              "reviewing",
              "bid",
              "in-progress",
              "awaiting-review",
            ])
            .abortSignal(controller.signal)
        : Promise.resolve({ count: 0 }),
      orgId
        ? supabase
            .from("alert_matches")
            .select("id", { count: "exact", head: true })
            .eq("org_id", orgId)
            .eq("seen", false)
            .abortSignal(controller.signal)
        : Promise.resolve({ count: 0 }),
      supabase
        .from("opportunities")
        .select("id, title, buyer_name, deadline_at, value_amount, source_name")
        .eq("status", "active")
        .gte("deadline_at", now)
        .lte("deadline_at", fourteenDays)
        .order("deadline_at", { ascending: true })
        .limit(7)
        .abortSignal(controller.signal),
      supabase
        .from("sources")
        .select(
          "name, display_name, enabled, last_successful_sync_at, last_error",
        )
        .order("display_name", { ascending: true })
        .abortSignal(controller.signal),
    ]);

    type UpcomingItem = {
      id: string;
      title: string;
      buyer_name: string | null;
      deadline_at: string | null;
      value_amount: number | null;
      source_name: string;
      days_left: number | null;
    };

    const nowMs = Date.now();
    const upcoming: UpcomingItem[] = (upcomingRaw ?? []).map((opp) => ({
      ...(opp as Omit<UpcomingItem, "days_left">),
      days_left: opp.deadline_at
        ? Math.ceil(
            (new Date(opp.deadline_at).getTime() - nowMs) /
              (1000 * 60 * 60 * 24),
          )
        : null,
    }));

    type SourceStatus = {
      name: string;
      display_name: string;
      enabled: boolean;
      last_successful_sync_at: string | null;
      last_error: string | null;
    };

    return {
      doc_count: docCount ?? 0,
      total_chunks: chunkCount ?? 0,
      opp_count: oppCount ?? 0,
      deadline_count: deadlineCount ?? 0,
      pipeline_count: pipelineCount ?? 0,
      unseen_alerts: unseenCount ?? 0,
      upcoming,
      sources: (sourcesRaw ?? []) as SourceStatus[],
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export default async function HomePage() {
  const stats = await getDashboardStats();

  return (
    <div style={{ maxWidth: 900 }}>
      <div
        className="page-head"
        style={{ flexDirection: "column", alignItems: "flex-start", gap: 8 }}
      >
        <div className="eyebrow">Dashboard</div>
        <h1>
          Find, qualify, and respond
          <br />
          <em>to UK public-sector tenders</em>
        </h1>
        <p className="subtitle">
          Monitor UK government, council, NHS, and public-sector procurement
          opportunities. Score bid fit, identify missing evidence, and draft
          compliant RFP responses using your approved company knowledge base.
        </p>
      </div>

      {/* Stats row */}
      <div
        className="kpi-grid"
        style={{ gridTemplateColumns: "repeat(4, 1fr)", marginBottom: 36 }}
      >
        <div className="kpi">
          <div className="eyebrow">Opportunities</div>
          <div className="kpi-value">
            {stats ? stats.opp_count.toLocaleString() : "—"}
          </div>
          <div className="kpi-sub">
            {stats && stats.deadline_count > 0 ? (
              <Link
                href="/opportunities?status=active"
                style={{
                  color: "#dc2626",
                  textDecoration: "none",
                  fontSize: 12,
                }}
              >
                {stats.deadline_count} deadline
                {stats.deadline_count !== 1 ? "s" : ""} this week
              </Link>
            ) : (
              <Link
                href="/sources"
                style={{
                  color: "var(--accent)",
                  textDecoration: "none",
                  fontSize: 12,
                }}
              >
                {stats && stats.opp_count > 0
                  ? "Browse →"
                  : "Connect a source →"}
              </Link>
            )}
          </div>
        </div>
        <div className="kpi">
          <div className="eyebrow">Bid Pipeline</div>
          <div className="kpi-value">
            {stats ? stats.pipeline_count.toLocaleString() : "—"}
          </div>
          <div className="kpi-sub">
            <Link
              href="/pipeline"
              style={{
                color: "var(--accent)",
                textDecoration: "none",
                fontSize: 12,
              }}
            >
              {stats && stats.pipeline_count > 0
                ? "active bids"
                : "View pipeline →"}
            </Link>
          </div>
        </div>
        <div className="kpi">
          <div className="eyebrow">Knowledge Base</div>
          <div className="kpi-value">
            {stats ? stats.doc_count.toLocaleString() : "—"}
          </div>
          <div className="kpi-sub">
            {stats
              ? `${stats.total_chunks.toLocaleString()} chunks indexed`
              : "documents uploaded"}
          </div>
        </div>
        <div className="kpi">
          <div className="eyebrow">New alerts</div>
          <div
            className="kpi-value"
            style={
              stats && stats.unseen_alerts > 0
                ? { color: "var(--accent)" }
                : undefined
            }
          >
            {stats ? stats.unseen_alerts.toLocaleString() : "—"}
          </div>
          <div className="kpi-sub">
            <Link
              href="/alerts"
              style={{
                color: "var(--accent)",
                textDecoration: "none",
                fontSize: 12,
              }}
            >
              {stats && stats.unseen_alerts > 0
                ? "View new matches →"
                : "Manage alerts →"}
            </Link>
          </div>
        </div>
      </div>

      {/* Upcoming deadlines */}
      {stats && stats.upcoming.length > 0 && (
        <>
          <div
            className="section-title"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>Upcoming deadlines</span>
            <Link
              href="/opportunities?status=active"
              style={{
                fontSize: 12,
                color: "var(--accent)",
                textDecoration: "none",
              }}
            >
              View all →
            </Link>
          </div>
          <div
            className="card"
            style={{ overflow: "hidden", marginBottom: 36 }}
          >
            {stats.upcoming.map((opp, i) => {
              const { days_left: daysLeft } = opp;
              const urgent = daysLeft !== null && daysLeft <= 3;
              const deadlineLabel =
                daysLeft === null
                  ? "No deadline"
                  : daysLeft === 0
                    ? "Today"
                    : daysLeft === 1
                      ? "Tomorrow"
                      : `${daysLeft} days`;
              return (
                <div
                  key={opp.id}
                  style={{
                    padding: "14px 20px",
                    borderBottom:
                      i < stats.upcoming.length - 1
                        ? "1px solid var(--border)"
                        : "none",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Link
                      href={`/opportunities/${opp.id}`}
                      style={{
                        fontSize: 13.5,
                        fontWeight: 500,
                        color: "var(--ink)",
                        textDecoration: "none",
                        display: "block",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {opp.title}
                    </Link>
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--muted)",
                        marginTop: 2,
                      }}
                    >
                      {opp.buyer_name ?? "Unknown buyer"}
                      {opp.value_amount
                        ? ` · £${opp.value_amount >= 1_000_000 ? (opp.value_amount / 1_000_000).toFixed(1) + "m" : Math.round(opp.value_amount / 1_000) + "k"}`
                        : ""}
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: urgent ? "#dc2626" : "var(--muted)",
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                    }}
                  >
                    {deadlineLabel}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Source sync status */}
      {stats && stats.sources.length > 0 && (
        <>
          <div
            className="section-title"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>Data sources</span>
            <Link
              href="/sources"
              style={{
                fontSize: 12,
                color: "var(--accent)",
                textDecoration: "none",
              }}
            >
              Manage →
            </Link>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: 10,
              marginBottom: 36,
            }}
          >
            {stats.sources.map((src) => {
              const hasError = Boolean(src.last_error);
              const synced = Boolean(src.last_successful_sync_at);
              const statusColor = !src.enabled
                ? "var(--muted)"
                : hasError
                  ? "#dc2626"
                  : synced
                    ? "var(--success)"
                    : "var(--muted)";
              const statusLabel = !src.enabled
                ? "Disabled"
                : hasError
                  ? "Error"
                  : synced
                    ? "OK"
                    : "Never synced";
              return (
                <div
                  key={src.name}
                  className="card"
                  style={{ padding: "12px 14px" }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--ink)",
                      marginBottom: 4,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {src.display_name}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      fontSize: 11,
                      color: statusColor,
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: statusColor,
                        flexShrink: 0,
                        display: "inline-block",
                      }}
                    />
                    {statusLabel}
                  </div>
                  {src.last_successful_sync_at && (
                    <div
                      style={{
                        fontSize: 10.5,
                        color: "var(--muted)",
                        marginTop: 2,
                      }}
                    >
                      {new Date(src.last_successful_sync_at).toLocaleDateString(
                        "en-GB",
                        { day: "numeric", month: "short" },
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Primary actions */}
      <div className="section-title">Get started</div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          marginBottom: 36,
        }}
      >
        <Link
          href="/opportunities"
          className="card card-pad"
          style={{
            display: "block",
            textDecoration: "none",
            transition: "all 140ms",
          }}
        >
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            Browse opportunities
          </div>
          <p
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 18,
              lineHeight: 1.3,
              letterSpacing: "-0.01em",
              color: "var(--ink)",
              marginBottom: 12,
            }}
          >
            Find UK public-sector tenders matched to your organisation
          </p>
          <p
            style={{
              fontSize: 13,
              color: "var(--muted)",
              marginBottom: 16,
              lineHeight: 1.5,
            }}
          >
            View opportunities from Find a Tender, Contracts Finder, and other
            sources. Score fit and add to your bid pipeline.
          </p>
          <span className="btn accent">View opportunities →</span>
        </Link>

        <Link
          href="/profile"
          className="card card-pad"
          style={{
            display: "block",
            textDecoration: "none",
            transition: "all 140ms",
          }}
        >
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            Organisation profile
          </div>
          <p
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 18,
              lineHeight: 1.3,
              letterSpacing: "-0.01em",
              color: "var(--ink)",
              marginBottom: 12,
            }}
          >
            Set up your profile to receive matched opportunities
          </p>
          <p
            style={{
              fontSize: 13,
              color: "var(--muted)",
              marginBottom: 16,
              lineHeight: 1.5,
            }}
          >
            Define your services, CPV codes, target regions, certifications, and
            contract value range to power bid/no-bid scoring.
          </p>
          <span className="btn primary">Set up profile →</span>
        </Link>
      </div>

      {/* Secondary actions */}
      <div className="section-title">RFP response tools</div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          marginBottom: 36,
        }}
      >
        <Link
          href="/ask"
          className="card card-pad"
          style={{
            display: "block",
            textDecoration: "none",
            transition: "all 140ms",
          }}
        >
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            Ask a question
          </div>
          <p
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 18,
              lineHeight: 1.3,
              letterSpacing: "-0.01em",
              color: "var(--ink)",
              marginBottom: 12,
            }}
          >
            Draft a response from your knowledge base
          </p>
          <p
            style={{
              fontSize: 13,
              color: "var(--muted)",
              marginBottom: 16,
              lineHeight: 1.5,
            }}
          >
            Type any tender question and get a cited, structured draft answer
            with confidence scoring and evidence flags.
          </p>
          <span className="btn">Ask now →</span>
        </Link>

        <div className="card card-pad">
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            Knowledge base
          </div>
          <p
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 18,
              lineHeight: 1.3,
              letterSpacing: "-0.01em",
              color: "var(--ink)",
              marginBottom: 12,
            }}
          >
            Upload capability statements, policies, and case studies
          </p>
          <p
            style={{
              fontSize: 13,
              color: "var(--muted)",
              marginBottom: 16,
              lineHeight: 1.5,
            }}
          >
            PDFs, DOCX, CSV, Markdown, and more. Documents are chunked and
            embedded for semantic retrieval.
          </p>
          <SampleDataLoader />
        </div>
      </div>

      {/* How it works */}
      <div className="section-title">How it works</div>
      <div className="card" style={{ overflow: "hidden" }}>
        {[
          {
            step: "1",
            title: "Connect procurement sources",
            desc: "Link to Find a Tender, Contracts Finder, and other UK feeds to surface relevant opportunities automatically.",
          },
          {
            step: "2",
            title: "Score bid fit",
            desc: "Your organisation profile is matched against each opportunity — CPV codes, region, value range, certifications, and evidence strength.",
          },
          {
            step: "3",
            title: "Draft the response",
            desc: "Upload tender documents, extract requirements, and generate cited draft answers from your approved knowledge base.",
          },
          {
            step: "4",
            title: "Review and export",
            desc: "Human reviewers approve or edit answers. Export the final response pack as Word or HTML.",
          },
        ].map((item, i, arr) => (
          <div
            key={item.step}
            style={{
              padding: "20px 24px",
              borderBottom:
                i < arr.length - 1 ? "1px solid var(--border)" : "none",
              display: "flex",
              gap: 16,
              alignItems: "flex-start",
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: "var(--accent-tint)",
                color: "var(--accent)",
                display: "grid",
                placeItems: "center",
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                fontWeight: 600,
                flexShrink: 0,
              }}
            >
              {item.step}
            </div>
            <div>
              <p
                style={{
                  fontWeight: 500,
                  color: "var(--ink)",
                  marginBottom: 4,
                }}
              >
                {item.title}
              </p>
              <p
                style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}
              >
                {item.desc}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div
        style={{ display: "flex", gap: 10, marginTop: 28, flexWrap: "wrap" }}
      >
        <Link href="/opportunities" className="btn primary">
          Browse opportunities
        </Link>
        <Link href="/rfp" className="btn">
          Run an RFP
        </Link>
        <Link href="/demo" className="btn ghost">
          View demo scenarios
        </Link>
      </div>
    </div>
  );
}
