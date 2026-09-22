// Investor programmes & accelerators — the "first safe slice" of the investor /
// open-days vision. This is a CURATED, hand-maintained list of public programmes
// (names + public application URLs only — no personal data, no scraping). It leans
// UK / cyber / deep-tech to match the SME-supplier ICP.
//
// Why curated and not a live feed: Eventbrite removed its public event-search API in
// Feb 2020, and there is no free platform-wide event-search API. Live programme/event
// data at scale needs a paid provider (Dealroom / Crunchbase) or per-organiser
// integrations — tracked as a roadmap follow-on in the grants strategy doc.
//
// Curation rules (2026-06-12 expansion, 14 → 40+):
//  - Every applicationUrl was fetched and returned 200 (directly or via redirect)
//    on the day it was added, and the page showed the programme still operating.
//  - Known-dead programmes are deliberately ABSENT: LORCA (ended), Tech Nation
//    programmes (closed 2023), Wayra UK (folded into global Wayra — no verifiable
//    UK programme page), Ignite (site unreachable), Alacrity Foundation (domain
//    parked), Techscaler (techscaler.com parked, techscaler.scot unreachable),
//    and DiSH Manchester / Grow London Global / Start Up Loans / Santander X
//    (pages could not be verified — bot-blocked, unreachable, or content-empty).

export type ProgrammeType =
  | "accelerator"
  | "investor-programme"
  | "ecosystem-support"
  | "incubator"
  | "grant-competition";

/**
 * The grants-catalogue source name for curated programme rows. Programmes are
 * upserted into `grants` under this source (lib/programmes/seed.ts) so the whole
 * guided apply flow works for them unchanged — and grant surfaces exclude this
 * source by default so programmes never pollute grant lists/recommendations.
 */
export const CURATED_PROGRAMMES_SOURCE = "curated-programmes";

export interface Programme {
  id: string;
  name: string;
  organiser: string;
  type: ProgrammeType;
  focus: string[];
  location: string;
  /** When/how it opens, in plain words. */
  cadence: string;
  /** What you get (funding / equity / support), in plain words. */
  offer: string;
  applicationUrl: string;
  description: string;
  /** True for programmes especially relevant to the cyber/IT supplier wedge. */
  cyberRelevant?: boolean;
  /**
   * Slug of this organiser's row in investor_organizers (lib/events/seed.ts),
   * set only where the two curated lists describe the SAME organisation —
   * renders a "See their investor events" cross-link on the programme card.
   */
  organizerSlug?: string;
}

