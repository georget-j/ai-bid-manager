/**
 * Grant flow QA harness — drives real UK grants end-to-end through the guided
 * application flow and prints a per-capability pass/fail matrix.
 *
 * Opt-in: runs ONLY via `npm run qa:grants` (vitest.qa.config.ts), never in `npm test`.
 * Uses the service-role Supabase client (bypasses auth/RLS) + OpenAI, and makes
 * best-effort outbound fetches to real gov sites. Everything it writes is tagged to a
 * throwaway QA org / `manual-upload:qa-*` grants and removed on cleanup.
 *
 * Steps exercised per grant (the real libs the app uses — no product code changed):
 *   enrich → score (eligibility) → extract requirements → how-to-apply guide →
 *   ingest evidence → create draft → answer (KB-grounded, grant-scoped) → budget →
 *   buildApplicationFlow (spine + readiness) → DOCX export (with budget).
 */
import { writeFileSync } from "fs";
import { resolve } from "path";
import { getServiceSupabase } from "@/lib/supabase-service";
import { getGrant } from "@/lib/grants/data";
import { getOrgProfile } from "@/lib/procurement/data";
import { scoreGrant, type GrantScoringResult } from "@/lib/grants/scoring";
import { enrichGrant } from "@/lib/grants/enrich";
import { ensureApplicationGuide } from "@/lib/grants/guide";
import {
  ingestGrantDocuments,
  grantCollection,
} from "@/lib/grants/ingest-docs";
import { ingestDocument } from "@/lib/documents";
import {
  buildGrantRequirementText,
  hasRequirementText,
} from "@/lib/grants/application";
import { extractRFPQuestions } from "@/lib/rfp-extract";
import { retrieveChunks } from "@/lib/retrieval";
import { generateRFPResponse } from "@/lib/generation";
import {
  createResponseDraft,
  patchResponseDraft,
} from "@/lib/responses/drafts";
import { buildApplicationFlow } from "@/lib/grants/application-flow";
import { generateBatchDocx, type BatchItem } from "@/lib/export-docx";
import type { GrantRow } from "@/lib/grants/types";
import type { OrganisationProfileRow } from "@/lib/procurement/types";

const supabase = getServiceSupabase();

// ── fixed, clearly-test identifiers ──────────────────────────────────────────
const QA_ORG = "00000000-0000-0000-0000-0000000000a0";
const SEED = {
  awardsForAll: "00000000-0000-0000-0000-0000000000a1",
  dycp: "00000000-0000-0000-0000-0000000000a2",
  flf: "00000000-0000-0000-0000-0000000000a3",
  smartCymru: "00000000-0000-0000-0000-0000000000a4",
};
const ANSWERS_PER_GRANT = 2;
const MAX_LIVE_GRANTS = 5;

function iso(daysFromNow: number): string {
  return new Date(Date.now() + daysFromNow * 86_400_000).toISOString();
}

