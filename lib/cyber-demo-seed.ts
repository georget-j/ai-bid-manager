import * as fs from "fs";
import * as path from "path";
import { ingestDocument } from "./documents";
import { getServiceSupabase } from "./supabase";
import { openai } from "./openai";
import { getOrgProfile, upsertOrgProfile } from "./procurement/data";
import type {
  OrganisationProfileRow,
  InsuranceCover,
} from "./procurement/types";
import type { SeedResult } from "./schema";

const CYBER_DEMO_DIR = path.join(process.cwd(), "sample-data", "cyber-demo");

type DemoDoc = { fileName: string; title: string };

export const CYBER_DEMO_DOCUMENTS: DemoDoc[] = [
  {
    fileName: "01-company-overview.md",
    title: "Fortis Cyber Solutions — Company Overview",
  },
  {
    fileName: "02-capability-statement.md",
    title: "Fortis Cyber Solutions — Capability Statement",
  },
  {
    fileName: "03-case-study-nhs-trust.md",
    title: "Case Study: Cyber Essentials Plus — NHS Community Trust",
  },
  {
    fileName: "04-case-study-law-firm.md",
    title: "Case Study: Ransomware Incident Response — Regional Law Firm",
  },
  {
    fileName: "05-case-study-manufacturer.md",
    title: "Case Study: OT/IT Segmentation — Yorkshire Food Manufacturer",
  },
  {
    fileName: "06-certifications-accreditations.md",
    title: "Fortis Cyber Solutions — Certifications and Accreditations",
  },
  {
    fileName: "07-service-catalogue.md",
    title: "Fortis Cyber Solutions — Service Catalogue",
  },
  {
    fileName: "08-team-profiles-dump.md",
    title: "Fortis Staff Profiles (Internal HR Notes)",
  },
  {
    fileName: "09-methodology-notes-internal.md",
    title: "Fortis Delivery Methodology — Internal Reference Notes",
  },
  {
    fileName: "10-client-feedback-raw.md",
    title: "Fortis Client Feedback — Raw Compilation",
  },
  {
    fileName: "11-bid-history-log.md",
    title: "Fortis Bid History Log",
  },
  {
    fileName: "12-ir-playbook-v3.md",
    title: "Incident Response Playbook v3.0",
  },
  {
    fileName: "13-technology-partners.md",
    title: "Fortis Technology Partners and Supplier Relationships",
  },
];

async function docExistsForOrg(title: string, orgId: string): Promise<boolean> {
  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from("documents")
    .select("id")
    .eq("title", title)
    .eq("org_id", orgId)
    .maybeSingle();
  return !!data;
}

export async function seedCyberDemoDocuments(
  orgId: string,
): Promise<SeedResult> {
  const seeded: string[] = [];
  const skipped: string[] = [];

  for (const doc of CYBER_DEMO_DOCUMENTS) {
    const exists = await docExistsForOrg(doc.title, orgId);
    if (exists) {
      skipped.push(doc.title);
      continue;
    }

    const filePath = path.join(CYBER_DEMO_DIR, doc.fileName);
    const text = fs.readFileSync(filePath, "utf-8");

    await ingestDocument({
      text,
      title: doc.title,
      fileName: doc.fileName,
      mimeType: "text/markdown",
      sourceType: "sample",
      collection: "main",
      orgId,
    });

    seeded.push(doc.title);
  }

  return { seeded, skipped };
}

// ── Organisation profile seed (AI-generated from the sample docs) ───────────────

type ProfileInput = Omit<
  OrganisationProfileRow,
  "id" | "org_id" | "created_at" | "updated_at"
>;

const PROFILE_SOURCE_DOCS = [
  "01-company-overview.md",
  "02-capability-statement.md",
  "06-certifications-accreditations.md",
  "07-service-catalogue.md",
];

const EMPTY_PROFILE_INPUT: ProfileInput = {
  name: "",
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
};

function strArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === "string" ? x.trim() : String(x ?? "").trim()))
    .filter(Boolean)
    .slice(0, 12);
}

function numOrNull(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeInsurance(v: unknown): InsuranceCover | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const cover: InsuranceCover = {
    professional_indemnity: numOrNull(o.professional_indemnity),
    public_liability: numOrNull(o.public_liability),
    employers_liability: numOrNull(o.employers_liability),
  };
  const any =
    cover.professional_indemnity ||
    cover.public_liability ||
    cover.employers_liability;
  return any ? cover : null;
}

