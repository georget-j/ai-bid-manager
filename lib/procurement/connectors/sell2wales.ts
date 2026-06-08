import type {
  ProcurementSourceConnector,
  NormalizedOpportunity,
} from "../types";
import { normalizeOcdsRelease } from "../normalizers/ocds";
import { createProactisFetchSince } from "./proactis";
import { fetchSell2WalesMonthBulk } from "./sell2wales-bulk";

// Sell2Wales runs on the same Proactis/Millstream platform as Public Contracts
// Scotland. Primary path is the OCDS API:
//   {host}/v1/Notices?dateFrom=MM-YYYY&outputType=0&noticeType=N
// The API host periodically has TLS problems (it omits the Sectigo intermediate,
// handled by the shared secure fetch, and has at times an expired leaf cert), so
// the connector falls back to the monthly bulk download when the API yields nothing.
const BASE_URL =
  process.env.SELL2WALES_BASE_URL ?? "https://api.sell2wales.gov.wales";

// Proactis noticeType ids for Sell2Wales (Welsh notice categories).
const NOTICE_TYPES = [51, 52, 53, 54, 55, 56];

const fetchSince = createProactisFetchSince({
  sourceName: "sell2wales",
  apiBaseUrl: BASE_URL,
  noticeTypes: NOTICE_TYPES,
  monthFallback: fetchSell2WalesMonthBulk,
});

export const sell2walesConnector: ProcurementSourceConnector = {
  sourceName: "sell2wales",
  displayName: "Sell2Wales",
  baseUrl: BASE_URL,

  fetchSince,

  async normalize(raw: unknown): Promise<NormalizedOpportunity[]> {
    try {
      return [normalizeOcdsRelease(raw, "sell2wales")];
    } catch {
      return [];
    }
  },
};
