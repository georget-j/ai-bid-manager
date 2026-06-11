import type { EventSourceName, InvestorEventSourceConnector } from "../types";
import { eventbriteConnector } from "./eventbrite";
import { ukbaaConnector } from "./ukbaa";

// Registry of investor-event connectors by source name (mirror of
// lib/grants/connectors/index.ts). Eventbrite = organizer-scoped API polling
// (needs EVENTBRITE_TOKEN; seeded disabled); UKBAA = polite HTML parsing of
// ukbaa.org.uk/events. The "manual" source has no connector by design.
const CONNECTORS: Partial<
  Record<EventSourceName, InvestorEventSourceConnector>
> = {
  eventbrite: eventbriteConnector,
  ukbaa: ukbaaConnector,
};

export function getEventConnector(
  name: string,
): InvestorEventSourceConnector | null {
  return CONNECTORS[name as EventSourceName] ?? null;
}

export function allEventConnectors(): InvestorEventSourceConnector[] {
  return Object.values(CONNECTORS).filter(
    Boolean,
  ) as InvestorEventSourceConnector[];
}
