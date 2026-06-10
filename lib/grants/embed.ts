import { getServiceSupabase } from "@/lib/supabase-service";
import { generateEmbedding } from "@/lib/embeddings";
import type { GrantRow } from "./types";
import type { OrganisationProfileRow } from "@/lib/procurement/types";

// Semantic matching: embed grants + the org profile (text-embedding-3-small, 1536) so
// /my-grants can add a bounded semantic-fit boost ON TOP OF the keyword score — it can
// lift relevant grants the keywords missed, but never lowers the keyword result.

const SEM_STATUSES = ["open", "forthcoming", "rolling"];

export function grantEmbeddingText(g: {
  title?: string | null;
  description?: string | null;
  eligibility_text?: string | null;
  themes?: string[] | null;
  sectors?: string[] | null;
  regions?: string[] | null;
  details?: { sections?: { text: string }[] } | null;
}): string {
  const sections = (g.details?.sections ?? []).map((s) => s.text).join(" ");
  return [
    g.title ?? "",
    g.description ?? "",
    g.eligibility_text ?? "",
    sections,
    (g.themes ?? []).join(" "),
    (g.sectors ?? []).join(" "),
    (g.regions ?? []).join(" "),
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 8000);
}

export function profileEmbeddingText(p: OrganisationProfileRow): string {
  return [
    p.name,
    p.organisation_type ?? "",
    ...(p.sectors ?? []),
    ...(p.services ?? []),
    ...(p.keywords ?? []),
    ...(p.grant_themes ?? []),
    ...(p.social_value ?? []),
    ...(p.beneficiaries ?? []),
  ]
    .filter(Boolean)
    .join(", ")
    .slice(0, 4000);
}

/** pgvector returns embeddings as a "[...]" string; normalise to number[]. */
export function parseEmbedding(raw: unknown): number[] | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw as number[];
  if (typeof raw === "string") {
    try {
      const v = JSON.parse(raw);
      return Array.isArray(v) ? (v as number[]) : null;
    } catch {
      return null;
    }
  }
  return null;
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Compute + store a grant's embedding. */
export async function embedGrant(grant: GrantRow): Promise<boolean> {
  const text = grantEmbeddingText(grant);
  if (text.trim().length < 20) return false;
  const vec = await generateEmbedding(text);
  await getServiceSupabase()
    .from("grants")
    .update({ embedding: JSON.stringify(vec) })
    .eq("id", grant.id);
  return true;
}

/** Embed up to `limit` applyable grants that have no embedding yet (for the cron). */
export async function embedPendingGrants(
  limit = 40,
): Promise<{ embedded: number; attempted: number }> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("grants")
    .select(
      "id, title, description, eligibility_text, themes, sectors, regions, details",
    )
    .is("embedding", null)
    .in("status", SEM_STATUSES)
    .limit(limit);
  if (error) {
    // Best-effort cron path — log and report nothing attempted rather than fail.
    console.error(
      "[grants/embed] failed to list pending grants:",
      error.message,
    );
    return { embedded: 0, attempted: 0 };
  }
  const grants = (data ?? []) as GrantRow[];
  let embedded = 0;
  for (const g of grants) {
    if (await embedGrant(g)) embedded++;
  }
  return { embedded, attempted: grants.length };
}
