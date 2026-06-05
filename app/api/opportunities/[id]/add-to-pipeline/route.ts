import { NextRequest, NextResponse } from "next/server";
import { getRequestOrgId } from "@/lib/org";
import { addToPipeline } from "@/lib/procurement/data";

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;

  const orgId = await getRequestOrgId();
  if (!orgId) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  let clientId: string | null = null;
  try {
    const body = (await request.json()) as { client_id?: string | null };
    clientId = body.client_id ?? null;
  } catch {
    // no body — fine, clientId stays null
  }

  try {
    const item = await addToPipeline(id, orgId, clientId);
    return NextResponse.json({ item });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
