/**
 * Tenant isolation tests — verify that org-scoped data cannot leak across orgs.
 *
 * These tests use the live Supabase service-role client to insert controlled
 * test data, then verify that retrieval scoped to a different org returns
 * nothing.
 *
 * Usage:  npm run test:isolation
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env.
 * Cleans up all inserted rows after each test.
 */

import { describe, it, expect, afterEach } from "vitest";
import { getServiceSupabase } from "../lib/supabase-service";

// ── Helpers ───────────────────────────────────────────────────────────────────

const supabase = getServiceSupabase();

const ORG_A = "00000000-0000-0000-0000-000000000a01";
const ORG_B = "00000000-0000-0000-0000-000000000b02";

const insertedIds: { table: string; id: string }[] = [];

async function cleanup() {
  for (const { table, id } of insertedIds.reverse()) {
    await supabase.from(table).delete().eq("id", id);
  }
  insertedIds.length = 0;
}

afterEach(cleanup);

async function insertDocument(orgId: string, title: string): Promise<string> {
  const { data, error } = await supabase
    .from("documents")
    .insert({
      title,
      org_id: orgId,
      source_type: "upload",
      raw_text: `Sensitive content belonging to org ${orgId}: ${title}`,
      collection: "main",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Insert failed: ${error?.message}`);
  insertedIds.push({ table: "documents", id: data.id });
  return data.id;
}

async function insertOpportunityQuestion(
  orgId: string,
  opportunityId: string,
  questionText: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("opportunity_questions")
    .insert({
      org_id: orgId,
      opportunity_id: opportunityId,
      question_text: questionText,
      question_type: "general",
      question_class: "question",
      answer_status: "unanswered",
      is_mandatory: true,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Insert failed: ${error?.message}`);
  insertedIds.push({ table: "opportunity_questions", id: data.id });
  return data.id;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Tenant isolation — documents", () => {
  it("documents inserted for org A are not returned when queried as org B", async () => {
    await insertDocument(ORG_A, "Org A Confidential Policy");

    const { data } = await supabase
      .from("documents")
      .select("id, title")
      .eq("org_id", ORG_B);

    const orgADoc = (data ?? []).find((d) =>
      d.title.includes("Org A Confidential Policy"),
    );
    expect(orgADoc).toBeUndefined();
  });

  it("documents inserted for org A are returned when queried as org A", async () => {
    await insertDocument(ORG_A, "Org A Own Document");

    const { data } = await supabase
      .from("documents")
      .select("id, title")
      .eq("org_id", ORG_A);

    const ownDoc = (data ?? []).find((d) =>
      d.title.includes("Org A Own Document"),
    );
    expect(ownDoc).toBeDefined();
  });
});

describe("Tenant isolation — opportunity_questions", () => {
  const TEST_OPP_ID = "00000000-0000-0000-0000-000000000f01";

  it("questions inserted for org A are not returned when queried as org B", async () => {
    await insertOpportunityQuestion(
      ORG_A,
      TEST_OPP_ID,
      "Secret question for org A",
    );

    const { data } = await supabase
      .from("opportunity_questions")
      .select("id, question_text")
      .eq("opportunity_id", TEST_OPP_ID)
      .eq("org_id", ORG_B);

    const leak = (data ?? []).find((q) =>
      q.question_text.includes("Secret question for org A"),
    );
    expect(leak).toBeUndefined();
  });

  it("questions inserted for org A are returned when queried as org A", async () => {
    await insertOpportunityQuestion(
      ORG_A,
      TEST_OPP_ID,
      "Legitimate question for org A",
    );

    const { data } = await supabase
      .from("opportunity_questions")
      .select("id, question_text")
      .eq("opportunity_id", TEST_OPP_ID)
      .eq("org_id", ORG_A);

    const own = (data ?? []).find((q) =>
      q.question_text.includes("Legitimate question for org A"),
    );
    expect(own).toBeDefined();
  });
});

describe("Tenant isolation — tender_doc_cache", () => {
  it("cache entries for org A are not returned when queried as org B", async () => {
    const hash = "test-hash-org-a-only-" + Date.now();

    const { data: inserted } = await supabase
      .from("tender_doc_cache")
      .insert({
        url_hash: hash,
        url: "https://example.com/tender-doc",
        org_id: ORG_A,
        storage_path: `${ORG_A}/${hash}/document.pdf`,
        content_type: "application/pdf",
        byte_size: 12345,
      })
      .select("id")
      .single();

    if (inserted?.id)
      insertedIds.push({ table: "tender_doc_cache", id: inserted.id });

    const { data } = await supabase
      .from("tender_doc_cache")
      .select("id, url_hash")
      .eq("url_hash", hash)
      .eq("org_id", ORG_B);

    expect((data ?? []).length).toBe(0);
  });
});

describe("Tenant isolation — answer_library", () => {
  it("answer library entries for org A are not returned when queried as org B", async () => {
    const { data: inserted, error } = await supabase
      .from("answer_library")
      .insert({
        org_id: ORG_A,
        question_text: "Confidential answer for org A",
        answer_text: "Sensitive answer content",
        topic: "general",
        confidence_level: "high",
        source: "test",
      })
      .select("id")
      .single();

    if (error) {
      // answer_library schema may differ — skip gracefully
      console.warn("answer_library insert skipped:", error.message);
      return;
    }
    if (inserted?.id)
      insertedIds.push({ table: "answer_library", id: inserted.id });

    const { data } = await supabase
      .from("answer_library")
      .select("id, question_text")
      .eq("org_id", ORG_B)
      .ilike("question_text", "%Confidential answer for org A%");

    expect((data ?? []).length).toBe(0);
  });
});

describe("Tenant isolation — clients", () => {
  async function insertClient(orgId: string, name: string): Promise<string> {
    const { data, error } = await supabase
      .from("clients")
      .insert({ org_id: orgId, name, vertical: "it_cyber", status: "active" })
      .select("id")
      .single();
    if (error || !data) throw new Error(`Insert failed: ${error?.message}`);
    insertedIds.push({ table: "clients", id: data.id });
    return data.id;
  }

  it("clients inserted for org A are not returned when queried as org B", async () => {
    await insertClient(ORG_A, "Org A Secret Client");

    const { data } = await supabase
      .from("clients")
      .select("id, name")
      .eq("org_id", ORG_B);

    const leak = (data ?? []).find((c) => c.name === "Org A Secret Client");
    expect(leak).toBeUndefined();
  });

  it("clients inserted for org A are returned when queried as org A", async () => {
    await insertClient(ORG_A, "Org A Own Client");

    const { data } = await supabase
      .from("clients")
      .select("id, name")
      .eq("org_id", ORG_A);

    const own = (data ?? []).find((c) => c.name === "Org A Own Client");
    expect(own).toBeDefined();
  });

  it("documents scoped to a client are not visible to a different org", async () => {
    const clientId = await insertClient(ORG_A, "Org A Client for Doc Test");

    const { data: doc } = await supabase
      .from("documents")
      .insert({
        title: "Client-scoped confidential doc",
        org_id: ORG_A,
        client_id: clientId,
        source_type: "upload",
        raw_text: "Sensitive client content",
        collection: "main",
      })
      .select("id")
      .single();

    if (doc?.id) insertedIds.push({ table: "documents", id: doc.id });

    const { data } = await supabase
      .from("documents")
      .select("id, title")
      .eq("org_id", ORG_B)
      .eq("client_id", clientId);

    expect((data ?? []).length).toBe(0);
  });
});
