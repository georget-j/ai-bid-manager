// Investor programmes & accelerators — the "first safe slice" of the investor /
// open-days vision. This is a CURATED, hand-maintained list of public programmes
// (names + public application URLs only — no personal data, no scraping). It leans
// UK / cyber / deep-tech to match the SME-supplier ICP.
//
// Why curated and not a live feed: Eventbrite removed its public event-search API in
// Feb 2020, and there is no free platform-wide event-search API. Live programme/event
// data at scale needs a paid provider (Dealroom / Crunchbase) or per-organiser
// integrations — tracked as a roadmap follow-on in the grants strategy doc.

export type ProgrammeType =
  | "accelerator"
  | "incubator"
  | "investor-programme"
  | "grant-competition"
  | "ecosystem-support";

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
}

export const PROGRAMMES: Programme[] = [
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
      "https://www.ncsc.gov.uk/section/products-services/ncsc-for-startups",
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
    applicationUrl: "https://cyberrunway.org/",
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
    applicationUrl: "https://cylonlab.com/",
    description:
      "One of Europe's longest-running cyber-security accelerators. Pre-seed cheque plus a structured programme and a strong security-sector mentor network.",
    cyberRelevant: true,
  },
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
    applicationUrl: "https://seedcamp.com/apply/",
    description:
      "Europe's leading seed fund. Rolling applications, fast process, and an unusually strong post-investment platform and expert network.",
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
];

export function listProgrammes(type?: ProgrammeType): Programme[] {
  if (!type) return PROGRAMMES;
  return PROGRAMMES.filter((p) => p.type === type);
}
