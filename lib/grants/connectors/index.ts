import type { GrantSourceConnector, GrantSourceName } from "../types";
import { threeSixtyGivingConnector } from "./threesixtygiving";
import { govukFindAGrantConnector } from "./govuk-find-a-grant";
import { innovateUkConnector } from "./innovate-uk";
import { ukriFundingFinderConnector } from "./ukri-funding-finder";
import { sediaHorizonConnector } from "./sedia";
import { tnlCommunityFundConnector } from "./tnl-community-fund";
import { fundingScotlandConnector } from "./funding-scotland";
import { niBusinessInfoConnector } from "./ni-business-info";
import { foundationScotlandConnector } from "./foundation-scotland";
import { heritageFundConnector } from "./heritage-fund";
import { londonCfConnector } from "./london-cf";

// Registry of grant connectors by source name. 360Giving = awarded grants (browse +
// funder intel); GOV.UK Find a Grant + Innovate UK + UKRI Funding Finder + SEDIA
// (Horizon Europe) + TNL Community Fund + Funding Scotland + NI Business Info +
// Foundation Scotland + Heritage Fund + London Community Foundation = OPEN,
// applyable calls.
const CONNECTORS: Partial<Record<GrantSourceName, GrantSourceConnector>> = {
  "360giving": threeSixtyGivingConnector,
  "govuk-find-a-grant": govukFindAGrantConnector,
  "innovate-uk": innovateUkConnector,
  "ukri-funding-finder": ukriFundingFinderConnector,
  "sedia-horizon": sediaHorizonConnector,
  "tnl-community-fund": tnlCommunityFundConnector,
  "funding-scotland": fundingScotlandConnector,
  "ni-business-info": niBusinessInfoConnector,
  "foundation-scotland": foundationScotlandConnector,
  "heritage-fund": heritageFundConnector,
  "london-cf": londonCfConnector,
};

export function getGrantConnector(name: string): GrantSourceConnector | null {
  return CONNECTORS[name as GrantSourceName] ?? null;
}

export function allGrantConnectors(): GrantSourceConnector[] {
  return Object.values(CONNECTORS).filter(Boolean) as GrantSourceConnector[];
}
