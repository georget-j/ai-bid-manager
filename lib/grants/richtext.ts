import type { GrantLink } from "./types";

// Minimal walker for Contentful Rich Text documents (used by GOV.UK Find a Grant detail
// tabs). A node is { nodeType, value?, content?, data?: { uri? } }. We extract readable
// plain text (paragraphs/lists preserved) and the embedded hyperlinks separately.

interface RTNode {
  nodeType?: string;
  value?: string;
  content?: RTNode[];
  data?: { uri?: string };
}

const BLOCK = new Set([
  "paragraph",
  "heading-1",
  "heading-2",
  "heading-3",
  "heading-4",
  "heading-5",
  "heading-6",
  "blockquote",
]);

function walk(node: unknown): string {
  const n = node as RTNode;
  if (!n || typeof n !== "object") return "";
  if (n.nodeType === "text") return n.value ?? "";
  if (n.nodeType === "list-item") {
    const inner = (n.content ?? []).map(walk).join("").trim();
    return inner ? `• ${inner}\n` : "";
  }
  let out = Array.isArray(n.content) ? n.content.map(walk).join("") : "";
  if (n.nodeType && BLOCK.has(n.nodeType)) out += "\n\n";
  else if (n.nodeType === "unordered-list" || n.nodeType === "ordered-list")
    out += "\n";
  return out;
}

/** Convert a Contentful Rich Text document to readable plain text. */
export function richTextToText(doc: unknown): string {
  return walk(doc)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Collect the hyperlinks (uri + label) embedded in a Contentful Rich Text document. */
export function richTextLinks(node: unknown): GrantLink[] {
  const n = node as RTNode;
  const out: GrantLink[] = [];
  if (!n || typeof n !== "object") return out;
  if (n.nodeType === "hyperlink" && n.data?.uri) {
    const title = (n.content ?? []).map(walk).join("").trim() || n.data.uri;
    out.push({ title, url: n.data.uri });
  }
  if (Array.isArray(n.content))
    for (const c of n.content) out.push(...richTextLinks(c));
  return out;
}

/** Dedupe links by URL, keeping the first (best) title. */
export function dedupeLinks(links: GrantLink[]): GrantLink[] {
  const seen = new Set<string>();
  const out: GrantLink[] = [];
  for (const l of links) {
    if (!l.url || seen.has(l.url)) continue;
    seen.add(l.url);
    out.push(l);
  }
  return out;
}