export const PROGRAMMES: Programme[] = [
  // ── Cyber security ─────────────────────────────────────────────────────────
  {
    id: "ncsc-for-startups",
    name: "NCSC For Startups",
    organiser: "NCSC × Plexal",
    type: "accelerator",
    focus: ["Cyber security", "National security"],
    location: "London / UK",
    cadence: "Rolling applications, themed challenges",
    offer: "Access to NCSC experts, no equity taken, product feedback",
    applicationUrl:
      "https://www.ncsc.gov.uk/section/ncsc-for-startups/overview",
    description:
      "The National Cyber Security Centre's startup programme, run with Plexal. Helps early-stage cyber companies adapt and pilot their products against real national-security challenges. Equity-free.",
    cyberRelevant: true,
  },
  {
    id: "cyber-runway",
    name: "Cyber Runway",
    organiser: "Plexal (DSIT-backed)",
    type: "accelerator",
    focus: ["Cyber security"],
    location: "UK (national)",
    cadence: "Annual cohorts (Launch / Grow / Scale tracks)",
    offer: "Grant-funded support, mentoring, masterclasses, investor access",
    applicationUrl: "https://www.plexal.com/our-work/cyber-runway/",
    description:
      "The UK government's flagship cyber accelerator, delivered by Plexal. Three tracks from idea-stage (Launch) to scaling (Scale). Government-funded — no equity.",
    cyberRelevant: true,
  },
  {
    id: "cylon",
    name: "CyLon",
    organiser: "CyLon Ventures",
    type: "accelerator",
    focus: ["Cyber security", "Security tech"],
    location: "London",
    cadence: "Periodic cohorts",
    offer: "Pre-seed investment, mentoring, investor introductions",
    applicationUrl: "https://www.cylonventures.com/",
    description:
      "One of Europe's longest-running cyber-security accelerators. Pre-seed cheque plus a structured programme and a strong security-sector mentor network.",
    cyberRelevant: true,
  },
  {
    id: "cyberasap",
    name: "CyberASAP",
    organiser: "Innovate UK Business Connect",
    type: "accelerator",
    focus: ["Cyber security", "Academic spinouts"],
    location: "UK (national)",
    cadence: "Annual call for academic teams",
    offer: "Grant funding, commercialisation training, demo day",
    applicationUrl: "https://iuk-business-connect.org.uk/programme/cyberasap/",
    description:
      "The Cyber Security Academic Startup Accelerator Programme, funded by government and delivered by Innovate UK Business Connect. Takes UK academic cyber research from idea to investable spinout across funded phases.",
    cyberRelevant: true,
  },
  {
    id: "ncsc-cyberfirst",
    name: "NCSC CyberFirst",
    organiser: "NCSC",
    type: "ecosystem-support",
    focus: ["Cyber security", "Talent & skills"],
    location: "UK (national)",
    cadence: "Bursaries and courses open annually",
    offer: "Student bursaries, courses, and an industry talent pipeline",
    applicationUrl: "https://www.ncsc.gov.uk/cyberfirst/overview",
    description:
      "The NCSC's cyber talent and skills programme, from school courses to undergraduate bursaries. Cyber SMEs can join as industry partners to reach vetted early-career cyber talent.",
    cyberRelevant: true,
  },
  {
    id: "cyber-innovation-hub-wales",
    name: "Cyber Innovation Hub (Wales)",
    organiser: "Cardiff University & partners",
    type: "ecosystem-support",
    focus: ["Cyber security"],
    location: "Cardiff / Wales",
    cadence: "Rolling — programmes and challenges year-round",
    offer: "Startup support, testbeds, cyber skills training",
    applicationUrl: "https://cyberinnovationhub.wales/",
    description:
      "Wales's cyber security innovation hub, led by Cardiff University with industry and government partners. Runs startup support, testbeds and skills programmes to grow the Welsh cyber cluster.",
    cyberRelevant: true,
  },
  {
    id: "dasa-open-call",
    name: "DASA Open Call for Innovation",
    organiser: "Defence and Security Accelerator (MOD)",
    type: "grant-competition",
    focus: ["Defence", "Security", "Dual-use tech"],
    location: "UK (national)",
    cadence: "Always open — submissions assessed in cycles",
    offer:
      "Contract funding for innovations, no equity, route to defence buyers",
    applicationUrl:
      "https://www.gov.uk/government/organisations/defence-and-security-accelerator",
    description:
      "The Ministry of Defence's accelerator funds innovative ideas with defence and security uses through an always-open competition. Winners get fully funded contracts and a route into government buyers.",
    cyberRelevant: true,
  },
  {
    id: "cynam",
    name: "CyNam",
    organiser: "CyNam (Cheltenham)",
    type: "ecosystem-support",
    focus: ["Cyber security"],
    location: "Cheltenham / South West",
    cadence: "Rolling — events and community year-round",
    offer: "Cyber cluster community, events, ecosystem connections",
    applicationUrl: "https://cynam.org/",
    description:
      "Cheltenham's cyber security and technology cluster, on the doorstep of GCHQ. Free community events and connections for cyber companies in the South West's growing security ecosystem.",
    cyberRelevant: true,
  },

  // ── Accelerators & investor programmes ─────────────────────────────────────
  {
    id: "techstars",
    name: "Techstars",
    organiser: "Techstars",
    type: "accelerator",
    focus: ["Tech (sector-agnostic)", "B2B SaaS"],
    location: "London & global",
    cadence: "Cohorts several times a year by programme",
    offer: "~$120k investment for equity, 13-week programme, demo day",
    applicationUrl: "https://www.techstars.com/accelerators",
    description:
      "Global accelerator network running themed programmes (including security and govtech). Cash investment for equity, intensive mentorship, and a demo day to investors.",
  },
  {
    id: "ycombinator",
    name: "Y Combinator",
    organiser: "Y Combinator",
    type: "accelerator",
    focus: ["Tech (sector-agnostic)"],
    location: "US (remote-friendly)",
    cadence: "Two batches a year (winter / summer)",
    offer: "$500k standard deal, 3-month programme, demo day",
    applicationUrl: "https://www.ycombinator.com/apply",
    description:
      "The best-known seed accelerator. Takes companies at almost any stage; standard deal is $500k. Highly competitive but transformational network and demo day.",
  },
  {
    id: "entrepreneur-first",
    name: "Entrepreneur First (EF)",
    organiser: "Entrepreneur First",
    type: "investor-programme",
    focus: ["Deep tech", "Pre-team founders"],
    location: "London & global",
    cadence: "Cohorts twice a year",
    offer: "Stipend during the programme + pre-seed investment",
    applicationUrl: "https://www.joinef.com/",
    description:
      "A 'talent investor' that backs individuals before they have a company or co-founder. Strong fit for technical founders leaving industry to start up.",
    organizerSlug: "entrepreneur-first",
  },
  {
    id: "seedcamp",
    name: "Seedcamp",
    organiser: "Seedcamp",
    type: "investor-programme",
    focus: ["Pre-seed / seed", "Tech"],
    location: "London / Europe",
    cadence: "Rolling — apply any time",
    offer: "Pre-seed/seed investment + lifelong platform support",
    applicationUrl: "https://seedcamp.com/",
    description:
      "Europe's leading seed fund. Rolling applications, fast process, and an unusually strong post-investment platform and expert network.",
    organizerSlug: "seedcamp",
  },
  {
    id: "antler",
    name: "Antler",
    organiser: "Antler",
    type: "investor-programme",
    focus: ["Day-zero", "Tech"],
    location: "London & global",
    cadence: "Cohorts throughout the year",
    offer: "Pre-seed investment, co-founder matching, programme support",
    applicationUrl: "https://www.antler.co/apply",
    description:
      "Backs founders from day zero, including co-founder matching. Good route for early technical founders who want capital plus a structured launch programme.",
  },
  {
    id: "founders-factory",
    name: "Founders Factory",
    organiser: "Founders Factory",
    type: "accelerator",
    focus: ["Tech", "Corporate-backed verticals"],
    location: "London",
    cadence: "Rolling, by vertical/corporate partner",
    offer: "Investment + hands-on build support from in-house teams",
    applicationUrl: "https://foundersfactory.com/",
    description:
      "Accelerator and venture studio with corporate partners across sectors. Hands-on operational support (growth, product, engineering) alongside investment.",
  },
  {
    id: "conception-x",
    name: "Conception X",
    organiser: "Conception X",
    type: "accelerator",
    focus: ["Deep tech", "PhD founders"],
    location: "UK (universities)",
    cadence: "Annual programme (academic year)",
    offer: "Venture programme for PhD students, investor access",
    applicationUrl: "https://www.conceptionx.org/",
    description:
      "Turns PhD research into deep-tech ventures. Strong fit for research-led cyber/AI founders building IP-heavy companies.",
  },
  {
    id: "carbon13",
    name: "Carbon13",
    organiser: "Carbon13",
    type: "investor-programme",
    focus: ["Climate tech", "Deep tech"],
    location: "Cambridge / London",
    cadence: "Cohorts (venture-builder)",
    offer: "Pre-seed investment + co-founder matching for climate ventures",
    applicationUrl: "https://carbonthirteen.com/",
    description:
      "A venture-builder for climate-impact companies. Investment plus team-building for founders targeting carbon-reduction markets, including govtech angles.",
  },
  {
    id: "bethnal-green-ventures",
    name: "Bethnal Green Ventures",
    organiser: "Bethnal Green Ventures",
    type: "accelerator",
    focus: ["Tech for good", "Impact"],
    location: "London",
    cadence: "Cohorts — apply per programme",
    offer: "Pre-seed investment + structured tech-for-good programme",
    applicationUrl: "https://bethnalgreenventures.com/",
    description:
      "Europe's longest-running tech-for-good accelerator. Pre-seed investment and a structured programme for founders using technology to tackle social or environmental problems.",
  },
  {
    id: "zinc",
    name: "Zinc",
    organiser: "Zinc",
    type: "investor-programme",
    focus: ["Mission-driven", "Venture builder"],
    location: "London",
    cadence: "Mission-based cohorts",
    offer: "Investment + venture-builder support around a social mission",
    applicationUrl: "https://www.zinc.vc/",
    description:
      "A venture builder that forms companies around big social missions such as health and economic opportunity. Founders join a cohort, build a company from scratch, and receive investment.",
  },
  {
    id: "deeptech-labs",
    name: "Deeptech Labs",
    organiser: "Deeptech Labs",
    type: "accelerator",
    focus: ["Deep tech"],
    location: "Cambridge",
    cadence: "Two cohorts a year",
    offer: "Investment + 13-week programme in the Cambridge ecosystem",
    applicationUrl: "https://dtl.vc/",
    description:
      "Cambridge's deep-tech accelerator and VC fund. Investment plus a 13-week programme drawing on the Cambridge technology ecosystem's founders, engineers and investors.",
  },
  {
    id: "seraphim-space",
    name: "Seraphim Space Accelerator",
    organiser: "Seraphim Space",
    type: "investor-programme",
    focus: ["Space tech", "Dual-use tech"],
    location: "London / UK",
    cadence: "Cohorts — apply per intake",
    offer: "Investment and accelerator support for space-tech startups",
    applicationUrl: "https://seraphim.vc/",
    description:
      "The UK-based space-tech investor behind the Seraphim Space accelerator. Backs early-stage space and dual-use companies, a sector with strong defence and security crossover.",
  },
  {
    id: "geovation",
    name: "Geovation",
    organiser: "Ordnance Survey",
    type: "accelerator",
    focus: ["Geospatial", "PropTech"],
    location: "London",
    cadence: "Accelerator intakes plus rolling community",
    offer:
      "Equity-free accelerator, grant funding, Ordnance Survey data access",
    applicationUrl: "https://geovation.uk/",
    description:
      "Ordnance Survey's accelerator for geospatial and property technology startups. Equity-free support with grant funding and privileged access to OS data and experts.",
  },
  {
    id: "natwest-accelerator",
    name: "NatWest Accelerator",
    organiser: "NatWest",
    type: "accelerator",
    focus: ["SME growth (sector-agnostic)"],
    location: "UK (regional hubs)",
    cadence: "Intakes through the year",
    offer:
      "Fully funded 6-month programme, coaching, hub workspace — no equity",
    applicationUrl:
      "https://www.natwest.com/business/business-services/entrepreneur-accelerator.html",
    description:
      "NatWest's free business accelerator, run from regional enterprise hubs across the UK. Six months of coaching, events and workspace; no fees and no equity taken.",
  },
  {
    id: "northern-accelerator",
    name: "Northern Accelerator",
    organiser: "North East England universities",
    type: "accelerator",
    focus: ["University spinouts", "Deep tech"],
    location: "North East England",
    cadence: "Rolling — works with university research teams",
    offer:
      "Commercialisation support, executive recruitment, seed funding routes",
    applicationUrl: "https://northernaccelerator.org/",
    description:
      "A collaboration between North East England universities that turns research into spinout companies. Pairs academics with experienced executives and supports the route to seed investment.",
  },
  {
    id: "icure",
    name: "ICURe",
    organiser: "Innovate UK",
    type: "accelerator",
    focus: ["Research commercialisation", "University spinouts"],
    location: "UK (national)",
    cadence: "Multiple cohorts a year",
    offer: "Funded market-discovery programme for university research teams",
    applicationUrl: "https://iuk-business-connect.org.uk/programme/icure/",
    description:
      "Innovate UK's commercialisation programme for university researchers. Funds teams to get out of the lab and test whether their research has a market before spinning out.",
  },
  {
    id: "digital-catapult",
    name: "Digital Catapult programmes",
    organiser: "Digital Catapult",
    type: "accelerator",
    focus: ["Deep tech", "AI", "Telecoms & networks"],
    location: "London + regional centres",
    cadence: "Themed open calls year-round",
    offer: "Equity-free accelerators, testbeds, corporate challenge programmes",
    applicationUrl: "https://www.digicatapult.org.uk/programmes/",
    description:
      "The UK's innovation agency arm for advanced digital technology runs a rotating set of equity-free accelerator and challenge programmes. Open calls pair deep-tech startups with corporate and government partners.",
  },

  // ── Incubators & university ecosystems ─────────────────────────────────────
  {
    id: "setsquared",
    name: "SETsquared",
    organiser: "SETsquared Partnership",
    type: "incubator",
    focus: ["Deep tech", "University spinouts"],
    location: "Bath, Bristol, Cardiff, Exeter, Southampton, Surrey",
    cadence: "Rolling membership applications",
    offer: "Incubation, mentoring, investment readiness, investor showcases",
    applicationUrl: "https://www.setsquared.co.uk/",
    description:
      "The long-running university partnership incubator, repeatedly ranked among the world's best. Membership brings structured incubation, investment-readiness support and investor showcase events.",
    organizerSlug: "setsquared",
  },
  {
    id: "raeng-enterprise-hub",
    name: "Royal Academy of Engineering Enterprise Hub",
    organiser: "Royal Academy of Engineering",
    type: "incubator",
    focus: ["Engineering", "Deep tech"],
    location: "UK (national)",
    cadence: "Annual award rounds (e.g. Enterprise Fellowships)",
    offer: "Equity-free funding and mentoring from Academy Fellows",
    applicationUrl: "https://enterprisehub.raeng.org.uk/",
    description:
      "The Academy's home for engineering entrepreneurs. Competitive, equity-free fellowships and awards with funding plus mentoring from leading engineers and entrepreneurs.",
  },
  {
    id: "level39",
    name: "Level39",
    organiser: "Canary Wharf Group",
    type: "incubator",
    focus: ["Fintech", "Cyber security"],
    location: "London (Canary Wharf)",
    cadence: "Rolling membership",
    offer: "Workspace, community, access to enterprise buyers and investors",
    applicationUrl: "https://level39.co/",
    description:
      "One of Europe's best-known tech communities, hosting fintech and cyber security scale-ups in Canary Wharf. Membership brings workspace plus access to banks, enterprises and investors.",
    cyberRelevant: true,
  },
  {
    id: "codebase",
    name: "CodeBase",
    organiser: "CodeBase",
    type: "incubator",
    focus: ["Tech (sector-agnostic)"],
    location: "Edinburgh / Glasgow / Aberdeen",
    cadence: "Rolling",
    offer: "Incubation, workspace, startup programmes and community",
    applicationUrl: "https://thisiscodebase.com/",
    description:
      "The UK's largest technology incubator, headquartered in Edinburgh. Workspace, community and startup programmes for tech founders across Scotland.",
  },
  {
    id: "tramshed-tech",
    name: "Tramshed Tech",
    organiser: "Tramshed Tech",
    type: "incubator",
    focus: ["Tech", "Digital & creative"],
    location: "Wales (Cardiff, Newport, Swansea, Barry)",
    cadence: "Rolling + cohort programmes",
    offer: "Workspace, startup programmes, skills training",
    applicationUrl: "https://www.tramshedtech.co.uk/",
    description:
      "Wales's startup hub network, with sites across South Wales. Coworking plus funded startup and scale-up programmes for digital, creative and tech businesses.",
  },

  // ── Ecosystem & corporate support ──────────────────────────────────────────
  {
    id: "barclays-eagle-labs",
    name: "Barclays Eagle Labs",
    organiser: "Barclays",
    type: "ecosystem-support",
    focus: ["Scale-up support", "Ecosystem"],
    location: "UK (national network)",
    cadence: "Rolling — programmes & events year-round",
    offer: "Workspace, mentoring, scale-up programmes, investor events",
    applicationUrl: "https://labs.uk.barclays/",
    description:
      "A UK-wide network of incubation spaces and scale-up programmes. Equity-free support, ecosystem connections, and regular investor/demo events.",
  },
  {
    id: "google-for-startups",
    name: "Google for Startups",
    organiser: "Google",
    type: "ecosystem-support",
    focus: ["Tech", "AI", "Cloud"],
    location: "London & global",
    cadence: "Themed programmes open periodically",
    offer: "Equity-free programmes, cloud credits, mentoring",
    applicationUrl: "https://startup.google.com/programs/",
    description:
      "Equity-free accelerator and growth programmes (including AI-first and Web cohorts) plus cloud credits and Google mentor access.",
  },
  {
    id: "microsoft-for-startups",
    name: "Microsoft for Startups Founders Hub",
    organiser: "Microsoft",
    type: "ecosystem-support",
    focus: ["B2B SaaS", "AI", "Cloud"],
    location: "Global (self-serve)",
    cadence: "Always open — self-serve enrolment",
    offer: "Up to $150k Azure/OpenAI credits, tools, mentorship",
    applicationUrl: "https://www.microsoft.com/en-us/startups",
    description:
      "Self-serve programme giving startups Azure and OpenAI credits, developer tooling, and go-to-market support. No equity, minimal eligibility bar.",
  },
  {
    id: "aws-activate",
    name: "AWS Activate",
    organiser: "Amazon Web Services",
    type: "ecosystem-support",
    focus: ["Cloud", "B2B SaaS"],
    location: "Global (self-serve)",
    cadence: "Always open — self-serve",
    offer: "AWS credits, technical support, startup tooling",
    applicationUrl: "https://aws.amazon.com/startups/",
    description:
      "Amazon's startup programme giving cloud credits, technical support and tooling through the AWS for Startups portal. Self-serve and equity-free.",
  },
  {
    id: "nvidia-inception",
    name: "NVIDIA Inception",
    organiser: "NVIDIA",
    type: "ecosystem-support",
    focus: ["AI", "Deep tech"],
    location: "Global (self-serve)",
    cadence: "Always open — self-serve",
    offer: "Hardware discounts, cloud credits, technical resources — no equity",
    applicationUrl: "https://www.nvidia.com/en-gb/startups/",
    description:
      "NVIDIA's free programme for AI and deep-tech startups. Discounts on hardware, cloud credits, technical training and investor exposure; no equity and no cohort deadlines.",
  },
  {
    id: "virgin-startup",
    name: "Virgin StartUp",
    organiser: "Virgin",
    type: "ecosystem-support",
    focus: ["Early-stage founders"],
    location: "UK (national)",
    cadence: "Always open",
    offer: "Government-backed startup loans plus mentoring and programmes",
    applicationUrl: "https://www.virginstartup.org/",
    description:
      "Virgin's not-for-profit for UK founders. Delivers government-backed startup loans alongside mentoring, masterclasses and founder programmes.",
  },
  {
    id: "gs-10ksb-uk",
    name: "Goldman Sachs 10,000 Small Businesses UK",
    organiser: "Goldman Sachs",
    type: "ecosystem-support",
    focus: ["SME growth", "Leadership"],
    location: "UK (national, delivered with universities)",
    cadence: "Cohorts through the year",
    offer: "Fully funded growth and leadership programme — no fees, no equity",
    applicationUrl:
      "https://www.goldmansachs.com/community-impact/10000-small-businesses/uk",
    description:
      "A fully funded, mini-MBA-style programme for established small business owners, delivered with UK universities. Focused on practical growth planning; no cost to participants.",
  },
  {
    id: "help-to-grow-management",
    name: "Help to Grow: Management",
    organiser: "Small Business Charter (UK Government)",
    type: "ecosystem-support",
    focus: ["Leadership", "SME growth"],
    location: "UK (business schools nationwide)",
    cadence: "Cohorts at business schools year-round",
    offer: "90%-subsidised 12-week management course with mentoring",
    applicationUrl: "https://smallbusinesscharter.org/help-to-grow-management/",
    description:
      "The government-backed management course for SME leaders, delivered by accredited business schools across the UK. Twelve weeks of practical modules plus one-to-one mentoring, 90% subsidised.",
  },
  {
    id: "bipc",
    name: "Business & IP Centre (BIPC)",
    organiser: "British Library",
    type: "ecosystem-support",
    focus: ["IP & trademarks", "Early-stage support"],
    location: "London + national library network",
    cadence: "Always open — workshops and one-to-ones",
    offer: "Free IP advice, market research databases, workshops",
    applicationUrl: "https://www.bl.uk/bipc",
    description:
      "The British Library's free support service for startups and small businesses, with centres in libraries across the UK. Intellectual property guidance, market research databases and regular workshops.",
  },
  {
    id: "innovate-uk-bridgeai",
    name: "Innovate UK BridgeAI",
    organiser: "Innovate UK",
    type: "ecosystem-support",
    focus: ["AI", "AI adoption"],
    location: "UK (national)",
    cadence: "Funding calls and support open periodically",
    offer: "AI adoption support, expert advice, funding competitions",
    applicationUrl: "https://iuk-business-connect.org.uk/programme/bridgeai/",
    description:
      "Innovate UK's programme helping businesses in high-growth sectors adopt AI. Offers funding competitions, expert advice and skills support for both AI suppliers and adopters.",
  },
  {
    id: "catalyst-belfast",
    name: "Catalyst",
    organiser: "Catalyst",
    type: "ecosystem-support",
    focus: ["Tech", "Innovation"],
    location: "Belfast / Northern Ireland",
    cadence: "Rolling + annual programmes",
    offer: "Innovation community, founder programmes, workspace",
    applicationUrl: "https://wearecatalyst.org/",
    description:
      "Northern Ireland's independent innovation community, based at the Belfast science park. Runs founder programmes (such as Co-Founders) and connects the NI tech ecosystem.",
  },

  // ── Devolved & competitions ────────────────────────────────────────────────
  {
    id: "scottish-edge",
    name: "Scottish EDGE",
    organiser: "Scottish EDGE",
    type: "grant-competition",
    focus: ["Scottish startups", "SME growth"],
    location: "Scotland",
    cadence: "Competition rounds twice a year",
    offer: "Awards up to £100k (part grant, part loan)",
    applicationUrl: "https://www.scottishedge.com/",
    description:
      "Scotland's biggest business funding competition, backed by the Hunter Foundation, Royal Bank of Scotland and Scottish Government. Round-based awards of up to £100k for high-growth-potential Scottish businesses.",
  },
];

export function listProgrammes(type?: ProgrammeType): Programme[] {
  if (!type) return PROGRAMMES;
  return PROGRAMMES.filter((p) => p.type === type);
}
