import { Resend } from "resend";
import { getServiceSupabase } from "@/lib/supabase-service";

// Upcoming grant-application deadlines + an email digest. An application = a grant-linked
// response draft still being worked (stage drafting/submitted) whose grant deadline is
// within the window.

export interface DeadlineItem {
  draftId: string;
  title: string;
  funder: string | null;
  deadlineAt: string;
  daysLeft: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pickGrant(row: any): any {
  return Array.isArray(row?.grant) ? row.grant[0] : row?.grant;
}

/** All orgs' upcoming grant-application deadlines, grouped by org. */
export async function collectDeadlineDigests(
  withinDays = 14,
): Promise<Map<string, DeadlineItem[]>> {
  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from("response_drafts")
    .select(
      "id, rfp_title, org_id, stage, grant:grants(title, funder_name, deadline_at)",
    )
    .not("grant_id", "is", null)
    .neq("status", "archived")
    .in("stage", ["drafting", "submitted"]);

  const now = Date.now();
  const horizon = now + withinDays * 86_400_000;
  const byOrg = new Map<string, DeadlineItem[]>();

  for (const row of data ?? []) {
    const g = pickGrant(row);
    if (!g?.deadline_at) continue;
    const t = new Date(g.deadline_at).getTime();
    if (Number.isNaN(t) || t < now || t > horizon) continue;
    const item: DeadlineItem = {
      draftId: row.id as string,
      title: (g.title as string) ?? (row.rfp_title as string),
      funder: (g.funder_name as string) ?? null,
      deadlineAt: g.deadline_at as string,
      daysLeft: Math.ceil((t - now) / 86_400_000),
    };
    const arr = byOrg.get(row.org_id as string) ?? [];
    arr.push(item);
    byOrg.set(row.org_id as string, arr);
  }
  return byOrg;
}

/** Owner/admin emails for an org (digest recipients). */
export async function orgNotifyEmails(orgId: string): Promise<string[]> {
  const { data } = await getServiceSupabase()
    .from("org_memberships")
    .select("email, role")
    .eq("org_id", orgId)
    .in("role", ["owner", "admin"]);
  return [
    ...new Set(
      (data ?? [])
        .map((m) => (m.email as string)?.trim())
        .filter((e): e is string => !!e),
    ),
  ];
}

/** Send one deadline-digest email. Best-effort (no-op without RESEND_API_KEY). */
export async function sendDeadlineDigest(
  to: string[],
  items: DeadlineItem[],
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || to.length === 0 || items.length === 0) return false;
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? "rfp-agent@noreply.com";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  const sorted = [...items].sort((a, b) => a.daysLeft - b.daysLeft);
  const rows = sorted
    .map(
      (i) =>
        `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee"><a href="${appUrl}/rfp/drafts/${i.draftId}">${i.title}</a>${
          i.funder
            ? `<br><span style="color:#888;font-size:12px">${i.funder}</span>`
            : ""
        }</td><td style="padding:6px 10px;border-bottom:1px solid #eee;white-space:nowrap;color:${
          i.daysLeft <= 3 ? "#dc2626" : "#b45309"
        }">${i.daysLeft === 0 ? "Due today" : `${i.daysLeft}d left`}</td></tr>`,
    )
    .join("");

  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:560px">
      <h2 style="font-size:16px">Grant deadlines coming up</h2>
      <p style="font-size:13px;color:#444">You have ${items.length} grant application${
        items.length === 1 ? "" : "s"
      } with a deadline in the next 14 days.</p>
      <table style="border-collapse:collapse;width:100%;font-size:13px">${rows}</table>
      <p style="font-size:12px;color:#888;margin-top:16px"><a href="${appUrl}/my-applications">Open My Applications →</a></p>
    </div>`;

  const resend = new Resend(apiKey);
  await resend.emails.send({
    from: fromEmail,
    to,
    subject: `${items.length} grant deadline${items.length === 1 ? "" : "s"} coming up`,
    html,
  });
  return true;
}
