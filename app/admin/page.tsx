import { RoutingConfigTable } from "@/components/RoutingConfigTable";
import { IntegrationPanel } from "@/components/IntegrationPanel";
import { ClientsAdmin } from "@/components/ClientsAdmin";
import { getAuthUser } from "@/lib/supabase-server";

export default async function AdminPage() {
  const user = await getAuthUser();
  const userEmail = user?.email ?? null;

  return (
    <div style={{ maxWidth: 900 }}>
      <div className="page-head">
        <div className="title-block">
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Admin
          </div>
          <h1>
            Routing &amp; <em>integrations</em>
          </h1>
          <p className="subtitle">
            Configure routing rules and notification channels for the human
            review workflow.
          </p>
        </div>
      </div>

      <section style={{ marginBottom: 48 }}>
        <div className="section-title">Client accounts</div>
        <ClientsAdmin />
      </section>

      <section style={{ marginBottom: 48 }}>
        <div className="section-title">Routing Rules</div>
        <p
          style={{
            fontSize: 13,
            color: "var(--muted)",
            marginBottom: 20,
            lineHeight: 1.6,
          }}
        >
          Assign an owner email to each topic. Low-confidence or high-risk
          answers are routed to the topic owner for review.
        </p>
        <RoutingConfigTable defaultEmail={userEmail} />
      </section>

      <section>
        <div className="section-title">Integrations</div>
        <p
          style={{
            fontSize: 13,
            color: "var(--muted)",
            marginBottom: 20,
            lineHeight: 1.6,
          }}
        >
          Configure email and Slack channels for review notifications.
        </p>
        <IntegrationPanel />
      </section>
    </div>
  );
}
