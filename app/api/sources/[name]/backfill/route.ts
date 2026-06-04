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

export interface BackfillChunkResponse {
  /** True when all chunks and all pages within the final chunk are done. */
  done: boolean;
  chunkFrom: string;
  chunkTo: string;
  /**
   * Cursor for the next page within the current chunk.
   * Null means the current chunk is exhausted — advance chunkFrom.
   */
  nextCursor: string | null;
  /**
   * ISO date string for the start of the next chunk, or null when done.
   * Only set when nextCursor is null (i.e., current chunk is finished).
   */
  nextFrom: string | null;
  overallTo: string;
  result: {
    fetched: number;
    pages: number;
    rawStored: number;
    duplicatesSkipped: number;
    opportunitiesUpserted: number;
    errors: string[];
    hasMore: boolean;
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
  let pageCursor: string | null = null;

  try {
    const body = (await request.json()) as {
      fromDate?: string;
      toDate?: string;
      chunkDays?: number;
      cursor?: string | null;
    };

    chunkFrom = body.fromDate
      ? new Date(body.fromDate)
      : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

    overallTo = body.toDate ? new Date(body.toDate) : new Date();

    if (body.chunkDays) chunkDays = Math.max(1, Math.min(14, body.chunkDays));

    pageCursor = body.cursor ?? null;
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
      nextCursor: null,
      nextFrom: null,
      overallTo: overallTo.toISOString().split("T")[0],
      result: {
        fetched: 0,
        pages: 0,
        rawStored: 0,
        duplicatesSkipped: 0,
        opportunitiesUpserted: 0,
        errors: [],
        hasMore: false,
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

  // One page per call with bulk DB writes — keeps invocations well under timeout.
  // The client re-calls with the returned cursor to get the next page.
  const result = await syncPage(connector, {
    from: chunkFrom,
    to: chunkTo,
    cursor: pageCursor,
  });

  const chunkExhausted = !result.hasMore;

  // When this chunk is fully paged through, compute the next chunk start.
  const nextChunkFrom = chunkExhausted
    ? new Date(chunkFrom.getTime() + chunkDays * 24 * 60 * 60 * 1000)
    : null;

  const done =
    chunkExhausted && nextChunkFrom !== null && nextChunkFrom >= overallTo;

  return NextResponse.json<BackfillChunkResponse>({
    done,
    chunkFrom: chunkFrom.toISOString().split("T")[0],
    chunkTo: chunkTo.toISOString().split("T")[0],
    nextCursor: result.hasMore ? result.nextCursor : null,
    nextFrom:
      !done && chunkExhausted && nextChunkFrom
        ? nextChunkFrom.toISOString().split("T")[0]
        : null,
    overallTo: overallTo.toISOString().split("T")[0],
    result: {
      fetched: result.fetched,
      pages: 1,
      rawStored: result.fetched,
      duplicatesSkipped: 0,
      opportunitiesUpserted: result.opportunitiesUpserted,
      errors: result.errors,
      hasMore: result.hasMore,
    },
  });
}
