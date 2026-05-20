import { Resend } from "resend";
import type { ReviewRequestRow, RoutingConfig } from "./routing";
import { generateReviewMagicLink } from "./review-auth";
import { escapeHtml } from "./html";

const CONFIDENCE_LABEL: Record<string, string> = {
  high: "🟢 High",
  medium: "🟡 Medium",
  low: "🔴 Low",
};

const TOPIC_LABEL: Record<string, string> = {
  security_compliance: "Security & Compliance",
  legal: "Legal",
  pricing: "Pricing",
  technical: "Technical",
  commercial: "Commercial",
  implementation: "Implementation",
  support: "Support",
  general: "General",
};

function confidenceLabel(score: number | null): string {
  if (!score) return "Unknown";
  if (score >= 0.75) return `🟢 High (${Math.round(score * 100)}%)`;
  if (score >= 0.6) return `🟡 Medium (${Math.round(score * 100)}%)`;
  return `🔴 Low (${Math.round(score * 100)}%)`;
}

// ── Email ─────────────────────────────────────────────────────────────────────

function buildEmailHtml(params: {
  questionText: string;
  executiveSummary: string;
  confidenceScore: number | null;
  topic: string;
  riskLevel: string;
  rfpTitle: string;
  reviewLink: string;
}): string {
  const {
    questionText,
    executiveSummary,
    confidenceScore,
    topic,
    riskLevel,
    rfpTitle,
    reviewLink,
  } = params;
  const eTitle = escapeHtml(rfpTitle);
  const eQuestion = escapeHtml(questionText);
  const eSummary = escapeHtml(executiveSummary);
  const eTopic = escapeHtml(TOPIC_LABEL[topic] ?? topic);
  const eRisk = escapeHtml(
    riskLevel.charAt(0).toUpperCase() + riskLevel.slice(1),
  );
  return `<!DOCTYPE html>
<html>
<body style="font-family:system-ui,sans-serif;max-width:600px;margin:40px auto;color:#111827;">
  <div style="border-left:4px solid #3B82F6;padding:16px 20px;background:#F0F7FF;margin-bottom:24px;">
    <p style="margin:0;font-size:13px;color:#1E3A5F;font-weight:600;">RFP Review Needed</p>
    <p style="margin:4px 0 0;font-size:12px;color:#374151;">${eTitle}</p>
  </div>

  <p style="font-size:13px;color:#374151;margin-bottom:4px;font-weight:600;">Question</p>
  <p style="font-size:13px;color:#111827;margin-bottom:20px;">${eQuestion}</p>

  <p style="font-size:13px;color:#374151;margin-bottom:4px;font-weight:600;">AI Draft Summary</p>
  <p style="font-size:13px;color:#111827;margin-bottom:20px;">${eSummary}</p>

  <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
    <tr>
      <td style="font-size:12px;color:#6B7280;padding:4px 0;width:50%;">Confidence</td>
      <td style="font-size:12px;color:#111827;padding:4px 0;">${confidenceLabel(confidenceScore)}</td>
    </tr>
    <tr>
      <td style="font-size:12px;color:#6B7280;padding:4px 0;">Topic</td>
      <td style="font-size:12px;color:#111827;padding:4px 0;">${eTopic}</td>
    </tr>
    <tr>
      <td style="font-size:12px;color:#6B7280;padding:4px 0;">Risk level</td>
      <td style="font-size:12px;color:#111827;padding:4px 0;">${eRisk}</td>
    </tr>
  </table>

  <a href="${reviewLink}" style="display:inline-block;background:#111827;color:#fff;font-size:13px;font-weight:600;padding:10px 20px;border-radius:8px;text-decoration:none;">
    Review &amp; Approve →
  </a>

  <p style="font-size:11px;color:#9CA3AF;margin-top:24px;">
    This link signs you in automatically and expires after 1 hour.
    If you did not expect this email, you can safely ignore it.
  </p>
</body>
</html>`;
}

