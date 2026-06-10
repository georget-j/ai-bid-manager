import { NextRequest, NextResponse } from "next/server";
import {
  collectDeadlineDigests,
  orgNotifyEmails,
  sendDeadlineDigest,
} from "@/lib/grants/deadlines";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Scheduled digest of upcoming grant-application deadlines — Bearer CRON_SECRET. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET environment variable is not configured" },
      { status: 500 },
    );
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const byOrg = await collectDeadlineDigests(14);
  let orgsNotified = 0;
  let emailsSent = 0;

  for (const [orgId, items] of byOrg) {
    try {
      const to = await orgNotifyEmails(orgId);
      const sent = await sendDeadlineDigest(to, items);
      if (sent) {
        orgsNotified++;
        emailsSent += to.length;
      }
    } catch (err) {
      console.error("[grant-deadline-digest]", orgId, err);
    }
  }

  return NextResponse.json({
    orgsWithDeadlines: byOrg.size,
    orgsNotified,
    emailsSent,
  });
}
