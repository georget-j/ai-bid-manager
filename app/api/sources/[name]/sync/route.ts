import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { syncSource } from "@/lib/procurement/sync";
import { findTenderConnector } from "@/lib/procurement/connectors/find-tender";
import { contractsFinderConnector } from "@/lib/procurement/connectors/contracts-finder";
import { publicContractsScotlandConnector } from "@/lib/procurement/connectors/public-contracts-scotland";
import { sell2walesConnector } from "@/lib/procurement/connectors/sell2wales";
import type { ProcurementSourceConnector } from "@/lib/procurement/types";

const CONNECTORS: Record<string, ProcurementSourceConnector> = {
  "find-tender": findTenderConnector,
  "contracts-finder": contractsFinderConnector,
  "public-contracts-scotland": publicContractsScotlandConnector,
  sell2wales: sell2walesConnector,
};

interface Params {
  params: Promise<{ name: string }>;
}

export async function POST(request: NextRequest, { params }: Params) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { name } = await params;
  const connector = CONNECTORS[name];

  if (!connector) {
    return NextResponse.json(
      {
        error: `No connector implemented for source "${name}". Available: ${Object.keys(CONNECTORS).join(", ")}`,
      },
      { status: 404 },
    );
  }

  let fromDate: Date | undefined;
  let toDate: Date | undefined;
  try {
    const body = (await request.json().catch(() => ({}))) as {
      fromDate?: string;
      toDate?: string;
    };
    if (body.fromDate) fromDate = new Date(body.fromDate);
    if (body.toDate) toDate = new Date(body.toDate);
  } catch {
    // ignore — use defaults
  }

  try {
    const result = await syncSource(connector, { fromDate, toDate });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    console.error(`[sources/${name}/sync]`, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
