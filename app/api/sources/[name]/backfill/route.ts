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

export interface BackfillChunkResponse {
  done: boolean;
  chunkFrom: string;
  chunkTo: string;
  /** ISO date string for the start of the next chunk, or null when done */
  nextFrom: string | null;
  /** Overall end date (echoed back for client convenience) */
  overallTo: string;
  result: {
    fetched: number;
    pages: number;
    rawStored: number;
    duplicatesSkipped: number;
    opportunitiesUpserted: number;
    errors: string[];
  };
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

  let chunkFrom: Date;
  let overallTo: Date;
  let chunkDays = 7;

  try {
    const body = (await request.json()) as {
      fromDate?: string;
      toDate?: string;
      chunkDays?: number;
    };

    chunkFrom = body.fromDate
      ? new Date(body.fromDate)
      : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

    overallTo = body.toDate ? new Date(body.toDate) : new Date();

    if (body.chunkDays) chunkDays = Math.max(1, Math.min(14, body.chunkDays));
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  if (chunkFrom >= overallTo) {
    return NextResponse.json<BackfillChunkResponse>({
      done: true,
      chunkFrom: chunkFrom.toISOString().split("T")[0],
      chunkTo: overallTo.toISOString().split("T")[0],
      nextFrom: null,
      overallTo: overallTo.toISOString().split("T")[0],
      result: {
        fetched: 0,
        pages: 0,
        rawStored: 0,
        duplicatesSkipped: 0,
        opportunitiesUpserted: 0,
        errors: [],
      },
    });
  }

  // Clamp chunk end to overallTo
  const chunkTo = new Date(
    Math.min(
      chunkFrom.getTime() + chunkDays * 24 * 60 * 60 * 1000,
      overallTo.getTime(),
    ),
  );

  const result = await syncSource(connector, {
    fromDate: chunkFrom,
    toDate: chunkTo,
    backfill: true,
  });

  const done = chunkTo >= overallTo;
  // Advance by exactly one chunkDays step (not chunkTo, which may be clamped)
  const nextFromDate = done
    ? null
    : new Date(chunkFrom.getTime() + chunkDays * 24 * 60 * 60 * 1000);

  return NextResponse.json<BackfillChunkResponse>({
    done,
    chunkFrom: chunkFrom.toISOString().split("T")[0],
    chunkTo: chunkTo.toISOString().split("T")[0],
    nextFrom: nextFromDate ? nextFromDate.toISOString().split("T")[0] : null,
    overallTo: overallTo.toISOString().split("T")[0],
    result: {
      fetched: result.fetched,
      pages: result.pages,
      rawStored: result.rawStored,
      duplicatesSkipped: result.duplicatesSkipped,
      opportunitiesUpserted: result.opportunitiesUpserted,
      errors: result.errors,
    },
  });
}
