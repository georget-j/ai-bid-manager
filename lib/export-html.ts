import type { RFPResponse } from "./schema";
import type { BatchItem } from "./export-docx";

const CSS = `
  body{font-family:system-ui,sans-serif;max-width:860px;margin:40px auto;padding:0 24px;color:#111827;line-height:1.6}
  h1{font-size:2rem;font-weight:700;margin-bottom:4px}
  h2{font-size:1.25rem;font-weight:600;margin:2rem 0 .5rem;color:#1f2937}
  h3{font-size:1rem;font-weight:600;margin:1.5rem 0 .25rem;color:#374151}
  .subtitle{color:#6b7280;margin-bottom:2rem}
  .summary{background:#f0f7ff;border-left:4px solid #3b82f6;padding:12px 16px;border-radius:0 6px 6px 0;color:#1e3a5f;margin:.5rem 0 1rem}
  .confidence{font-size:.875rem;margin:.5rem 0 1rem}
  .confidence .level{font-weight:700}
  .confidence .reason{color:#6b7280}
  .high{color:#16a34a}.medium{color:#d97706}.low{color:#dc2626}
  .label{font-size:.75rem;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;margin:1rem 0 .25rem}
  .citation{border-left:3px solid #cbd5e1;padding:6px 12px;margin:.25rem 0;font-size:.875rem}
  .citation strong{color:#374151}
  .citation em{color:#6b7280}
  .missing{border-left:3px solid #fbbf24;padding:6px 12px;margin:.25rem 0;font-size:.875rem}
  .missing .owner{font-weight:700;color:#d97706;font-size:.75rem;margin-right:6px}
  .action-item{padding:2px 0;font-size:.875rem}
  .divider{border:none;border-top:1px solid #e5e7eb;margin:2rem 0}
  .question-block{margin-bottom:2.5rem}
  .q-num{color:#6b7280;font-size:.875rem;font-weight:600}
  .section-heading{font-size:1.5rem;font-weight:700;margin:2.5rem 0 1rem;padding-bottom:.5rem;border-bottom:2px solid #e5e7eb}
`;

function escHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function confClass(level: string) {
  return level === "high" ? "high" : level === "medium" ? "medium" : "low";
}

function renderResponse(
  query: string,
  response: RFPResponse,
  editedDraft?: string,
): string {
  const draft = editedDraft ?? response.draft_answer;
  const lvl = response.confidence.level;

  let html = `
    <h2>${escHtml(query)}</h2>
    <div class="summary">${escHtml(response.executive_summary)}</div>
    <div class="confidence">
      <span class="level ${confClass(lvl)}">${lvl.toUpperCase()}</span>
      <span class="reason"> — ${escHtml(response.confidence.reason)}</span>
    </div>
    <h3>Response</h3>
    ${draft
      .split("\n\n")
      .filter(Boolean)
      .map((p) => `<p>${escHtml(p)}</p>`)
      .join("")}
  `;

  if (response.citations.length > 0) {
    html += `<div class="label">Sources</div>`;
    for (const c of response.citations) {
      const excerpt =
        c.excerpt.length > 200 ? c.excerpt.slice(0, 197) + "…" : c.excerpt;
      html += `<div class="citation"><strong>${escHtml(c.source_title)}</strong> <em>"${escHtml(excerpt)}"</em></div>`;
    }
  }

  if (response.missing_information.length > 0) {
    html += `<div class="label">Information Required</div>`;
    for (const mi of response.missing_information) {
      html += `<div class="missing"><span class="owner">[${escHtml(mi.suggested_owner.toUpperCase())}]</span>${escHtml(mi.item)} — ${escHtml(mi.why_it_matters)}</div>`;
    }
  }

  if (response.suggested_next_actions.length > 0) {
    html += `<div class="label">Next Actions</div>`;
    for (const a of response.suggested_next_actions) {
      html += `<div class="action-item">• ${escHtml(a)}</div>`;
    }
  }

  return html;
}

export function generateHtml(
  query: string,
  response: RFPResponse,
  editedDraft?: string,
): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>RFP Response</title><style>${CSS}</style></head><body>
    <h1>RFP Response</h1>
    <p class="subtitle">Generated ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>
    ${renderResponse(query, response, editedDraft)}
  </body></html>`;
}

export function generateBatchHtml(
  rfpTitle: string,
  items: BatchItem[],
): string {
  const sectionMap = new Map<string, BatchItem[]>();
  for (const item of items) {
    const arr = sectionMap.get(item.section) ?? [];
    arr.push(item);
    sectionMap.set(item.section, arr);
  }

  let body = `<h1>${escHtml(rfpTitle)}</h1>
    <p class="subtitle">Generated ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>`;

  for (const [sectionName, sectionItems] of sectionMap) {
    body += `<div class="section-heading">${escHtml(sectionName)}</div>`;
    let qNum = 1;
    for (const item of sectionItems) {
      body += `<div class="question-block"><span class="q-num">Q${qNum}.</span>`;
      body += renderResponse(item.question, item.response, item.editedDraft);
      body += `</div>`;
      if (qNum < sectionItems.length) body += `<hr class="divider">`;
      qNum++;
    }
  }

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${escHtml(rfpTitle)}</title><style>${CSS}</style></head><body>${body}</body></html>`;
}