async function sendEmailNotification(params: {
  reviewRequest: ReviewRequestRow;
  reviewerEmail: string;
  questionText: string;
  executiveSummary: string;
  rfpTitle: string;
  magicLink: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? "rfp-agent@noreply.com";
  if (!apiKey) {
    console.warn("[notifications] RESEND_API_KEY not set — skipping email");
    return;
  }

  const resend = new Resend(apiKey);
  const topicLabel =
    TOPIC_LABEL[params.reviewRequest.topic] ?? params.reviewRequest.topic;

  await resend.emails.send({
    from: fromEmail,
    to: params.reviewerEmail,
    subject: `Review needed: ${topicLabel} — ${params.rfpTitle}`,
    html: buildEmailHtml({
      questionText: params.questionText,
      executiveSummary: params.executiveSummary,
      confidenceScore: params.reviewRequest.confidence_score,
      topic: params.reviewRequest.topic,
      riskLevel: params.reviewRequest.risk_level,
      rfpTitle: params.rfpTitle,
      reviewLink: params.magicLink,
    }),
  });
}

// ── Slack ─────────────────────────────────────────────────────────────────────

async function sendSlackNotification(params: {
  reviewRequest: ReviewRequestRow;
  webhookUrl: string;
  questionText: string;
  rfpTitle: string;
  reviewLink: string;
}): Promise<void> {
  const { reviewRequest, webhookUrl, questionText, rfpTitle, reviewLink } =
    params;
  const conf = confidenceLabel(reviewRequest.confidence_score);
  const topic = TOPIC_LABEL[reviewRequest.topic] ?? reviewRequest.topic;

  const payload = {
    text: `RFP review needed: ${topic} — ${rfpTitle}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*RFP review needed: ${topic}*\n_${rfpTitle}_`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Question*\n${questionText.slice(0, 300)}${questionText.length > 300 ? "…" : ""}`,
        },
      },
      {
        type: "context",
        elements: [
          { type: "mrkdwn", text: `Confidence: ${conf}` },
          { type: "mrkdwn", text: `Risk: ${reviewRequest.risk_level}` },
        ],
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "Review & Approve →" },
            url: reviewLink,
            style: "primary",
          },
        ],
      },
    ],
  };

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    console.error("[notifications] Slack webhook failed:", res.status);
  }
}

export async function sendSlackTestNotification(
  webhookUrl: string,
): Promise<void> {
  const payload = {
    text: "RFP Agent — test notification",
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*RFP Agent test notification* ✅\nYour Slack integration is working correctly.",
        },
      },
    ],
  };
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Slack returned ${res.status}`);
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

export async function dispatchReviewNotification(params: {
  reviewRequest: ReviewRequestRow;
  routingConfig: RoutingConfig;
  questionText: string;
  executiveSummary: string;
  rfpTitle: string;
}): Promise<void> {
  if (process.env.DEMO_MODE === "true") {
    console.log(
      "[notifications] DEMO_MODE=true — skipping review notification",
    );
    return;
  }

  const {
    reviewRequest,
    routingConfig,
    questionText,
    executiveSummary,
    rfpTitle,
  } = params;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  const magicLink = await generateReviewMagicLink(
    reviewRequest.assigned_to,
    reviewRequest.id,
  );
  const reviewLink = magicLink ?? `${appUrl}/review/${reviewRequest.id}`;

  const channel = routingConfig.preferred_channel;

  const emailPromise =
    (channel === "email" || channel === "both") && reviewRequest.assigned_to
      ? sendEmailNotification({
          reviewRequest,
          reviewerEmail: reviewRequest.assigned_to,
          questionText,
          executiveSummary,
          rfpTitle,
          magicLink: reviewLink,
        }).catch((err) => console.error("[notifications] email error:", err))
      : Promise.resolve();

  const slackWebhook =
    routingConfig.slack_webhook_url ?? process.env.SLACK_WEBHOOK_URL_DEFAULT;
  const slackPromise =
    (channel === "slack" || channel === "both") && slackWebhook
      ? sendSlackNotification({
          reviewRequest,
          webhookUrl: slackWebhook,
          questionText,
          rfpTitle,
          reviewLink,
        }).catch((err) => console.error("[notifications] slack error:", err))
      : Promise.resolve();

  await Promise.all([emailPromise, slackPromise]);
}
