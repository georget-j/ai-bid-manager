import type { GrantSourceConnector, GrantSourceName } from "../types";
import { threeSixtyGivingConnector } from "./threesixtygiving";
import { govukFindAGrantConnector } from "./govuk-find-a-grant";
import { innovateUkConnector } from "./innovate-uk";
import { ukriFundingFinderConnector } from "./ukri-funding-finder";
import { sediaHorizonConnector } from "./sedia";

// Registry of grant connectors by source name. 360Giving = awarded grants (browse +
// funder intel); GOV.UK Find a Grant + Innovate UK + UKRI Funding Finder + SEDIA
// (Horizon Europe) = OPEN, applyable calls.
const CONNECTORS: Partial<Record<GrantSourceName, GrantSourceConnector>> = {
  "360giving": threeSixtyGivingConnector,
  "govuk-find-a-grant": govukFindAGrantConnector,
  "innovate-uk": innovateUkConnector,
  "ukri-funding-finder": ukriFundingFinderConnector,
  "sedia-horizon": sediaHorizonConnector,
};

export function getGrantConnector(name: string): GrantSourceConnector | null {
  return CONNECTORS[name as GrantSourceName] ?? null;
}

export function allGrantConnectors(): GrantSourceConnector[] {
  return Object.values(CONNECTORS).filter(Boolean) as GrantSourceConnector[];
}
