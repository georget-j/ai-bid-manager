import { NextRequest, NextResponse } from "next/server";
import * as z from "zod";
import { getServiceSupabase } from "@/lib/supabase";
import { generateEmbedding } from "@/lib/embeddings";
import { getRequestOrgId } from "@/lib/org";
import { getAuthUser } from "@/lib/supabase-server";

// ── GET — list library entries ────────────────────────────────────────────────

export async function GET() {
  try {
    const supabase = getServiceSupabase();
    const orgId = await getRequestOrgId();

    let query = supabase
      .from("answer_library")
      .select(
        "id, question, answer, topic, tags, created_by, use_count, last_used_at, created_at",
      )
      .order("use_count", { ascending: false });

    if (orgId) query = query.eq("org_id", orgId);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return NextResponse.json(data ?? []);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// ── POST — add or promote an entry to the library ─────────────────────────────

const CreateSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
  topic: z.string().optional(),
  tags: z.array(z.string()).optional(),
  source_query_id: z.string().uuid().optional(),
  source_review_id: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const { question, answer, topic, tags, source_query_id, source_review_id } =
      parsed.data;

    const [orgId, user, embedding] = await Promise.all([
      getRequestOrgId(),
      getAuthUser(),
      generateEmbedding(question),
    ]);

    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("answer_library")
      .insert({
        question,
        answer,
        topic: topic ?? null,
        tags: tags ?? [],
        embedding: JSON.stringify(embedding),
        source_query_id: source_query_id ?? null,
        source_review_id: source_review_id ?? null,
        created_by: user?.email ?? "unknown",
        org_id: orgId ?? null,
      })
      .select("id, question, topic, created_at")
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// ── DELETE — remove a library entry ──────────────────────────────────────────

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const supabase = getServiceSupabase();
    const { error } = await supabase
      .from("answer_library")
      .delete()
      .eq("id", id);

    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
