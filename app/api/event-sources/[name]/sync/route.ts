import { NextRequest, NextResponse } from "next/server";
import { requireOperator } from "@/lib/admin-auth";
import { getEventConnector } from "@/lib/events/connectors";
import { syncEventSource } from "@/lib/events/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface Params {
  params: Promise<{ name: string }>;
}

/** POST — manually sync one investor event source (operator only). */
export async function POST(_req: NextRequest, { params }: Params) {
  const gate = await requireOperator();
  if (gate) return gate;

  const { name } = await params;
  const connector = getEventConnector(name);
  if (!connector) {
    return NextResponse.json(
      { error: `No connector for event source "${name}"` },
      { status: 404 },
    );
  }

  // Event listings are always "what's coming up" — no date window to accept
  // (unlike the grant sync's fromDate/toDate); paging resumes via the cursor.
  const result = await syncEventSource(connector);
  return NextResponse.json(result);
}
