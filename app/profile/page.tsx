"use client";

import { useState, useEffect, useCallback } from "react";
import { LEGAL_FORM_OPTIONS } from "@/lib/copy";

interface Profile {
  name: string;
  organisation_type: string;
  sectors: string;
  services: string;
  keywords: string;
  cpv_codes: string;
  regions: string;
  certifications: string;
  accreditations: string;
  min_contract_value: string;
  max_contract_value: string;
  company_size_band: string;
  annual_turnover: string;
  year_established: string;
  delivery_models: string;
  social_value: string;
  insurance_pi: string;
  insurance_pl: string;
  insurance_el: string;
  preferred_buyers: string;
  excluded_buyers: string;
  excluded_keywords: string;
  // Grant eligibility
  legal_form: string;
  charity_number: string;
  company_number: string;
  match_funding_capacity: string;
  beneficiaries: string;
  grant_themes: string;
}

const EMPTY: Profile = {
  name: "",
  organisation_type: "",
  sectors: "",
  services: "",
  keywords: "",
  cpv_codes: "",
  regions: "",
  certifications: "",
  accreditations: "",
  min_contract_value: "",
  max_contract_value: "",
  company_size_band: "",
  annual_turnover: "",
  year_established: "",
  delivery_models: "",
  social_value: "",
  insurance_pi: "",
  insurance_pl: "",
  insurance_el: "",
  preferred_buyers: "",
  excluded_buyers: "",
  excluded_keywords: "",
  legal_form: "",
  charity_number: "",
  company_number: "",
  match_funding_capacity: "",
  beneficiaries: "",
  grant_themes: "",
};

const COMPANY_SIZE_BANDS = [
  "Micro (0-9)",
  "Small (10-49)",
  "Medium (50-249)",
  "Large (250+)",
];

const DELIVERY_MODELS = ["On-site", "Remote", "Hybrid", "Nationwide"];

const UK_REGIONS = [
  "England",
  "North East England",
  "North West England",
  "Yorkshire and the Humber",
  "East Midlands",
  "West Midlands",
  "East of England",
  "London",
  "South East England",
  "South West England",
  "Scotland",
  "Wales",
  "Northern Ireland",
];

const ORG_TYPES = [
  "SME",
  "Large enterprise",
  "Consultancy",
  "Technology supplier",
  "Software vendor",
  "Construction firm",
  "Facilities management",
  "Care provider",
  "Training provider",
  "Marketing / creative agency",
  "Cybersecurity firm",
  "Professional services",
  "Nonprofit / social enterprise",
  "Other",
];

