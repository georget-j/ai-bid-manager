import type { GrantSourceConnector, GrantSourceName } from "../types";
import { threeSixtyGivingConnector } from "./threesixtygiving";

// Registry of grant connectors by source name. Open-call sources (UKRI funding
// finder / Innovate UK competitions, GOV.UK Find a Grant) are added here as they land.
const CONNECTORS: Partial<Record<GrantSourceName, GrantSourceConnector>> = {
  "360giving": threeSixtyGivingConnector,
};

export function getGrantConnector(name: string): GrantSourceConnector | null {
  return CONNECTORS[name as GrantSourceName] ?? null;
}

export function allGrantConnectors(): GrantSourceConnector[] {
  return Object.values(CONNECTORS).filter(Boolean) as GrantSourceConnector[];
}
