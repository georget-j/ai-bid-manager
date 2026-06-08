import type {
  ProcurementSourceConnector,
  NormalizedOpportunity,
} from "../types";
import { normalizeOcdsRelease } from "../normalizers/ocds";
import { createProactisFetchSince } from "./proactis";

// Public Contracts Scotland runs on the Proactis/Millstream platform. The OCDS
// feed lives on the API host (NOT www, which 404s the OCDS path):
//   {host}/v1/Notices?dateFrom=MM-YYYY&outputType=0&noticeType=N
const BASE_URL =
  process.env.PUBLIC_CONTRACTS_SCOTLAND_BASE_URL ??
  "https://api.publiccontractsscotland.gov.uk";

// Proactis noticeType ids for PCS: 101 site/contract notice, 102 prior
// information, 103 contract award, 104 quick-quote award. Each must be queried
// separately (there is no "all types" query).
const NOTICE_TYPES = [101, 102, 103, 104];

const fetchSince = createProactisFetchSince({
  sourceName: "public-contracts-scotland",
  apiBaseUrl: BASE_URL,
  noticeTypes: NOTICE_TYPES,
});

export const publicContractsScotlandConnector: ProcurementSourceConnector = {
  sourceName: "public-contracts-scotland",
  displayName: "Public Contracts Scotland",
  baseUrl: BASE_URL,

  fetchSince,

  async normalize(raw: unknown): Promise<NormalizedOpportunity[]> {
    try {
      return [normalizeOcdsRelease(raw, "public-contracts-scotland")];
    } catch {
      return [];
    }
  },
};
