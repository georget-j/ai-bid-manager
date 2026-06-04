"use client";

import { useState, useEffect, useCallback } from "react";

interface Profile {
  name: string;
  organisation_type: string;
  services: string;
  keywords: string;
  cpv_codes: string;
  regions: string;
  certifications: string;
  accreditations: string;
  min_contract_value: string;
  max_contract_value: string;
  preferred_buyers: string;
  excluded_buyers: string;
  excluded_keywords: string;
}

const EMPTY: Profile = {
  name: "",
  organisation_type: "",
  services: "",
  keywords: "",
  cpv_codes: "",
  regions: "",
  certifications: "",
  accreditations: "",
  min_contract_value: "",
  max_contract_value: "",
  preferred_buyers: "",
  excluded_buyers: "",
  excluded_keywords: "",
};

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
          setForm({
            name: String(p.name ?? ""),
            organisation_type: String(p.organisation_type ?? ""),
            services: arr(p.services),
            keywords: arr(p.keywords),
            cpv_codes: arr(p.cpv_codes),
            regions: arr(p.regions),
            certifications: arr(p.certifications),
            accreditations: arr(p.accreditations),
            min_contract_value:
              p.min_contract_value != null ? String(p.min_contract_value) : "",
            max_contract_value:
              p.max_contract_value != null ? String(p.max_contract_value) : "",
            preferred_buyers: arr(p.preferred_buyers),
            excluded_buyers: arr(p.excluded_buyers),
            excluded_keywords: arr(p.excluded_keywords),
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
          preferred_buyers: splitTags(form.preferred_buyers),
          excluded_buyers: splitTags(form.excluded_buyers),
          excluded_keywords: splitTags(form.excluded_keywords),
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
