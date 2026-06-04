import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { syncPage } from "@/lib/procurement/sync";
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

export interface SyncCountResponse {
  fetched: number;
  opportunitiesUpserted: number;
  errors: string[];
  hasMore: boolean;
  /** Cursor for the next page — pass back on subsequent calls. Null = source exhausted. */
  nextCursor: string | null;
}

export async function POST(request: NextRequest, { params }: Params) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { name } = await params;
  const connector = CONNECTORS[name];

  if (!connector) {
    return NextResponse.json(
      {
        error: `No connector for "${name}". Available: ${Object.keys(CONNECTORS).join(", ")}`,
      },
      { status: 404 },
    );
  }

  let cursor: string | null = null;

  try {
    const body = (await request.json()) as { cursor?: string | null };
    cursor = body.cursor ?? null;
  } catch {
    // no body — start from beginning
  }

  const result = await syncPage(connector, { cursor });

  return NextResponse.json<SyncCountResponse>({
    fetched: result.fetched,
    opportunitiesUpserted: result.opportunitiesUpserted,
    errors: result.errors,
    hasMore: result.hasMore,
    nextCursor: result.nextCursor,
  });
}