function TagInput({
  label,
  hint,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const tags = value
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  return (
    <div style={{ marginBottom: 20 }}>
      <label
        style={{
          display: "block",
          fontSize: 13,
          fontWeight: 500,
          marginBottom: 4,
          color: "var(--ink)",
        }}
      >
        {label}
      </label>
      {hint && (
        <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>
          {hint}
        </p>
      )}
      <input
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "Comma-separated values"}
        style={{ width: "100%" }}
      />
      {tags.length > 0 && (
        <div
          style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}
        >
          {tags.map((tag) => (
            <span
              key={tag}
              style={{
                fontSize: 12,
                padding: "2px 10px",
                borderRadius: 999,
                background: "var(--accent-tint)",
                color: "var(--accent)",
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function insurancePayload(form: Profile) {
  const pi = form.insurance_pi ? Number(form.insurance_pi) : null;
  const pl = form.insurance_pl ? Number(form.insurance_pl) : null;
  const el = form.insurance_el ? Number(form.insurance_el) : null;
  if (pi == null && pl == null && el == null) return null;
  return {
    professional_indemnity: pi,
    public_liability: pl,
    employers_liability: el,
  };
}

// Fields that feed opportunity-fit scoring — drives the completeness meter so the
// user knows which gaps most limit their recommendations.
function computeCompleteness(form: Profile): {
  pct: number;
  missing: string[];
} {
  const checks: { label: string; filled: boolean }[] = [
    { label: "CPV codes", filled: !!form.cpv_codes.trim() },
    { label: "Services", filled: !!form.services.trim() },
    { label: "Keywords", filled: !!form.keywords.trim() },
    { label: "Sectors", filled: !!form.sectors.trim() },
    { label: "Target regions", filled: !!form.regions.trim() },
    { label: "Certifications", filled: !!form.certifications.trim() },
    { label: "Accreditations", filled: !!form.accreditations.trim() },
    {
      label: "Contract value range",
      filled: !!(form.min_contract_value || form.max_contract_value),
    },
    { label: "Company size", filled: !!form.company_size_band },
    { label: "Annual turnover", filled: !!form.annual_turnover },
    { label: "Delivery models", filled: !!form.delivery_models.trim() },
    {
      label: "Insurance cover",
      filled: !!(form.insurance_pi || form.insurance_pl || form.insurance_el),
    },
    // Grant-eligibility fields — needed for grant matching, not just tenders.
    { label: "Legal form", filled: !!form.legal_form },
    { label: "Grant themes", filled: !!form.grant_themes.trim() },
  ];
  const filled = checks.filter((c) => c.filled).length;
  const pct = Math.round((filled / checks.length) * 100);
  const missing = checks.filter((c) => !c.filled).map((c) => c.label);
  return { pct, missing };
}

export default function ProfilePage() {
  const [form, setForm] = useState<Profile>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((data: { profile: Record<string, unknown> | null }) => {
        if (data.profile) {
          const p = data.profile;
          const arr = (v: unknown) =>
            Array.isArray(v) ? (v as string[]).join(", ") : "";
          const ins = (p.insurance ?? {}) as Record<string, unknown>;
          const num = (v: unknown) => (v != null ? String(v) : "");
          setForm({
            name: String(p.name ?? ""),
            organisation_type: String(p.organisation_type ?? ""),
            sectors: arr(p.sectors),
            services: arr(p.services),
            keywords: arr(p.keywords),
            cpv_codes: arr(p.cpv_codes),
            regions: arr(p.regions),
            certifications: arr(p.certifications),
            accreditations: arr(p.accreditations),
            min_contract_value: num(p.min_contract_value),
            max_contract_value: num(p.max_contract_value),
            company_size_band: String(p.company_size_band ?? ""),
            annual_turnover: num(p.annual_turnover),
            year_established: num(p.year_established),
            delivery_models: arr(p.delivery_models),
            social_value: arr(p.social_value),
            insurance_pi: num(ins.professional_indemnity),
            insurance_pl: num(ins.public_liability),
            insurance_el: num(ins.employers_liability),
            preferred_buyers: arr(p.preferred_buyers),
            excluded_buyers: arr(p.excluded_buyers),
            excluded_keywords: arr(p.excluded_keywords),
            legal_form: String(p.legal_form ?? ""),
            charity_number: String(p.charity_number ?? ""),
            company_number: String(p.company_number ?? ""),
            match_funding_capacity: num(p.match_funding_capacity),
            beneficiaries: arr(p.beneficiaries),
            grant_themes: arr(p.grant_themes),
          });
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const set = useCallback(
    (key: keyof Profile) => (v: string) => {
      setForm((f) => ({ ...f, [key]: v }));
      setSaved(false);
    },
    [],
  );

  function splitTags(v: string): string[] {
    return v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const [enriching, setEnriching] = useState(false);
  const [enrichNote, setEnrichNote] = useState<string | null>(null);

  async function enrichFromRegisters() {
    if (!form.company_number && !form.charity_number) {
      setEnrichNote("Enter a company or charity number first.");
      return;
    }
    setEnriching(true);
    setEnrichNote(null);
    try {
      const res = await fetch("/api/profile/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyNumber: form.company_number || undefined,
          charityNumber: form.charity_number || undefined,
        }),
      });
      const body = (await res.json()) as {
        enrichment?: {
          legal_form?: string;
          year_established?: number;
          charity_number?: string;
          company_number?: string;
          notes?: string[];
        };
        error?: string;
      };
      const e = body.enrichment;
      if (!res.ok || !e) {
        setEnrichNote(body.error ?? "Lookup failed.");
      } else {
        setForm((f) => ({
          ...f,
          legal_form: e.legal_form ?? f.legal_form,
          year_established: e.year_established
            ? String(e.year_established)
            : f.year_established,
          charity_number: e.charity_number ?? f.charity_number,
          company_number: e.company_number ?? f.company_number,
        }));
        setEnrichNote((e.notes ?? []).join(" ") || "Updated from registers.");
        setSaved(false);
      }
    } catch {
      setEnrichNote("Network error.");
    } finally {
      setEnriching(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Organisation name is required.");
      return;
    }
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          organisation_type: form.organisation_type || undefined,
          sectors: splitTags(form.sectors),
          services: splitTags(form.services),
          keywords: splitTags(form.keywords),
          cpv_codes: splitTags(form.cpv_codes),
          regions: splitTags(form.regions),
          certifications: splitTags(form.certifications),
          accreditations: splitTags(form.accreditations),
          min_contract_value: form.min_contract_value
            ? Number(form.min_contract_value)
            : null,
          max_contract_value: form.max_contract_value
            ? Number(form.max_contract_value)
            : null,
          company_size_band: form.company_size_band || null,
          annual_turnover: form.annual_turnover
            ? Number(form.annual_turnover)
            : null,
          year_established: form.year_established
            ? Number(form.year_established)
            : null,
          delivery_models: splitTags(form.delivery_models),
          social_value: splitTags(form.social_value),
          insurance: insurancePayload(form),
          preferred_buyers: splitTags(form.preferred_buyers),
          excluded_buyers: splitTags(form.excluded_buyers),
          excluded_keywords: splitTags(form.excluded_keywords),
          legal_form: form.legal_form || null,
          is_registered_charity: form.legal_form
            ? form.legal_form === "charity" || !!form.charity_number
            : null,
          charity_number: form.charity_number || null,
          company_number: form.company_number || null,
          match_funding_capacity: form.match_funding_capacity
            ? Number(form.match_funding_capacity)
            : null,
          beneficiaries: splitTags(form.beneficiaries),
          grant_themes: splitTags(form.grant_themes),
        }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Failed to save profile.");
      } else {
        setSaved(true);
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div style={{ maxWidth: 760, paddingTop: 48, textAlign: "center" }}>
        <p style={{ color: "var(--muted)", fontSize: 14 }}>Loading profile…</p>
      </div>
    );
  }

  const completeness = computeCompleteness(form);

  return (
    <div style={{ maxWidth: 760 }}>
      <div
        className="page-head"
        style={{ flexDirection: "column", alignItems: "flex-start", gap: 8 }}
      >
        <div className="eyebrow">Intelligence</div>
        <h1>
          Organisation <em>profile</em>
        </h1>
        <p className="subtitle">
          Your profile powers opportunity matching, bid/no-bid scoring, and
          evidence gap analysis. Complete as much as possible for best results.
        </p>
      </div>

      {/* Completeness meter — which fit-scoring fields are still empty */}
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 8,
          }}
        >
          <div className="eyebrow" style={{ margin: 0 }}>
            Profile strength
          </div>
          <span
            style={{
              fontSize: 18,
              fontWeight: 700,
              color:
                completeness.pct >= 80
                  ? "#059669"
                  : completeness.pct >= 50
                    ? "#d97706"
                    : "#dc2626",
            }}
          >
            {completeness.pct}%
          </span>
        </div>
        <div
          style={{
            height: 7,
            borderRadius: 999,
            background: "var(--surface-2)",
            overflow: "hidden",
            marginBottom: completeness.missing.length ? 10 : 0,
          }}
        >
          <div
            style={{
              width: `${completeness.pct}%`,
              height: "100%",
              borderRadius: 999,
              background:
                completeness.pct >= 80
                  ? "#059669"
                  : completeness.pct >= 50
                    ? "#d97706"
                    : "#dc2626",
              transition: "width 0.3s ease",
            }}
          />
        </div>
        {completeness.missing.length > 0 && (
          <p style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>
            Add to improve recommendations:{" "}
            <span style={{ color: "var(--ink-2)" }}>
              {completeness.missing.join(" · ")}
            </span>
          </p>
        )}
      </div>

      <form onSubmit={handleSave}>
        {/* Basics */}
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 16 }}>
            Company basics
          </div>

          <div style={{ marginBottom: 20 }}>
            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 500,
                marginBottom: 4,
                color: "var(--ink)",
              }}
            >
              Organisation name *
            </label>
            <input
              className="input"
              value={form.name}
              onChange={(e) => set("name")(e.target.value)}
              placeholder="e.g. Acme Digital Ltd"
              style={{ width: "100%" }}
              required
            />
          </div>

          <div style={{ marginBottom: 4 }}>
            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 500,
                marginBottom: 4,
                color: "var(--ink)",
              }}
            >
              Organisation type
            </label>
            <select
              className="input"
              value={form.organisation_type}
              onChange={(e) => set("organisation_type")(e.target.value)}
              style={{ width: "100%" }}
            >
              <option value="">Select type…</option>
              {ORG_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Services */}
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 16 }}>
            Services and discovery
          </div>

          <TagInput
            label="Sectors"
            hint="Industries you serve. Matched against opportunity titles and descriptions."
            value={form.sectors}
            onChange={set("sectors")}
            placeholder="e.g. Healthcare, Local government, Education, Defence"
          />

          <TagInput
            label="Services"
            hint="What your organisation delivers. Used for keyword matching."
            value={form.services}
            onChange={set("services")}
            placeholder="e.g. Cyber security, SOC monitoring, penetration testing"
          />

          <TagInput
            label="Keywords"
            hint="Additional search terms to match opportunity titles and descriptions."
            value={form.keywords}
            onChange={set("keywords")}
            placeholder="e.g. digital transformation, managed service, NHS"
          />

          <TagInput
            label="CPV codes"
            hint="Common Procurement Vocabulary codes. 8-digit codes, comma-separated."
            value={form.cpv_codes}
            onChange={set("cpv_codes")}
            placeholder="e.g. 72000000, 72212180, 79711000"
          />
        </div>

        {/* Geography and value */}
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 16 }}>
            Geography and contract value
          </div>

          <div style={{ marginBottom: 20 }}>
            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 500,
                marginBottom: 6,
                color: "var(--ink)",
              }}
            >
              Target regions
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {UK_REGIONS.map((region) => {
                const selected = splitTags(form.regions).includes(region);
                return (
                  <button
                    key={region}
                    type="button"
                    onClick={() => {
                      const current = splitTags(form.regions);
                      const next = selected
                        ? current.filter((r) => r !== region)
                        : [...current, region];
                      set("regions")(next.join(", "));
                    }}
                    style={{
                      fontSize: 12,
                      padding: "4px 12px",
                      borderRadius: 999,
                      border: `1px solid ${selected ? "var(--accent)" : "var(--border)"}`,
                      background: selected
                        ? "var(--accent-tint)"
                        : "transparent",
                      color: selected ? "var(--accent)" : "var(--ink-2)",
                      cursor: "pointer",
                    }}
                  >
                    {region}
                  </button>
                );
              })}
            </div>
          </div>

          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}
          >
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 13,
                  fontWeight: 500,
                  marginBottom: 4,
                  color: "var(--ink)",
                }}
              >
                Min contract value (£)
              </label>
              <input
                className="input"
                type="number"
                value={form.min_contract_value}
                onChange={(e) => set("min_contract_value")(e.target.value)}
                placeholder="e.g. 50000"
                style={{ width: "100%" }}
              />
            </div>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 13,
                  fontWeight: 500,
                  marginBottom: 4,
                  color: "var(--ink)",
                }}
              >
                Max contract value (£)
              </label>
              <input
                className="input"
                type="number"
                value={form.max_contract_value}
                onChange={(e) => set("max_contract_value")(e.target.value)}
                placeholder="e.g. 5000000"
                style={{ width: "100%" }}
              />
            </div>
          </div>
        </div>

        {/* Capacity and delivery */}
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 16 }}>
            Capacity and delivery
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
              marginBottom: 20,
            }}
          >
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 13,
                  fontWeight: 500,
                  marginBottom: 4,
                  color: "var(--ink)",
                }}
              >
                Company size
              </label>
              <select
                className="input"
                value={form.company_size_band}
                onChange={(e) => set("company_size_band")(e.target.value)}
                style={{ width: "100%" }}
              >
                <option value="">Select size…</option>
                {COMPANY_SIZE_BANDS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 13,
                  fontWeight: 500,
                  marginBottom: 4,
                  color: "var(--ink)",
                }}
              >
                Year established
              </label>
              <input
                className="input"
                type="number"
                value={form.year_established}
                onChange={(e) => set("year_established")(e.target.value)}
                placeholder="e.g. 2014"
                style={{ width: "100%" }}
              />
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 500,
                marginBottom: 4,
                color: "var(--ink)",
              }}
            >
              Annual turnover (£)
            </label>
            <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>
              Used to flag opportunities where the contract value may exceed
              your financial-standing capacity.
            </p>
            <input
              className="input"
              type="number"
              value={form.annual_turnover}
              onChange={(e) => set("annual_turnover")(e.target.value)}
              placeholder="e.g. 2400000"
              style={{ width: "100%" }}
            />
          </div>

          <div>
            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 500,
                marginBottom: 6,
                color: "var(--ink)",
              }}
            >
              Delivery models
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {DELIVERY_MODELS.map((model) => {
                const selected = splitTags(form.delivery_models).includes(
                  model,
                );
                return (
                  <button
                    key={model}
                    type="button"
                    onClick={() => {
                      const current = splitTags(form.delivery_models);
                      const next = selected
                        ? current.filter((m) => m !== model)
                        : [...current, model];
                      set("delivery_models")(next.join(", "));
                    }}
                    style={{
                      fontSize: 12,
                      padding: "4px 12px",
                      borderRadius: 999,
                      border: `1px solid ${selected ? "var(--accent)" : "var(--border)"}`,
                      background: selected
                        ? "var(--accent-tint)"
                        : "transparent",
                      color: selected ? "var(--accent)" : "var(--ink-2)",
                      cursor: "pointer",
                    }}
                  >
                    {model}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Insurance */}
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 4 }}>
            Insurance cover
          </div>
          <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 16 }}>
            Cover levels (£). Surfaced when a tender references insurance
            requirements.
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 16,
            }}
          >
            {(
              [
                ["insurance_pi", "Professional indemnity"],
                ["insurance_pl", "Public liability"],
                ["insurance_el", "Employers' liability"],
              ] as [keyof Profile, string][]
            ).map(([key, label]) => (
              <div key={key}>
                <label
                  style={{
                    display: "block",
                    fontSize: 13,
                    fontWeight: 500,
                    marginBottom: 4,
                    color: "var(--ink)",
                  }}
                >
                  {label}
                </label>
                <input
                  className="input"
                  type="number"
                  value={form[key]}
                  onChange={(e) => set(key)(e.target.value)}
                  placeholder="e.g. 1000000"
                  style={{ width: "100%" }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Credentials */}
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 16 }}>
            Certifications and accreditations
          </div>

          <TagInput
            label="Certifications"
            hint="e.g. ISO 27001, Cyber Essentials Plus, ISO 9001"
            value={form.certifications}
            onChange={set("certifications")}
            placeholder="e.g. ISO 27001, Cyber Essentials Plus"
          />

          <TagInput
            label="Accreditations"
            hint="e.g. G-Cloud 14, DOS6, NHS DSPT, Crown Commercial Service"
            value={form.accreditations}
            onChange={set("accreditations")}
            placeholder="e.g. G-Cloud 14, NHS DSPT"
          />

          <TagInput
            label="Social value"
            hint="Commitments that strengthen social-value scoring in UK tenders."
            value={form.social_value}
            onChange={set("social_value")}
            placeholder="e.g. Net Zero by 2030, local employment, SME supply chain"
          />
        </div>

        {/* Grant eligibility */}
        <div
          id="grant-eligibility"
          className="card card-pad"
          style={{ marginBottom: 16, scrollMarginTop: 16 }}
        >
          <div className="eyebrow" style={{ marginBottom: 4 }}>
            Grant eligibility
          </div>
          <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 16 }}>
            We use this to check which grants you can apply for and how well
            each one matches you. Auto-fill your legal form &amp; registration
            from the free Companies House / Charity Commission registers.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
              marginBottom: 16,
            }}
          >
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 13,
                  fontWeight: 500,
                  marginBottom: 4,
                  color: "var(--ink)",
                }}
              >
                Company number
              </label>
              <input
                className="input"
                value={form.company_number}
                onChange={(e) => set("company_number")(e.target.value)}
                placeholder="e.g. 09876543"
                style={{ width: "100%" }}
              />
            </div>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 13,
                  fontWeight: 500,
                  marginBottom: 4,
                  color: "var(--ink)",
                }}
              >
                Charity number
              </label>
              <input
                className="input"
                value={form.charity_number}
                onChange={(e) => set("charity_number")(e.target.value)}
                placeholder="e.g. 1234567"
                style={{ width: "100%" }}
              />
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 20,
            }}
          >
            <button
              type="button"
              className="btn ghost sm"
              onClick={enrichFromRegisters}
              disabled={enriching}
              style={{ fontSize: 12 }}
            >
              {enriching ? "Looking up…" : "Auto-fill from registers"}
            </button>
            {enrichNote && (
              <span style={{ fontSize: 12, color: "var(--muted)" }}>
                {enrichNote}
              </span>
            )}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
              marginBottom: 20,
            }}
          >
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 13,
                  fontWeight: 500,
                  marginBottom: 4,
                  color: "var(--ink)",
                }}
              >
                Legal form
              </label>
              <select
                className="input"
                value={form.legal_form}
                onChange={(e) => set("legal_form")(e.target.value)}
                style={{ width: "100%" }}
              >
                <option value="">Select…</option>
                {LEGAL_FORM_OPTIONS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 13,
                  fontWeight: 500,
                  marginBottom: 4,
                  color: "var(--ink)",
                }}
              >
                Match-funding capacity (£)
              </label>
              <input
                className="input"
                type="number"
                value={form.match_funding_capacity}
                onChange={(e) => set("match_funding_capacity")(e.target.value)}
                placeholder="e.g. 25000"
                style={{ width: "100%" }}
              />
            </div>
          </div>

          <TagInput
            label="Grant themes"
            hint="Funding themes you target. Matched against grant calls."
            value={form.grant_themes}
            onChange={set("grant_themes")}
            placeholder="e.g. green energy, digital inclusion, youth skills"
          />

          <TagInput
            label="Beneficiaries"
            hint="Who your work benefits — many grants score on this."
            value={form.beneficiaries}
            onChange={set("beneficiaries")}
            placeholder="e.g. young people, rural communities, SMEs"
          />
        </div>

        {/* Buyer preferences */}
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 16 }}>
            Buyer preferences and exclusions
          </div>

          <TagInput
            label="Preferred buyers"
            hint="Boost fit score when these buyers publish opportunities."
            value={form.preferred_buyers}
            onChange={set("preferred_buyers")}
            placeholder="e.g. NHS, Ministry of Defence, HMRC"
          />

          <TagInput
            label="Excluded buyers"
            hint="Opportunities from these buyers will score very low."
            value={form.excluded_buyers}
            onChange={set("excluded_buyers")}
            placeholder="e.g. Specific council, competitor authority"
          />

          <TagInput
            label="Excluded keywords"
            hint="Opportunities containing these keywords will score very low."
            value={form.excluded_keywords}
            onChange={set("excluded_keywords")}
            placeholder="e.g. construction, cleaning, catering"
          />
        </div>

        {/* Save */}
        {error && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: "var(--r-sm)",
              background: "#fee2e2",
              color: "#dc2626",
              fontSize: 13,
              marginBottom: 12,
            }}
          >
            {error}
          </div>
        )}

        {saved && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: "var(--r-sm)",
              background: "#d1fae5",
              color: "#059669",
              fontSize: 13,
              marginBottom: 12,
            }}
          >
            Profile saved successfully.
          </div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? "Saving…" : "Save profile"}
          </button>
        </div>
      </form>
    </div>
  );
}
