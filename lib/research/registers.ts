// Free UK register lookups to auto-fill grant-eligibility profile fields.
// Companies House: https://developer.company-information.service.gov.uk/ (Basic auth, key as username)
// Charity Commission: https://api-portal.charitycommission.gov.uk/ (Ocp-Apim-Subscription-Key)

export interface RegisterEnrichment {
  legal_form?: string;
  company_number?: string;
  charity_number?: string;
  is_registered_charity?: boolean;
  year_established?: number;
  name?: string;
  notes: string[];
}

const COMPANY_TYPE_TO_LEGAL_FORM: Record<string, string> = {
  ltd: "company",
  plc: "company",
  "private-limited-guarant-nsc": "company",
  "private-limited-guarant-nsc-limited-exemption": "company",
  "community-interest-company": "cic",
  "charitable-incorporated-organisation": "charity",
  "registered-society-non-jurisdictional": "registered-society",
  "industrial-and-provident-society": "registered-society",
  llp: "partnership",
  "limited-partnership": "partnership",
};

export async function lookupCompany(
  rawNumber: string,
): Promise<RegisterEnrichment> {
  const key = process.env.COMPANIES_HOUSE_API_KEY;
  if (!key) {
    return { notes: ["Set COMPANIES_HOUSE_API_KEY to enable company lookup."] };
  }
  const number = rawNumber.trim().toUpperCase();
  const res = await fetch(
    `https://api.company-information.service.gov.uk/company/${encodeURIComponent(number)}`,
    {
      headers: {
        Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}`,
      },
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (res.status === 404) {
    return { notes: [`No company found for ${number}.`] };
  }
  if (!res.ok) {
    return { notes: [`Companies House lookup failed (${res.status}).`] };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await res.json()) as any;
  const out: RegisterEnrichment = { company_number: number, notes: [] };
  out.name = data.company_name ?? undefined;
  if (typeof data.type === "string") {
    out.legal_form = COMPANY_TYPE_TO_LEGAL_FORM[data.type] ?? "company";
  }
  if (typeof data.date_of_creation === "string") {
    const y = Number(data.date_of_creation.slice(0, 4));
    if (Number.isFinite(y)) out.year_established = y;
  }
  out.notes.push(`Found ${out.name ?? number} on Companies House.`);
  return out;
}

export async function lookupCharity(
  rawNumber: string,
): Promise<RegisterEnrichment> {
  const key = process.env.CHARITY_COMMISSION_API_KEY;
  if (!key) {
    return {
      notes: ["Set CHARITY_COMMISSION_API_KEY to enable charity lookup."],
    };
  }
  const number = rawNumber.trim().replace(/[^0-9]/g, "");
  const res = await fetch(
    `https://api.charitycommission.gov.uk/register/api/allcharitydetails/${encodeURIComponent(number)}/0`,
    {
      headers: { "Ocp-Apim-Subscription-Key": key },
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (res.status === 404) {
    return { notes: [`No charity found for ${number}.`] };
  }
  if (!res.ok) {
    return { notes: [`Charity Commission lookup failed (${res.status}).`] };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await res.json()) as any;
  const out: RegisterEnrichment = {
    charity_number: number,
    is_registered_charity: true,
    legal_form: "charity",
    notes: [],
  };
  out.name = data.charity_name ?? data.charity_title ?? undefined;
  const reg = data.date_of_registration ?? data.registration_date;
  if (typeof reg === "string") {
    const y = Number(reg.slice(0, 4));
    if (Number.isFinite(y)) out.year_established = y;
  }
  out.notes.push(`Found ${out.name ?? number} on the Charity Register.`);
  return out;
}
