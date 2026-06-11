import { getServiceSupabase } from "@/lib/supabase-service";
import type { InvestorOrganizerType } from "./types";

// Curated UK investor organisations for the global investor_organizers catalog.
// These power the organiser directory and let synced events link to a profile.
//
// Data rules:
//   * eventbrite_org_id is set ONLY for organisations whose Eventbrite presence
//     has been verified — never guessed.
//   * website is set only where we are confident; otherwise null (a wrong link
//     is worse than no link).
//   * Descriptions are plain English for non-technical founders.

interface SeedOrganizer {
  slug: string;
  name: string;
  organizer_type: InvestorOrganizerType;
  website: string | null;
  eventbrite_org_id: string | null;
  description: string;
  focus_sectors: string[];
  regions: string[];
}

const ORGANIZERS: SeedOrganizer[] = [
  // ── Verified Eventbrite organisers (ids checked against live Eventbrite) ──
  {
    slug: "entrepreneurs-collective",
    name: "Entrepreneurs Collective",
    organizer_type: "community",
    website: null,
    eventbrite_org_id: "26163087533",
    description:
      "Runs one of London's busiest pitch circuits — regular pitch nights and networking events where founders pitch live to angel investors and VCs.",
    focus_sectors: [],
    regions: ["London"],
  },
  {
    slug: "northinvest",
    name: "NorthInvest",
    organizer_type: "angel-network",
    website: "https://northinvest.co.uk",
    eventbrite_org_id: "15393768327",
    description:
      "Connects founders in the North of England with angel investors. Runs pitch events and investment-readiness sessions, based in Leeds.",
    focus_sectors: ["technology"],
    regions: ["Leeds", "North of England"],
  },
  {
    slug: "techhub",
    name: "TechHub",
    organizer_type: "community",
    website: null,
    eventbrite_org_id: "1398049317",
    description:
      "London startup community known for demo nights and founder events for tech startups.",
    focus_sectors: ["technology"],
    regions: ["London"],
  },
  {
    slug: "business-funding-show",
    name: "Business Funding Show",
    organizer_type: "other",
    website: null,
    eventbrite_org_id: "8528554890",
    description:
      "Runs funding-focused exhibitions and workshops that bring SMEs and startups together with banks, VCs and angel investors.",
    focus_sectors: [],
    regions: ["London"],
  },
  {
    slug: "capital-enterprise",
    name: "Capital Enterprise",
    organizer_type: "community",
    website: "https://capitalenterprise.org",
    eventbrite_org_id: "1664589126",
    description:
      "Membership network of London's startup support organisations. Runs investor showcases and programmes that connect founders with early-stage capital.",
    focus_sectors: ["technology"],
    regions: ["London"],
  },

  // ── National bodies and well-known networks ───────────────────────────────
  {
    slug: "ukbaa",
    name: "UK Business Angels Association (UKBAA)",
    organizer_type: "angel-network",
    website: "https://www.ukbaa.org.uk",
    eventbrite_org_id: null,
    description:
      "The national trade body for angel and early-stage investing. Runs investment summits, awards and investor–founder events across the UK.",
    focus_sectors: [],
    regions: ["UK-wide"],
  },
  {
    slug: "bvca",
    name: "BVCA — UK Private Capital",
    organizer_type: "vc",
    website: "https://www.bvca.co.uk",
    eventbrite_org_id: null,
    description:
      "The industry body for UK venture capital and private equity. Hosts conferences, training and networking events for investors and the companies they back.",
    focus_sectors: [],
    regions: ["UK-wide"],
  },
  {
    slug: "british-business-bank",
    name: "British Business Bank",
    organizer_type: "government",
    website: "https://www.british-business-bank.co.uk",
    eventbrite_org_id: null,
    description:
      "The UK government's economic development bank. Runs finance-readiness events and regional investment programmes for smaller businesses.",
    focus_sectors: [],
    regions: ["UK-wide"],
  },
  {
    slug: "startup-grind-london",
    name: "Startup Grind London",
    organizer_type: "community",
    website: "https://www.startupgrind.com/london",
    eventbrite_org_id: null,
    description:
      "London chapter of the global founder community. Hosts fireside chats with investors, networking nights and pitch events.",
    focus_sectors: ["technology"],
    regions: ["London"],
  },
  {
    slug: "sfc-capital",
    name: "SFC Capital",
    organizer_type: "angel-network",
    website: "https://sfccapital.com",
    eventbrite_org_id: null,
    description:
      "One of the UK's most active seed investors, combining an angel network with SEIS/EIS funds. Runs pitch and investor events for very early-stage companies.",
    focus_sectors: [],
    regions: ["UK-wide"],
  },
  {
    slug: "green-angel-ventures",
    name: "Green Angel Ventures",
    organizer_type: "angel-network",
    website: "https://greenangelventures.com",
    eventbrite_org_id: null,
    description:
      "Angel community investing exclusively in companies fighting climate change. Runs pitch events for climate and clean-energy startups.",
    focus_sectors: ["climate", "clean-energy"],
    regions: ["London", "UK-wide"],
  },
  {
    slug: "angel-academe",
    name: "Angel Academe",
    organizer_type: "angel-network",
    website: "https://www.angelacademe.com",
    eventbrite_org_id: null,
    description:
      "Angel network backing women-founded technology startups. Hosts regular pitch evenings in London.",
    focus_sectors: ["technology"],
    regions: ["London"],
  },

  // ── Regional angel networks ───────────────────────────────────────────────
  {
    slug: "cambridge-angels",
    name: "Cambridge Angels",
    organizer_type: "angel-network",
    website: "https://www.cambridgeangels.com",
    eventbrite_org_id: null,
    description:
      "Angel group of experienced entrepreneurs investing in high-growth startups, with regular pitch dinners in Cambridge.",
    focus_sectors: ["technology", "deep-tech"],
    regions: ["Cambridge", "East of England"],
  },
  {
    slug: "oion",
    name: "Oxford Innovation Finance (OION)",
    organizer_type: "angel-network",
    website: null,
    eventbrite_org_id: null,
    description:
      "One of the UK's longest-running angel investment networks, based in Oxford. Hosts investor showcase events for startups raising seed funding.",
    focus_sectors: ["technology", "life-sciences"],
    regions: ["Oxford", "South East"],
  },
  {
    slug: "archangels",
    name: "Archangels",
    organizer_type: "angel-network",
    website: "https://archangelsonline.com",
    eventbrite_org_id: null,
    description:
      "Edinburgh-based angel syndicate investing in Scottish technology and life-sciences companies.",
    focus_sectors: ["technology", "life-sciences"],
    regions: ["Scotland"],
  },
  {
    slug: "minerva-business-angels",
    name: "Minerva Business Angels",
    organizer_type: "angel-network",
    website: null,
    eventbrite_org_id: null,
    description:
      "Angel network run from the University of Warwick Science Park, holding regular pitch events across the Midlands.",
    focus_sectors: ["technology", "life-sciences"],
    regions: ["Midlands"],
  },
  {
    slug: "dorset-business-angels",
    name: "Dorset Business Angels",
    organizer_type: "angel-network",
    website: null,
    eventbrite_org_id: null,
    description:
      "Regional angel network holding quarterly pitch presentation events for early-stage companies in the South West.",
    focus_sectors: [],
    regions: ["South West"],
  },
  {
    slug: "angels-invest-wales",
    name: "Angels Invest Wales",
    organizer_type: "angel-network",
    website: null,
    eventbrite_org_id: null,
    description:
      "The Development Bank of Wales' angel network, connecting Welsh founders with business angels across Wales.",
    focus_sectors: [],
    regions: ["Wales"],
  },

  // ── VCs, accelerators and universities that run founder events ───────────
  {
    slug: "par-equity",
    name: "Par Equity",
    organizer_type: "vc",
    website: "https://www.parequity.com",
    eventbrite_org_id: null,
    description:
      "Venture capital firm investing in technology companies across the North of the UK and Scotland. Runs founder office hours and investor events.",
    focus_sectors: ["technology"],
    regions: ["Scotland", "North of England"],
  },
  {
    slug: "seedcamp",
    name: "Seedcamp",
    organizer_type: "vc",
    website: "https://seedcamp.com",
    eventbrite_org_id: null,
    description:
      "Europe's leading seed fund, based in London. Runs office hours, demo days and founder events.",
    focus_sectors: ["technology"],
    regions: ["London"],
  },
  {
    slug: "entrepreneur-first",
    name: "Entrepreneur First",
    organizer_type: "accelerator",
    website: "https://www.joinef.com",
    eventbrite_org_id: null,
    description:
      "Talent investor that helps individuals build startups from scratch. Holds regular demo days where new companies pitch to investors.",
    focus_sectors: ["technology", "deep-tech"],
    regions: ["London"],
  },
  {
    slug: "setsquared",
    name: "SETsquared Partnership",
    organizer_type: "university",
    website: "https://www.setsquared.co.uk",
    eventbrite_org_id: null,
    description:
      "Enterprise partnership of the universities of Bath, Bristol, Exeter, Southampton and Surrey. Runs investor showcases and accelerator programmes.",
    focus_sectors: ["technology", "deep-tech"],
    regions: ["South West", "South East"],
  },
];

/** Ensure curated investor organizers exist (idempotent, insert-only-missing). */
export async function seedInvestorOrganizers(): Promise<void> {
  const supabase = getServiceSupabase();

  // Insert only rows that don't exist yet (by slug). An upsert here would
  // clobber any operator edits to live organizer rows on every run.
  const { data: existing } = await supabase
    .from("investor_organizers")
    .select("slug");
  const have = new Set((existing ?? []).map((r: { slug: string }) => r.slug));
  const missing = ORGANIZERS.filter((o) => !have.has(o.slug));
  if (missing.length > 0) {
    await supabase.from("investor_organizers").insert(missing);
  }
}
