export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { getRequestOrgId } from "@/lib/org";
import { getOpportunity } from "@/lib/procurement/data";
import { collectTenderDocuments } from "@/lib/procurement/documents";
import type { NormalizedDocument } from "@/lib/procurement/types";
import { getOrFetchTenderDoc } from "@/lib/tender-docs";

interface Params {
  params: Promise<{ id: string }>;
}

export interface PortalInfo {
  name: string;
  instructions: string[];
}

export interface EnrichedDocument extends NormalizedDocument {
  accessibility: "accessible" | "portal-required" | "unknown" | "error";
  portal?: PortalInfo;
  errorMessage?: string;
}

const PORTAL_PATTERNS: Array<{
  patterns: string[];
  name: string;
  instructions: string[];
}> = [
  {
    patterns: ["delta-esourcing.co.uk", "bravosolution"],
    name: "Delta eSourcing",
    instructions: [
      "Register for a free supplier account at delta-esourcing.co.uk",
      "Log in and navigate to 'My Tenders'",
      "Search for this opportunity by reference number or title",
      "Download tender documents from the 'Tender Documents' tab",
    ],
  },
  {
    patterns: ["jaggaer.com"],
    name: "Jaggaer",
    instructions: [
      "Register for a free supplier account at the buyer's Jaggaer portal",
      "Log in and navigate to 'Sourcing Events'",
      "Search by the contract reference or OCID",
      "Express interest to unlock document downloads",
    ],
  },
  {
    patterns: ["in-tend.co.uk"],
    name: "InTend",
    instructions: [
      "Register at the buyer's InTend portal",
      "Log in and browse 'Current Opportunities'",
      "Enter the reference number from this notice",
      "Click 'Express Interest' to access tender documents",
    ],
  },
  {
    patterns: ["procontract.due-north.com"],
    name: "ProContract",
    instructions: [
      "Register at procontract.due-north.com",
      "Log in and select 'Opportunities'",
      "Search by opportunity title or reference",
      "Express interest to download the tender pack",
    ],
  },
  {
    patterns: ["mytenders.co.uk", "proactis.com"],
    name: "Pro-Actis / myTenders",
    instructions: [
      "Register at mytenders.co.uk",
      "Log in and navigate to 'Access Projects'",
      "Search by the contract reference",
      "Register interest and download documents from the opportunity page",
    ],
  },
  {
    patterns: ["contracts.mod.uk", "defencegateway"],
    name: "MOD Defence Contracts Online",
    instructions: [
      "Register at contracts.mod.uk (identity verification required)",
      "Complete your supplier registration and any required vetting",
      "Log in and search the tender list by reference number",
      "Express interest to receive tender documents",
    ],
  },
  {
    patterns: ["sell2wales.gov.wales"],
    name: "Sell2Wales",
    instructions: [
      "Register at sell2wales.gov.wales",
      "Log in and search 'Opportunities'",
      "Find this opportunity and click 'Express Interest'",
      "Download tender documents from your 'My Opportunities' area",
    ],
  },
  {
    patterns: ["publiccontractsscotland.gov.uk"],
    name: "Public Contracts Scotland",
    instructions: [
      "Register at publiccontractsscotland.gov.uk",
      "Log in and search for this opportunity",
      "Express interest to access the tender documents",
    ],
  },
  {
    patterns: ["etenderwales.bravosolution.co.uk"],
    name: "eTender Wales",
    instructions: [
      "Register at etenderwales.bravosolution.co.uk",
      "Log in and search for this opportunity",
      "Express interest to download the ITT documents",
    ],
  },
];

function detectPortal(url: string): PortalInfo | null {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    for (const entry of PORTAL_PATTERNS) {
      if (entry.patterns.some((p) => hostname.includes(p))) {
        return { name: entry.name, instructions: entry.instructions };
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function checkAccessibility(url: string): Promise<{
  accessibility: "accessible" | "portal-required" | "unknown" | "error";
  portal?: PortalInfo;
  errorMessage?: string;
}> {
  const portal = detectPortal(url);
  if (portal) {
    return { accessibility: "portal-required", portal };
  }

  const BROWSER_HEADERS = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    Accept: "*/*",
    "Accept-Language": "en-GB,en;q=0.9",
  };

  try {
    const res = await fetch(url, {
      method: "HEAD",
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(5_000),
      redirect: "follow",
    });
    if (res.ok) {
      return { accessibility: "accessible" };
    }
    if (res.status === 401 || res.status === 403) {
      return { accessibility: "portal-required" };
    }
    return { accessibility: "error", errorMessage: `HTTP ${res.status}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Request failed";
    return {
      accessibility: "unknown",
      errorMessage: msg.toLowerCase().includes("abort") ? "Timeout" : msg,
    };
  }
}

export async function POST(_request: NextRequest, { params }: Params) {
  const orgId = await getRequestOrgId();
  if (!orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const opp = await getOpportunity(id);
  if (!opp) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const allDocs = collectTenderDocuments(opp);

  const CONCURRENCY = 8;
  const results: EnrichedDocument[] = [];

  for (let i = 0; i < allDocs.length; i += CONCURRENCY) {
    const batch = allDocs.slice(i, i + CONCURRENCY);
    const checked = await Promise.allSettled(
      batch.map((doc) =>
        checkAccessibility(doc.url!).then((check) => ({
          ...doc,
          ...check,
        })),
      ),
    );
    for (let j = 0; j < batch.length; j++) {
      const r = checked[j];
      results.push(
        r.status === "fulfilled"
          ? r.value
          : {
              ...batch[j],
              accessibility: "error",
              errorMessage: "Check failed",
            },
      );
    }
  }

  // Warm the central store for accessible docs: download once, extract text once,
  // and link to this opportunity so "Get all details" reads text with no re-fetch.
  // Non-fatal — accessibility was already determined above.
  await Promise.allSettled(
    results
      .filter((d) => d.accessibility === "accessible" && d.url)
      .map((d) =>
        getOrFetchTenderDoc(d.url!, id, d.title ?? null).catch(() => null),
      ),
  );

  return NextResponse.json({ documents: results });
}