/** Ask gpt-4o-mini to extract a structured supplier profile from the sample docs. */
async function extractFortisProfile(
  sourceText: string,
): Promise<Partial<ProfileInput>> {
  const prompt = `You are extracting a UK public-procurement supplier profile from the company documents below. Return ONLY JSON with these keys (use null or [] for anything the documents do not support):
{
  "name": string,
  "organisation_type": string,
  "sectors": string[],
  "services": string[],
  "keywords": string[],
  "cpv_codes": string[],
  "regions": string[],
  "certifications": string[],
  "accreditations": string[],
  "min_contract_value": number,
  "max_contract_value": number,
  "company_size_band": "Micro (0-9)" | "Small (10-49)" | "Medium (50-249)" | "Large (250+)",
  "annual_turnover": number,
  "year_established": number,
  "delivery_models": ("On-site" | "Remote" | "Hybrid" | "Nationwide")[],
  "social_value": string[],
  "insurance": { "professional_indemnity": number, "public_liability": number, "employers_liability": number }
}
Rules: base every value on the documents; for cpv_codes choose appropriate 8-digit IT/cyber-security CPV codes; keep each array concise (max ~10); amounts in GBP as plain numbers.

DOCUMENTS:
${sourceText.slice(0, 14000)}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_tokens: 1200,
  });

  const raw = JSON.parse(
    completion.choices[0]?.message?.content ?? "{}",
  ) as Record<string, unknown>;

  return {
    name: typeof raw.name === "string" ? raw.name.trim() : undefined,
    organisation_type:
      typeof raw.organisation_type === "string"
        ? raw.organisation_type.trim()
        : null,
    sectors: strArray(raw.sectors),
    services: strArray(raw.services),
    keywords: strArray(raw.keywords),
    cpv_codes: strArray(raw.cpv_codes),
    regions: strArray(raw.regions),
    certifications: strArray(raw.certifications),
    accreditations: strArray(raw.accreditations),
    min_contract_value: numOrNull(raw.min_contract_value),
    max_contract_value: numOrNull(raw.max_contract_value),
    company_size_band:
      typeof raw.company_size_band === "string"
        ? raw.company_size_band.trim()
        : null,
    annual_turnover: numOrNull(raw.annual_turnover),
    year_established: numOrNull(raw.year_established),
    delivery_models: strArray(raw.delivery_models),
    social_value: strArray(raw.social_value),
    insurance: normalizeInsurance(raw.insurance),
  };
}

function isEmptyValue(v: unknown): boolean {
  if (v == null) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "string") return v.trim() === "";
  return false;
}

function stripMeta(row: OrganisationProfileRow): ProfileInput {
  const {
    id: _id,
    org_id: _org,
    created_at: _c,
    updated_at: _u,
    ...rest
  } = row;
  return rest;
}

/**
 * Seed the Fortis Cyber organisation profile from the sample documents. Idempotent:
 * by default only fills fields that are currently empty (never clobbers user edits);
 * pass { force: true } to overwrite. Returns the list of fields it populated.
 */
export async function seedCyberDemoProfile(
  orgId: string,
  opts?: { force?: boolean },
): Promise<{ seeded: boolean; fields: string[] }> {
  const sourceText = PROFILE_SOURCE_DOCS.map((f) => {
    try {
      return fs.readFileSync(path.join(CYBER_DEMO_DIR, f), "utf-8");
    } catch {
      return "";
    }
  })
    .filter(Boolean)
    .join("\n\n---\n\n");

  if (!sourceText.trim()) return { seeded: false, fields: [] };

  const extracted = await extractFortisProfile(sourceText);

  const existingRow = await getOrgProfile(orgId);
  const base: ProfileInput = existingRow
    ? stripMeta(existingRow)
    : { ...EMPTY_PROFILE_INPUT };

  const merged: ProfileInput = { ...base };
  const mergedRec = merged as Record<string, unknown>;
  const fields: string[] = [];
  const force = opts?.force ?? false;

  for (const [key, val] of Object.entries(extracted)) {
    if (val == null) continue;
    if (Array.isArray(val) && val.length === 0) continue;
    if (force || isEmptyValue(mergedRec[key])) {
      mergedRec[key] = val;
      fields.push(key);
    }
  }

  if (isEmptyValue(merged.name)) {
    merged.name = "Fortis Cyber Solutions Ltd";
    if (!fields.includes("name")) fields.push("name");
  }

  if (fields.length === 0) return { seeded: false, fields: [] };

  await upsertOrgProfile(orgId, merged);
  return { seeded: true, fields };
}
