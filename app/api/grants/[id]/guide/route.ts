import { NextRequest, NextResponse } from "next/server";
import { getRequestOrgId } from "@/lib/org";
import { getGrant } from "@/lib/grants/data";
import { ensureApplicationGuide } from "@/lib/grants/guide";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Params {
  params: Promise<{ id: string }>;
}

/** POST — build (or return) this grant's tailored "how to apply" guide. */
export async function POST(_req: NextRequest, { params }: Params) {
  const orgId = await getRequestOrgId();
  if (!orgId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const grant = await getGrant(id);
  if (!grant) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const guide = await ensureApplicationGuide(grant);
  if (!guide)
    return NextResponse.json(
      { error: "Could not generate a guide for this grant." },
      { status: 502 },
    );
  return NextResponse.json({ guide });
}
