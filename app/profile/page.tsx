"use client";

// The organisation profile — one page holding everything we know about the
// business: what it does, its registered details, money, insurance,
// credentials, people, policies and preferences. Every field feeds matching,
// bid/no-bid scoring or compliance checks somewhere in the app.
//
// Completeness comes from lib/setup-flow.ts (the same numbers as the home
// checklist); all form/state conversions live in ./form-state.ts.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ProfileAiFill } from "@/components/ProfileAiFill";
import {
  computeProfileSections,
  profileCompletenessPct,
} from "@/lib/setup-flow";
import {
  ChipToggleGroup,
  SectionCard,
  SelectField,
  TagInput,
  TextField,
} from "./fields";
import {
  CapacityPeopleSection,
  FrameworksSection,
  InsuranceSection,
  PoliciesSection,
  RegisteredDetailsSection,
} from "./sections";
import {
  applyAiFields,
  applyRegisterEnrichment,
  computeSectionTicks,
  emptyForm,
  formToCompleteness,
  formToPayload,
  rowToForm,
  splitTags,
  ORG_TYPES,
  UK_REGIONS,
  type ProfileForm,
} from "./form-state";

export default function ProfilePage() {
  const [form, setForm] = useState<ProfileForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [enrichNote, setEnrichNote] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((data: { profile: Record<string, unknown> | null }) => {
        if (data.profile) setForm(rowToForm(data.profile));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  /** Merge a partial change into the form and mark it unsaved. */
  const update = useCallback((patch: Partial<ProfileForm>) => {
    setForm((f) => ({ ...f, ...patch }));
    setSaved(false);
  }, []);

  /** AI proposals are draft-only: they merge into the form here and the user
   * still presses Save profile — ProfileAiFill never writes to the server. */
  const handleAiApply = useCallback((fields: Record<string, unknown>) => {
    setForm((f) => applyAiFields(f, fields));
    setSaved(false);
  }, []);

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
        enrichment?: Parameters<typeof applyRegisterEnrichment>[1];
        error?: string;
      };
      const enrichment = body.enrichment;
      if (!res.ok || !enrichment) {
        setEnrichNote(body.error ?? "Lookup failed.");
      } else {
        setForm((f) => applyRegisterEnrichment(f, enrichment));
        setEnrichNote(
          (enrichment.notes ?? []).join(" ") || "Updated from registers.",
        );
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
        body: JSON.stringify(formToPayload(form)),
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

  // One source of truth for "how complete": the unified lib/setup-flow.ts
  // scoring, computed from exactly what the Save button would store.
  const completenessFields = formToCompleteness(form);
  const pct = profileCompletenessPct(completenessFields);
  const missing = computeProfileSections(completenessFields).flatMap(
    (s) => s.missing,
  );
  const ticks = computeSectionTicks(completenessFields);
  const meterColor = pct >= 80 ? "#059669" : pct >= 50 ? "#d97706" : "#dc2626";

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
          <span style={{ fontSize: 18, fontWeight: 700, color: meterColor }}>
            {pct}%
          </span>
        </div>
        <div
          style={{
            height: 7,
            borderRadius: 999,
            background: "var(--surface-2)",
            overflow: "hidden",
            marginBottom: missing.length ? 10 : 0,
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: "100%",
              borderRadius: 999,
              background: meterColor,
              transition: "width 0.3s ease",
            }}
          />
        </div>
        {missing.length > 0 && (
          <p style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>
            Add to improve recommendations:{" "}
            <span style={{ color: "var(--ink-2)" }}>{missing.join(" · ")}</span>
          </p>
        )}
      </div>

      {/* Draft-only AI fill: applies into the form below; Save still decides. */}
      <ProfileAiFill
        profile={form as unknown as Record<string, unknown>}
        onApply={handleAiApply}
      />

      <form onSubmit={handleSave}>
        {/* 1 — Company basics */}
        <SectionCard title="Company basics" tick={ticks.basics}>
          <TextField
            label="Organisation name *"
            value={form.name}
            onChange={(v) => update({ name: v })}
            placeholder="e.g. Acme Digital Ltd"
            required
            style={{ marginBottom: 20 }}
          />
          <SelectField
            label="Organisation type"
            value={form.organisation_type}
            onChange={(v) => update({ organisation_type: v })}
            options={ORG_TYPES.map((t) => ({ value: t, label: t }))}
            placeholder="Select type…"
            style={{ marginBottom: 4 }}
          />
        </SectionCard>

        {/* 2 — Registered details */}
        <RegisteredDetailsSection
          form={form}
          update={update}
          tick={ticks.registered}
          enriching={enriching}
          enrichNote={enrichNote}
          onEnrich={enrichFromRegisters}
        />

        {/* 3 — Services and discovery */}
        <SectionCard title="Services and discovery" tick={ticks.services}>
          <TagInput
            label="Sectors"
            hint="Industries you serve. Matched against opportunity titles and descriptions."
            value={form.sectors}
            onChange={(v) => update({ sectors: v })}
            placeholder="e.g. Healthcare, Local government, Education, Defence"
          />
          <TagInput
            label="Services"
            hint="What your organisation delivers. Used for keyword matching."
            value={form.services}
            onChange={(v) => update({ services: v })}
            placeholder="e.g. Cyber security, SOC monitoring, penetration testing"
          />
          <TagInput
            label="Keywords"
            hint="Additional search terms to match opportunity titles and descriptions."
            value={form.keywords}
            onChange={(v) => update({ keywords: v })}
            placeholder="e.g. digital transformation, managed service, NHS"
          />
          <TagInput
            label="CPV codes"
            hint="Common Procurement Vocabulary codes. 8-digit codes, comma-separated."
            value={form.cpv_codes}
            onChange={(v) => update({ cpv_codes: v })}
            placeholder="e.g. 72000000, 72212180, 79711000"
          />
        </SectionCard>

        {/* 4 — Geography and contract value */}
        <SectionCard
          title="Geography and contract value"
          tick={ticks.geography}
        >
          <div style={{ marginBottom: 20 }}>
            <ChipToggleGroup
              label="Target regions"
              options={UK_REGIONS}
              selected={splitTags(form.regions)}
              onToggle={(region) => {
                const current = splitTags(form.regions);
                const next = current.includes(region)
                  ? current.filter((r) => r !== region)
                  : [...current, region];
                update({ regions: next.join(", ") });
              }}
            />
          </div>
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}
          >
            <TextField
              label="Min contract value (£)"
              type="number"
              value={form.min_contract_value}
              onChange={(v) => update({ min_contract_value: v })}
              placeholder="e.g. 50000"
            />
            <TextField
              label="Max contract value (£)"
              type="number"
              value={form.max_contract_value}
              onChange={(v) => update({ max_contract_value: v })}
              placeholder="e.g. 5000000"
            />
          </div>
        </SectionCard>

        {/* 5 — Capacity and people */}
        <CapacityPeopleSection
          form={form}
          update={update}
          tick={ticks.capacity}
        />

        {/* 6 — Insurance */}
        <InsuranceSection form={form} update={update} tick={ticks.insurance} />

        {/* 7 — Certifications and accreditations */}
        <SectionCard
          title="Certifications and accreditations"
          tick={ticks.credentials}
          hint={
            <>
              Add the names here for matching.{" "}
              <Link href="/documents" style={{ color: "var(--accent)" }}>
                Track expiry dates and certificates in your Evidence library →
              </Link>
            </>
          }
        >
          <TagInput
            label="Certifications"
            hint="e.g. ISO 27001, Cyber Essentials Plus, ISO 9001"
            value={form.certifications}
            onChange={(v) => update({ certifications: v })}
            placeholder="e.g. ISO 27001, Cyber Essentials Plus"
          />
          <TagInput
            label="Accreditations"
            hint="e.g. G-Cloud 14, DOS6, NHS DSPT, Crown Commercial Service"
            value={form.accreditations}
            onChange={(v) => update({ accreditations: v })}
            placeholder="e.g. G-Cloud 14, NHS DSPT"
          />
          <TagInput
            label="Social value"
            hint="Commitments that strengthen social-value scoring in UK tenders."
            value={form.social_value}
            onChange={(v) => update({ social_value: v })}
            placeholder="e.g. Net Zero by 2030, local employment, SME supply chain"
          />
        </SectionCard>

        {/* 8 — Policies and compliance */}
        <PoliciesSection form={form} update={update} tick={ticks.policies} />

        {/* 9 — Frameworks and memberships */}
        <FrameworksSection
          form={form}
          update={update}
          tick={ticks.frameworks}
        />

        {/* 10 — Grant eligibility */}
        <SectionCard
          title="Grant eligibility"
          tick={ticks.grants}
          anchorId="grant-eligibility"
          hint="We use this to check which grants you can apply for and how well each one matches you. Your legal form and company number live under Registered details above."
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
              marginBottom: 20,
            }}
          >
            <TextField
              label="Charity number"
              value={form.charity_number}
              onChange={(v) => update({ charity_number: v })}
              placeholder="e.g. 1234567"
            />
            <TextField
              label="Match-funding capacity (£)"
              type="number"
              value={form.match_funding_capacity}
              onChange={(v) => update({ match_funding_capacity: v })}
              placeholder="e.g. 25000"
            />
          </div>
          <TagInput
            label="Grant themes"
            hint="Funding themes you target. Matched against grant calls."
            value={form.grant_themes}
            onChange={(v) => update({ grant_themes: v })}
            placeholder="e.g. green energy, digital inclusion, youth skills"
          />
          <TagInput
            label="Beneficiaries"
            hint="Who your work benefits — many grants score on this."
            value={form.beneficiaries}
            onChange={(v) => update({ beneficiaries: v })}
            placeholder="e.g. young people, rural communities, SMEs"
          />
        </SectionCard>

        {/* 11 — Buyer preferences */}
        <SectionCard
          title="Buyer preferences and exclusions"
          tick={ticks.buyers}
        >
          <TagInput
            label="Preferred buyers"
            hint="Boost fit score when these buyers publish opportunities."
            value={form.preferred_buyers}
            onChange={(v) => update({ preferred_buyers: v })}
            placeholder="e.g. NHS, Ministry of Defence, HMRC"
          />
          <TagInput
            label="Excluded buyers"
            hint="Opportunities from these buyers will score very low."
            value={form.excluded_buyers}
            onChange={(v) => update({ excluded_buyers: v })}
            placeholder="e.g. Specific council, competitor authority"
          />
          <TagInput
            label="Excluded keywords"
            hint="Opportunities containing these keywords will score very low."
            value={form.excluded_keywords}
            onChange={(v) => update({ excluded_keywords: v })}
            placeholder="e.g. construction, cleaning, catering"
          />
        </SectionCard>

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