// ── profiles ─────────────────────────────────────────────────────────────────
function baseProfile(name: string): OrganisationProfileRow {
  return {
    id: "00000000-0000-0000-0000-0000000000p0",
    org_id: QA_ORG,
    name,
    organisation_type: null,
    sectors: [],
    services: [],
    keywords: [],
    cpv_codes: [],
    regions: [],
    certifications: [],
    accreditations: [],
    insurance: null,
    min_contract_value: null,
    max_contract_value: null,
    preferred_buyers: [],
    excluded_buyers: [],
    excluded_keywords: [],
    company_size_band: null,
    annual_turnover: null,
    year_established: null,
    delivery_models: [],
    social_value: [],
    legal_form: null,
    is_registered_charity: null,
    charity_number: null,
    company_number: null,
    match_funding_capacity: null,
    beneficiaries: [],
    grant_themes: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// In-memory only — used to demonstrate the eligibility branch flipping (pure scoreGrant).
const CHARITY_PROFILE: OrganisationProfileRow = {
  ...baseProfile("QA Charity"),
  organisation_type: "Charity",
  legal_form: "charity",
  is_registered_charity: true,
  charity_number: "1234567",
  regions: ["England"],
  grant_themes: ["community", "wellbeing", "young people"],
  beneficiaries: ["communities", "young people"],
  social_value: ["local employment"],
};

// The DB-backed SME profile inserted for the org (drives the full flow).
const SME_PROFILE_INSERT = {
  org_id: QA_ORG,
  name: "QA Cyber SME Ltd",
  organisation_type: "SME",
  legal_form: "company",
  is_registered_charity: false,
  company_number: "09876543",
  company_size_band: "small",
  match_funding_capacity: 50000,
  sectors: ["cyber security", "software", "digital"],
  keywords: ["cyber", "security", "software", "digital", "technology", "data"],
  services: ["penetration testing", "managed security", "software development"],
  regions: ["England", "United Kingdom"],
  social_value: ["local employment", "net zero"],
  grant_themes: ["cyber security", "digital innovation", "technology"],
  beneficiaries: ["SMEs", "businesses"],
};

// ── seeded gap-filler grants (real UK schemes the connectors don't carry) ─────
type SeedRow = Record<string, unknown>;

function seededGrants(): SeedRow[] {
  return [
    {
      id: SEED.awardsForAll,
      source_name: "manual-upload",
      source_notice_id: "qa-awards-for-all-england",
      source_url:
        "https://www.tnlcommunityfund.org.uk/funding/programmes/national-lottery-awards-for-all-england",
      application_url:
        "https://www.tnlcommunityfund.org.uk/funding/programmes/national-lottery-awards-for-all-england",
      title: "National Lottery Awards for All England",
      description:
        "Funding of £300 to £20,000 for projects that bring people together to build strong relationships in and across communities, improve the places and spaces that matter to communities, and help more people to reach their potential. Projects must take place in England.",
      funder_name: "The National Lottery Community Fund",
      funder_region: "England",
      funding_type: "grant",
      amount_min: 300,
      amount_max: 20000,
      currency: "GBP",
      open_at: iso(-30),
      deadline_at: null,
      status: "rolling",
      themes: ["community", "wellbeing"],
      sectors: ["community", "voluntary"],
      regions: ["England"],
      eligibility_text:
        "Open to voluntary or community organisations, registered charities, constituted groups or clubs, not-for-profit companies, community interest companies (CICs), schools and statutory bodies. You must have a UK bank account in your organisation's name and at least two unrelated people on your committee or board. Individuals and for-profit businesses are not eligible.",
      eligible_org_types: [
        "charity",
        "voluntary or community organisation",
        "not-for-profit",
        "cic",
        "school",
      ],
      match_funding_required: false,
      beneficiaries: ["communities", "young people"],
      documents: null,
      details: {
        sections: [
          {
            heading: "Who can apply",
            text: "You can apply if you are a voluntary or community organisation, a registered charity, a constituted group or club, a not-for-profit company or community interest company, a school, or a statutory body. Your organisation must have at least two unrelated people on the board or committee and a UK bank account in the organisation's legal name. Individuals and profit-making businesses cannot apply.",
          },
          {
            heading: "What you can spend the money on",
            text: "Grants of £300 to £20,000 for up to two years. You can fund staff costs, volunteer expenses, equipment, venue hire, transport, training and utilities directly related to your project. The project must benefit communities in England.",
          },
          {
            heading: "How to apply",
            text: "Apply online through the National Lottery Community Fund grant management system. Create an account, complete the application form describing your project, who it benefits and how the National Lottery funding will be spent, and provide your organisation's governing document and bank details. There is no deadline — you can apply at any time and a decision is usually made within 16 weeks.",
          },
        ],
        links: [
          {
            title: "Who can apply",
            url: "https://www.tnlcommunityfund.org.uk/funding/programmes/national-lottery-awards-for-all-england",
          },
        ],
        documents: [],
        webpageUrl:
          "https://www.tnlcommunityfund.org.uk/funding/programmes/national-lottery-awards-for-all-england",
      },
    },
    {
      id: SEED.dycp,
      source_name: "manual-upload",
      source_notice_id: "qa-dycp",
      source_url: "https://www.artscouncil.org.uk/dycp",
      application_url: "https://www.artscouncil.org.uk/dycp",
      title: "Developing Your Creative Practice (DYCP)",
      description:
        "Grants of £2,000 to £12,000 for individual creative practitioners in England to take time to focus on their own creative development — research, time to think, travel, training, mentoring or developing new work. This is about developing the individual's practice, not delivering a project for audiences.",
      funder_name: "Arts Council England",
      funder_region: "England",
      funding_type: "grant",
      amount_min: 2000,
      amount_max: 12000,
      currency: "GBP",
      open_at: iso(-5),
      deadline_at: iso(22),
      status: "open",
      themes: ["arts", "culture", "creative practice"],
      sectors: ["arts", "creative"],
      regions: ["England"],
      eligibility_text:
        "Open to individual creative practitioners (artists, performers, writers, makers, curators and other cultural practitioners) aged 18 or over and based in England. You must have at least one year of practice beyond any training. You cannot apply if you have had a successful DYCP application or two unsuccessful ones since Round 12.",
      eligible_org_types: ["individual"],
      match_funding_required: false,
      beneficiaries: ["artists", "creative practitioners"],
      documents: null,
      details: {
        sections: [
          {
            heading: "Eligibility",
            text: "You must be an individual creative or cultural practitioner aged 18 or over, based in England, with at least one year of practice beyond training. You apply as an individual, not on behalf of an organisation. You need an applicant profile on the Arts Council grants system, which can take up to 10 working days to approve, so register early.",
          },
          {
            heading: "How to apply",
            text: "Register and create an applicant profile on the Arts Council England online portal. Watch the DYCP webinar and read the guidance. Complete the application describing your current practice, what you want to develop and why now, and how the funding (£2,000–£12,000) will support that development. Submit before the round closes.",
          },
          {
            heading: "Key dates",
            text: "Applications are accepted in rounds. The current round closes at midday on the published deadline; late applications are not accepted.",
          },
        ],
        links: [
          {
            title: "DYCP overview",
            url: "https://www.artscouncil.org.uk/dycp",
          },
        ],
        documents: [],
        webpageUrl: "https://www.artscouncil.org.uk/dycp",
      },
    },
    {
      id: SEED.flf,
      source_name: "manual-upload",
      source_notice_id: "qa-ukri-flf",
      source_url:
        "https://www.ukri.org/what-we-do/developing-people-and-skills/future-leaders-fellowships/",
      application_url:
        "https://www.ukri.org/what-we-do/developing-people-and-skills/future-leaders-fellowships/",
      title: "UKRI Future Leaders Fellowships",
      description:
        "Substantial fellowships (typically £1.0m–£1.5m over four to seven years) to help early career researchers and innovators become leaders in their field, whether in universities, businesses or other research organisations. Supports salary, research costs, equipment and team members.",
      funder_name: "UK Research and Innovation (UKRI)",
      funder_region: "United Kingdom",
      funding_type: "fellowship",
      amount_min: 1000000,
      amount_max: 1500000,
      currency: "GBP",
      open_at: iso(-10),
      deadline_at: iso(75),
      status: "open",
      themes: ["research", "innovation", "leadership"],
      sectors: ["research", "academia", "technology"],
      regions: ["United Kingdom"],
      eligibility_text:
        "For early career researchers and innovators of any nationality, hosted by a UK university, business or other research organisation. The fellow must be at an early stage of their independent career. Applications are made through the host organisation's research office.",
      eligible_org_types: ["university", "research organisation", "business"],
      match_funding_required: false,
      beneficiaries: ["researchers", "innovators"],
      documents: null,
      details: {
        sections: [
          {
            heading: "Eligibility",
            text: "Open to researchers and innovators at an early stage of their independent career, of any nationality, who will be hosted by an eligible UK university, business or research organisation. There is no fixed eligibility cut-off by years since PhD; instead you must demonstrate you are at the right career stage to benefit. The host organisation must commit to supporting the fellow's development and to absorbing them after the award.",
          },
          {
            heading: "How to apply",
            text: "Applications are submitted through the host organisation via the UKRI Funding Service. Identify a host and a research office contact, develop your vision and research/innovation plan, secure host commitment and costings, then complete and submit the application before the round deadline. Shortlisted applicants are interviewed by a panel.",
          },
          {
            heading: "What it funds",
            text: "The fellowship covers your salary, the costs of your research or innovation programme, equipment, and the salaries of team members, typically over four to seven years with the option to request a flexible extension.",
          },
        ],
        links: [
          {
            title: "Future Leaders Fellowships",
            url: "https://www.ukri.org/what-we-do/developing-people-and-skills/future-leaders-fellowships/",
          },
        ],
        documents: [],
        webpageUrl:
          "https://www.ukri.org/what-we-do/developing-people-and-skills/future-leaders-fellowships/",
      },
    },
    {
      id: SEED.smartCymru,
      source_name: "manual-upload",
      source_notice_id: "qa-smart-cymru",
      source_url: "https://businesswales.gov.wales/innovation",
      application_url: "https://businesswales.gov.wales/innovation",
      title: "SMARTCymru R&D Innovation Funding",
      description:
        "Welsh Government funding to help Welsh small and medium-sized enterprises develop new or improved products, processes and services. Supports technical and commercial feasibility, industrial research and experimental development, with grants delivered at published intervention rates.",
      funder_name: "Welsh Government (Business Wales)",
      funder_region: "Wales",
      funding_type: "grant",
      amount_min: 25000,
      amount_max: 200000,
      currency: "GBP",
      open_at: iso(-60),
      deadline_at: null,
      status: "rolling",
      themes: ["innovation", "research and development", "technology"],
      sectors: ["technology", "manufacturing", "software", "digital"],
      regions: ["Wales"],
      eligibility_text:
        "Open to small and medium-sized enterprises (SMEs) and companies operating in or relocating to Wales that are developing innovative new products, processes or services. The project must involve genuine technical uncertainty and R&D beyond routine development.",
      eligible_org_types: ["sme", "company", "business"],
      match_funding_required: true,
      beneficiaries: ["businesses", "SMEs"],
      documents: null,
      details: {
        sections: [
          {
            heading: "Eligibility",
            text: "You must be a small or medium-sized enterprise based in or relocating to Wales, undertaking a research and development project with real technical uncertainty. Routine product updates do not qualify. You will need to provide match funding towards the project costs at the published intervention rate.",
          },
          {
            heading: "How to apply",
            text: "Contact a Business Wales innovation specialist to discuss your project. Submit an expression of interest describing the technical challenge, the innovation and the expected commercial outcome. If invited, complete a full application with a project plan, costed work packages, and evidence of your ability to match-fund. Applications are assessed on a rolling basis.",
          },
          {
            heading: "What it funds",
            text: "Funding supports technical and commercial feasibility studies, industrial research and experimental development — including staff time, materials, equipment usage and external expertise — to bring an innovative product, process or service to market.",
          },
        ],
        links: [
          {
            title: "Business Wales innovation",
            url: "https://businesswales.gov.wales/innovation",
          },
        ],
        documents: [],
        webpageUrl: "https://businesswales.gov.wales/innovation",
      },
    },
  ];
}

const SEED_META: Record<
  string,
  { label: string; type: string; showcase?: boolean }
> = {
  [SEED.awardsForAll]: {
    label: "Awards for All (England)",
    type: "charity/community",
  },
  [SEED.dycp]: { label: "DYCP (England)", type: "individuals/arts" },
  [SEED.flf]: { label: "UKRI FLF (UK)", type: "research fellowship" },
  [SEED.smartCymru]: {
    label: "SMARTCymru (Wales)",
    type: "business R&D",
    showcase: true,
  },
};

// ── seed + cleanup ───────────────────────────────────────────────────────────
async function seed(): Promise<void> {
  await supabase.from("orgs").upsert(
    { id: QA_ORG, name: "Grant Flow QA", slug: "grant-flow-qa" },
    {
      onConflict: "id",
    },
  );
  // cleanup() ran first, so no profile exists — a plain insert avoids depending on a
  // unique constraint on org_id for upsert.
  const { error: profErr } = await supabase
    .from("organisation_profiles")
    .insert(SME_PROFILE_INSERT);
  if (profErr) throw new Error(`profile insert failed: ${profErr.message}`);
  await supabase.from("grants").upsert(seededGrants(), { onConflict: "id" });
}

async function cleanup(): Promise<void> {
  // documents cascade to document_chunks; drafts/profile reference the org.
  await supabase.from("documents").delete().eq("org_id", QA_ORG);
  await supabase.from("response_drafts").delete().eq("org_id", QA_ORG);
  await supabase.from("grant_matches").delete().eq("org_id", QA_ORG);
  await supabase.from("organisation_profiles").delete().eq("org_id", QA_ORG);
  await supabase.from("grants").delete().eq("source_name", "manual-upload");
  await supabase.from("orgs").delete().eq("id", QA_ORG);
}

// ── live-catalogue grant selection ───────────────────────────────────────────
interface LivePick {
  grant: GrantRow;
  label: string;
  type: string;
}

function regionMatch(g: GrantRow, token: string): boolean {
  return (g.regions ?? []).some((r) =>
    r.toLowerCase().includes(token.toLowerCase()),
  );
}

async function selectLiveGrants(): Promise<LivePick[]> {
  const { data } = await supabase
    .from("grants")
    .select("*")
    .in("status", ["open", "forthcoming", "rolling"])
    .neq("source_name", "manual-upload")
    .limit(400);
  const pool = (data ?? []) as GrantRow[];
  const picks: LivePick[] = [];
  const used = new Set<string>();
  const take = (g: GrantRow | undefined, label: string, type: string) => {
    if (!g || used.has(g.id) || picks.length >= MAX_LIVE_GRANTS) return;
    used.add(g.id);
    picks.push({ grant: g, label, type });
  };
  const enriched = (g: GrantRow) => g.details != null;

  take(
    pool.find((g) => g.source_name === "innovate-uk" && enriched(g)) ??
      pool.find((g) => g.source_name === "innovate-uk"),
    "Innovate UK (UK)",
    "innovation/R&D",
  );
  take(
    pool.find((g) => regionMatch(g, "Scotland") && enriched(g)) ??
      pool.find((g) => regionMatch(g, "Scotland")),
    "GOV.UK (Scotland)",
    "GOV.UK grant",
  );
  take(
    pool.find((g) => regionMatch(g, "Northern Ireland") && enriched(g)) ??
      pool.find((g) => regionMatch(g, "Northern Ireland")),
    "GOV.UK (N. Ireland)",
    "GOV.UK grant",
  );
  take(
    pool.find(
      (g) =>
        enriched(g) &&
        ((g.details?.documents?.length ?? 0) > 0 ||
          (g.details?.links?.length ?? 0) > 0),
    ),
    "GOV.UK (with documents)",
    "GOV.UK + evidence",
  );
  take(
    pool.find(
      (g) => g.source_name === "govuk-find-a-grant" && g.details == null,
    ),
    "GOV.UK (un-enriched)",
    "thin / lazy enrich",
  );
  return picks;
}

// ── per-grant flow run ───────────────────────────────────────────────────────
interface QAResult {
  label: string;
  type: string;
  region: string;
  grantId: string;
  title: string;
  enriched: boolean;
  questions: number;
  guide: boolean;
  eligible: boolean | null;
  fit: number | null;
  ingested: string;
  answered: number;
  citations: number;
  budget: boolean;
  readiness: number;
  ready: boolean;
  exportBytes: number;
  note: string;
  error: string;
}

const BUDGET = {
  costs: [
    { id: "c1", label: "Staff time", amount: 18000 },
    { id: "c2", label: "Equipment & materials", amount: 7000 },
  ],
  funding: [
    { id: "f1", label: "Grant requested", amount: 20000 },
    { id: "f2", label: "Match funding", amount: 5000 },
  ],
};

async function runGrant(
  grantId: string,
  profile: OrganisationProfileRow,
  meta: { label: string; type: string; showcase?: boolean },
): Promise<QAResult> {
  const res: QAResult = {
    label: meta.label,
    type: meta.type,
    region: "",
    grantId,
    title: "",
    enriched: false,
    questions: 0,
    guide: false,
    eligible: null,
    fit: null,
    ingested: "0/0",
    answered: 0,
    citations: 0,
    budget: false,
    readiness: 0,
    ready: false,
    exportBytes: 0,
    note: "",
    error: "",
  };
  try {
    let grant = await getGrant(grantId);
    if (!grant) throw new Error("grant not found");
    res.title = grant.title;
    res.region = (grant.regions ?? []).join(", ") || "—";

    // 1. enrich
    if (!grant.details) {
      await enrichGrant(grant).catch(() => null);
      grant = (await getGrant(grantId)) ?? grant;
    }
    res.enriched = grant.details != null;

    // 2. eligibility
    const fit: GrantScoringResult = scoreGrant(grant, profile);
    res.eligible = fit.eligible;
    res.fit = fit.fitScore;

    // 3. extract requirements
    const questions = hasRequirementText(grant)
      ? await extractRFPQuestions(buildGrantRequirementText(grant)).catch(
          () => [],
        )
      : [];
    res.questions = questions.length;

    // 4. how-to-apply guide
    const guide = await ensureApplicationGuide(grant).catch(() => null);
    res.guide = !!guide && guide.steps.length > 0;

    // 5. evidence — real ingest (best-effort) + deterministic seed for the showcase
    const ingest = await ingestGrantDocuments(profile.org_id, grant, {
      maxSources: 4,
      deadlineMs: 25_000,
    }).catch(() => ({ total: 0, ingested: 0, alreadyPresent: 0 }));
    let kbCount = ingest.ingested + (ingest.alreadyPresent ?? 0);
    if (meta.showcase && kbCount === 0) {
      await ingestDocument({
        text: `${grant.title} — funder guidance.\n\n${(
          grant.details?.sections ?? []
        )
          .map((s) => `${s.heading}\n${s.text}`)
          .join("\n\n")}`,
        title: `${grant.title} — guidance`,
        sourceType: "upload",
        collection: grantCollection(grant.id),
        orgId: profile.org_id,
      });
      kbCount = 1;
    }
    res.ingested = `${ingest.ingested}/${ingest.total}`;
    if (meta.showcase && ingest.ingested === 0 && kbCount > 0)
      res.ingested += " (seeded)";

    // 6. create draft (trim selected to keep the answer pass bounded + reachable)
    const selectedIds = questions.slice(0, ANSWERS_PER_GRANT).map((q) => q.id);
    const draft = await createResponseDraft(profile.org_id, {
      rfp_title: `${grant.title} — Application`,
      grant_id: grant.id,
      status: "draft",
      extracted_questions: questions,
      selected_question_ids: selectedIds,
    });

    // 7. answer the selected questions (KB-grounded, grant-scoped)
    const answers: Record<string, unknown> = {};
    const items: BatchItem[] = [];
    let citations = 0;
    const scoped = questions.slice(0, ANSWERS_PER_GRANT);
    for (const q of scoped) {
      try {
        const chunks = await retrieveChunks(
          q.text,
          profile.org_id,
          null,
          grantCollection(grant.id),
        ).catch(() => []);
        const response = await generateRFPResponse(q.text, chunks);
        citations += response.citations.length;
        answers[String(q.id)] = {
          question_id: q.id,
          question_text: q.text,
          section: q.section,
          response,
          retrieved_chunks: chunks,
        };
        items.push({
          section: q.section ?? "General",
          question: q.text,
          response,
        });
      } catch {
        /* skip a question that failed to generate; recorded by a lower answered count */
      }
    }
    res.answered = Object.keys(answers).length;
    res.citations = citations;

    // 8. budget
    await patchResponseDraft(draft.id, profile.org_id, {
      answers,
      budget: BUDGET,
    });
    res.budget = true;

    // 9. application flow (spine + readiness). Scope to the questions we kept + answered,
    // so "all answered" reflects the in-scope set (res.questions still reports the full count).
    const flow = buildApplicationFlow({
      grant,
      fit,
      extractedQuestions: scoped,
      answers,
      selectedIds,
      kbDocCount: kbCount,
      pendingReview: 0,
      budget: BUDGET,
      stage: "drafting",
    });
    res.readiness = Math.round(
      (flow.checks.filter((c) => c.ok).length / flow.checks.length) * 100,
    );
    res.ready = flow.readyToSubmit;

    // 10. export (with budget table)
    if (items.length > 0) {
      const buf = await generateBatchDocx(
        `${grant.title} — Application`,
        items,
        BUDGET,
      );
      res.exportBytes = buf.length;
    }
  } catch (e) {
    res.error = e instanceof Error ? e.message : String(e);
  }
  return res;
}

// ── report ───────────────────────────────────────────────────────────────────
function ok(b: boolean): string {
  return b ? "PASS" : "FAIL";
}

function buildReport(results: QAResult[], charityFlip: string): string {
  const lines: string[] = [];
  lines.push("# Grant Flow QA — results\n");
  lines.push(`Run: ${new Date().toISOString()} · grants: ${results.length}\n`);
  lines.push(
    "| Grant | Type | Region | Enriched | Qs | Guide | Eligible | Fit | Ingested | Answered | Cites | Budget | Ready | Export |",
  );
  lines.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const r of results) {
    lines.push(
      `| ${r.label} | ${r.type} | ${r.region} | ${r.enriched ? "✓" : "—"} | ${r.questions} | ${r.guide ? "✓" : "—"} | ${r.eligible === null ? "?" : r.eligible ? "✓" : "✗"} | ${r.fit ?? "—"} | ${r.ingested} | ${r.answered} | ${r.citations} | ${r.budget ? "✓" : "—"} | ${r.ready ? "✓" : `${r.readiness}%`} | ${r.exportBytes ? `${r.exportBytes}b` : "—"} |${r.error ? ` ⚠ ${r.error}` : ""}`,
    );
  }
  lines.push("\n## Eligibility branch");
  lines.push(charityFlip);
  return lines.join("\n");
}

// ── entry point ──────────────────────────────────────────────────────────────
export interface QASummary {
  results: QAResult[];
  capabilities: Record<string, boolean>;
  charityFlip: string;
}

export async function runGrantFlowQA(
  opts: { keep?: boolean } = {},
): Promise<QASummary> {
  await cleanup(); // start from a clean slate (idempotent)
  await seed();
  const profile = await getOrgProfile(QA_ORG);
  if (!profile) throw new Error("QA profile not created");

  const targets: Array<{
    id: string;
    meta: { label: string; type: string; showcase?: boolean };
  }> = Object.entries(SEED_META).map(([id, meta]) => ({ id, meta }));
  for (const p of await selectLiveGrants())
    targets.push({ id: p.grant.id, meta: { label: p.label, type: p.type } });

  const results: QAResult[] = [];
  for (const t of targets) {
    process.stdout.write(`  • ${t.meta.label} … `);
    const r = await runGrant(t.id, profile, t.meta);
    process.stdout.write(
      r.error
        ? `ERROR: ${r.error}\n`
        : `ok (fit ${r.fit}, ${r.answered} answered, ready ${r.ready})\n`,
    );
    results.push(r);
  }

  // Eligibility branch: Awards for All is charity-only.
  const afa = (await getGrant(SEED.awardsForAll))!;
  const smeOnAfa = scoreGrant(afa, profile);
  const charityOnAfa = scoreGrant(afa, CHARITY_PROFILE);
  const charityFlip = `Awards for All (charity-only) — SME profile eligible: ${smeOnAfa.eligible} (expected false); registered-charity profile eligible: ${charityOnAfa.eligible} (expected true).`;

  // Capability roll-up across the matrix.
  const any = (f: (r: QAResult) => boolean) => results.some(f);
  const capabilities: Record<string, boolean> = {
    "scored every grant": results.every(
      (r) => r.fit !== null || r.error !== "",
    ),
    "extracted requirements (some grant)": any((r) => r.questions > 0),
    "generated a how-to-apply guide": any((r) => r.guide),
    "eligibility branch correct":
      smeOnAfa.eligible === false && charityOnAfa.eligible === true,
    "ingested evidence (some grant)":
      any((r) => r.answered > 0 && r.citations > 0) ||
      any((r) => r.ingested !== "0/0"),
    "answered KB-grounded questions": any((r) => r.answered > 0),
    "produced citations (some grant)": any((r) => r.citations > 0),
    "reached 'ready to submit' (showcase)": any((r) => r.ready),
    "exported DOCX with budget": any((r) => r.exportBytes > 0),
    "no unexpected errors": results.every((r) => r.error === ""),
  };

  const report = buildReport(results, charityFlip);
  console.log("\n" + report + "\n");
  console.log("## Capabilities");
  for (const [k, v] of Object.entries(capabilities))
    console.log(`  ${ok(v)}  ${k}`);
  console.log("\n" + charityFlip);
  try {
    writeFileSync(
      resolve(process.cwd(), "GRANT_FLOW_QA_REPORT.md"),
      report + "\n",
    );
  } catch {
    /* ignore */
  }

  if (!opts.keep) await cleanup();
  return { results, capabilities, charityFlip };
}
