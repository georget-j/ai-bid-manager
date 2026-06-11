"use client";

// The structurally rich profile sections — repeating rows, checklists, the
// per-line insurance grid. Simple tag/text sections stay in page.tsx.

import { LEGAL_FORM_OPTIONS } from "@/lib/copy";
import { INSURANCE_LINES } from "@/lib/procurement/types";
import {
  ChipToggleGroup,
  Field,
  SectionCard,
  SelectField,
  TagInput,
  TextField,
  hintStyle,
  labelStyle,
} from "./fields";
import {
  COMPANY_SIZE_BANDS,
  DELIVERY_MODELS,
  INSURANCE_LINE_LABELS,
  STANDARD_POLICIES,
  splitTags,
  type ProfileForm,
  type SectionTick,
} from "./form-state";

interface SectionProps {
  form: ProfileForm;
  update: (patch: Partial<ProfileForm>) => void;
  tick?: SectionTick;
}

const twoCol: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 16,
  marginBottom: 20,
};

// ── Registered details ─────────────────────────────────────────────────────────

export function RegisteredDetailsSection({
  form,
  update,
  tick,
  enriching,
  enrichNote,
  onEnrich,
}: SectionProps & {
  enriching: boolean;
  enrichNote: string | null;
  onEnrich: () => void;
}) {
  return (
    <SectionCard
      title="Registered details"
      tick={tick}
      hint="The official details buyers check on every bid. Auto-fill pulls your address, SIC codes and legal form straight from the free Companies House / Charity Commission registers."
    >
      <div style={twoCol}>
        <TextField
          label="Company number"
          value={form.company_number}
          onChange={(v) => update({ company_number: v })}
          placeholder="e.g. 09876543"
        />
        <TextField
          label="VAT number"
          value={form.vat_number}
          onChange={(v) => update({ vat_number: v })}
          placeholder="e.g. GB123456789"
        />
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
          onClick={onEnrich}
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

      <div style={{ marginBottom: 20 }}>
        <label style={labelStyle}>Registered address</label>
        <div style={{ display: "grid", gap: 8 }}>
          <input
            className="input"
            value={form.address_line1}
            onChange={(e) => update({ address_line1: e.target.value })}
            placeholder="Address line 1"
            aria-label="Address line 1"
            style={{ width: "100%" }}
          />
          <input
            className="input"
            value={form.address_line2}
            onChange={(e) => update({ address_line2: e.target.value })}
            placeholder="Address line 2 (optional)"
            aria-label="Address line 2"
            style={{ width: "100%" }}
          />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr 1fr",
              gap: 8,
            }}
          >
            <input
              className="input"
              value={form.address_city}
              onChange={(e) => update({ address_city: e.target.value })}
              placeholder="Town or city"
              aria-label="Town or city"
            />
            <input
              className="input"
              value={form.address_postcode}
              onChange={(e) => update({ address_postcode: e.target.value })}
              placeholder="Postcode"
              aria-label="Postcode"
            />
            <input
              className="input"
              value={form.address_country}
              onChange={(e) => update({ address_country: e.target.value })}
              placeholder="Country"
              aria-label="Country"
            />
          </div>
        </div>
      </div>

      <div style={twoCol}>
        <TextField
          label="Incorporation date"
          type="date"
          value={form.incorporation_date}
          onChange={(v) => update({ incorporation_date: v })}
        />
        <SelectField
          label="Legal form"
          value={form.legal_form}
          onChange={(v) => update({ legal_form: v })}
          options={LEGAL_FORM_OPTIONS}
        />
      </div>

      <TextField
        label="Website"
        value={form.website}
        onChange={(v) => update({ website: v })}
        placeholder="e.g. https://www.acme-digital.co.uk"
        style={{ marginBottom: 20 }}
      />

      <TagInput
        label="SIC codes"
        hint={
          <>
            What Companies House says your business does.{" "}
            <a
              href="https://resources.companieshouse.gov.uk/sic/"
              target="_blank"
              rel="noreferrer"
              style={{ color: "var(--accent)" }}
            >
              Find yours on the gov.uk SIC code list
            </a>
            .
          </>
        }
        value={form.sic_codes}
        onChange={(v) => update({ sic_codes: v })}
        placeholder="e.g. 62020, 62090"
      />

      <TagInput
        label="Trading names"
        hint="Other names you trade under, if any."
        value={form.trading_names}
        onChange={(v) => update({ trading_names: v })}
        placeholder="e.g. Acme Digital, Acme Cyber"
      />
    </SectionCard>
  );
}

// ── Capacity and people ────────────────────────────────────────────────────────

export function CapacityPeopleSection({ form, update, tick }: SectionProps) {
  return (
    <SectionCard title="Capacity and people" tick={tick}>
      <div style={twoCol}>
        <SelectField
          label="Company size"
          value={form.company_size_band}
          onChange={(v) => update({ company_size_band: v })}
          options={COMPANY_SIZE_BANDS.map((b) => ({ value: b, label: b }))}
          placeholder="Select size…"
        />
        <TextField
          label="Year established"
          type="number"
          value={form.year_established}
          onChange={(v) => update({ year_established: v })}
          placeholder="e.g. 2014"
        />
      </div>

      <div style={twoCol}>
        <TextField
          label="Annual turnover (£)"
          hint="Used to flag opportunities where the contract value may exceed your financial-standing capacity."
          type="number"
          value={form.annual_turnover}
          onChange={(v) => update({ annual_turnover: v })}
          placeholder="e.g. 2400000"
        />
        <TextField
          label="Number of employees"
          type="number"
          value={form.employee_count}
          onChange={(v) => update({ employee_count: v })}
          placeholder="e.g. 24"
        />
      </div>

      <div style={{ marginBottom: 20 }}>
        <ChipToggleGroup
          label="Delivery models"
          options={DELIVERY_MODELS}
          selected={splitTags(form.delivery_models)}
          onToggle={(model) => {
            const current = splitTags(form.delivery_models);
            const next = current.includes(model)
              ? current.filter((m) => m !== model)
              : [...current, model];
            update({ delivery_models: next.join(", ") });
          }}
        />
      </div>

      <div>
        <label style={labelStyle}>Key people</label>
        <p style={hintStyle}>
          The people buyers ask about — directors, leads, named contacts. Rows
          need both a name and a role to be saved.
        </p>
        {form.key_people.map((person, i) => (
          <div
            key={i}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr auto",
              gap: 8,
              marginBottom: 8,
            }}
          >
            <input
              className="input"
              value={person.name}
              onChange={(e) =>
                update({
                  key_people: form.key_people.map((p, idx) =>
                    idx === i ? { ...p, name: e.target.value } : p,
                  ),
                })
              }
              placeholder="Name"
              aria-label={`Person ${i + 1} name`}
            />
            <input
              className="input"
              value={person.role}
              onChange={(e) =>
                update({
                  key_people: form.key_people.map((p, idx) =>
                    idx === i ? { ...p, role: e.target.value } : p,
                  ),
                })
              }
              placeholder="Role, e.g. Managing Director"
              aria-label={`Person ${i + 1} role`}
            />
            <button
              type="button"
              className="btn ghost sm"
              onClick={() =>
                update({
                  key_people: form.key_people.filter((_, idx) => idx !== i),
                })
              }
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn ghost sm"
          onClick={() =>
            update({
              key_people: [...form.key_people, { name: "", role: "", bio: "" }],
            })
          }
        >
          + Add a person
        </button>
      </div>
    </SectionCard>
  );
}

// ── Insurance ──────────────────────────────────────────────────────────────────

export function InsuranceSection({ form, update, tick }: SectionProps) {
  return (
    <SectionCard
      title="Insurance cover"
      tick={tick}
      hint="Buyers check the cover amount and that the policy is current — add the expiry date so we can warn you before it lapses."
    >
      {INSURANCE_LINES.map((line) => {
        const value = form.insurance[line];
        const setLine = (patch: Partial<typeof value>) =>
          update({
            insurance: { ...form.insurance, [line]: { ...value, ...patch } },
          });
        return (
          <div key={line} style={{ marginBottom: 16 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--ink)",
                marginBottom: 6,
              }}
            >
              {INSURANCE_LINE_LABELS[line]}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr 1fr",
                gap: 8,
              }}
            >
              <Field label="Cover (£)">
                <input
                  className="input"
                  type="number"
                  value={value.amount}
                  onChange={(e) => setLine({ amount: e.target.value })}
                  placeholder="e.g. 1000000"
                  aria-label={`${INSURANCE_LINE_LABELS[line]} cover amount`}
                  style={{ width: "100%" }}
                />
              </Field>
              <Field label="Insurer">
                <input
                  className="input"
                  value={value.insurer}
                  onChange={(e) => setLine({ insurer: e.target.value })}
                  placeholder="e.g. Hiscox"
                  aria-label={`${INSURANCE_LINE_LABELS[line]} insurer`}
                  style={{ width: "100%" }}
                />
              </Field>
              <Field label="Policy number">
                <input
                  className="input"
                  value={value.policy_number}
                  onChange={(e) => setLine({ policy_number: e.target.value })}
                  placeholder="e.g. PI-00123"
                  aria-label={`${INSURANCE_LINE_LABELS[line]} policy number`}
                  style={{ width: "100%" }}
                />
              </Field>
              <Field label="Expiry date">
                <input
                  className="input"
                  type="date"
                  value={value.expires_at}
                  onChange={(e) => setLine({ expires_at: e.target.value })}
                  aria-label={`${INSURANCE_LINE_LABELS[line]} expiry date`}
                  style={{ width: "100%" }}
                />
              </Field>
            </div>
          </div>
        );
      })}
    </SectionCard>
  );
}

// ── Policies and compliance ────────────────────────────────────────────────────

export function PoliciesSection({ form, update, tick }: SectionProps) {
  const byName = new Map(
    form.policies.map((p) => [p.name.trim().toLowerCase(), p]),
  );
  const standardKeys = new Set(STANDARD_POLICIES.map((n) => n.toLowerCase()));
  // Policies saved earlier (or suggested by AI) that aren't in the standard
  // checklist still render, so unticking — not silent data loss — removes them.
  const extras = form.policies.filter(
    (p) => !standardKeys.has(p.name.trim().toLowerCase()),
  );

  const togglePolicy = (name: string, on: boolean) => {
    if (on) {
      update({
        policies: [
          ...form.policies,
          { name, last_reviewed: "", document_id: "" },
        ],
      });
    } else {
      update({
        policies: form.policies.filter(
          (p) => p.name.trim().toLowerCase() !== name.trim().toLowerCase(),
        ),
      });
    }
  };

  const setReviewed = (name: string, date: string) =>
    update({
      policies: form.policies.map((p) =>
        p.name.trim().toLowerCase() === name.trim().toLowerCase()
          ? { ...p, last_reviewed: date }
          : p,
      ),
    });

  const policyRow = (name: string) => {
    const entry = byName.get(name.trim().toLowerCase());
    return (
      <div
        key={name}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "6px 0",
          borderBottom: "1px solid var(--border)",
          flexWrap: "wrap",
        }}
      >
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            color: "var(--ink)",
            cursor: "pointer",
            flex: "1 1 220px",
          }}
        >
          <input
            type="checkbox"
            checked={!!entry}
            onChange={(e) => togglePolicy(name, e.target.checked)}
          />
          {name} policy
        </label>
        {entry && (
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              color: "var(--muted)",
            }}
          >
            Last reviewed
            <input
              className="input"
              type="date"
              value={entry.last_reviewed}
              onChange={(e) => setReviewed(name, e.target.value)}
              aria-label={`${name} policy last reviewed`}
              style={{ padding: "4px 8px", fontSize: 12 }}
            />
          </span>
        )}
      </div>
    );
  };

  return (
    <SectionCard
      title="Policies and compliance"
      tick={tick}
      hint="Tick the written policies you keep up to date — tenders routinely ask for these, with the date each was last reviewed."
    >
      <div style={{ marginBottom: 16 }}>
        {STANDARD_POLICIES.map((name) => policyRow(name))}
        {extras.map((p) => policyRow(p.name))}
      </div>

      <SelectField
        label="Do you have a carbon reduction plan?"
        hint="Larger public-sector contracts ask for one — answering no is fine, it just tells us what to flag."
        value={form.carbon_reduction_plan}
        onChange={(v) => update({ carbon_reduction_plan: v })}
        options={[
          { value: "yes", label: "Yes" },
          { value: "no", label: "No" },
        ]}
        placeholder="Not answered yet"
      />
    </SectionCard>
  );
}

// ── Frameworks and memberships ─────────────────────────────────────────────────

export function FrameworksSection({ form, update, tick }: SectionProps) {
  return (
    <SectionCard
      title="Frameworks and memberships"
      tick={tick}
      hint="Framework places (like G-Cloud) and trade-body memberships strengthen your bids — and some routes to buyers only open through them."
    >
      <div style={{ marginBottom: 20 }}>
        <label style={labelStyle}>Framework places</label>
        <p style={hintStyle}>
          Each framework you hold a place on, with its reference and expiry if
          you have them.
        </p>
        {form.frameworks.map((framework, i) => (
          <div
            key={i}
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr 1fr auto",
              gap: 8,
              marginBottom: 8,
            }}
          >
            <input
              className="input"
              value={framework.name}
              onChange={(e) =>
                update({
                  frameworks: form.frameworks.map((f, idx) =>
                    idx === i ? { ...f, name: e.target.value } : f,
                  ),
                })
              }
              placeholder="Framework, e.g. G-Cloud 14"
              aria-label={`Framework ${i + 1} name`}
            />
            <input
              className="input"
              value={framework.reference}
              onChange={(e) =>
                update({
                  frameworks: form.frameworks.map((f, idx) =>
                    idx === i ? { ...f, reference: e.target.value } : f,
                  ),
                })
              }
              placeholder="Reference"
              aria-label={`Framework ${i + 1} reference`}
            />
            <input
              className="input"
              type="date"
              value={framework.expires_at}
              onChange={(e) =>
                update({
                  frameworks: form.frameworks.map((f, idx) =>
                    idx === i ? { ...f, expires_at: e.target.value } : f,
                  ),
                })
              }
              aria-label={`Framework ${i + 1} expiry date`}
            />
            <button
              type="button"
              className="btn ghost sm"
              onClick={() =>
                update({
                  frameworks: form.frameworks.filter((_, idx) => idx !== i),
                })
              }
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn ghost sm"
          onClick={() =>
            update({
              frameworks: [
                ...form.frameworks,
                { name: "", reference: "", expires_at: "" },
              ],
            })
          }
        >
          + Add a framework
        </button>
      </div>

      <TagInput
        label="Memberships"
        hint="Trade bodies and associations you belong to."
        value={form.memberships}
        onChange={(v) => update({ memberships: v })}
        placeholder="e.g. techUK, CREST, Chamber of Commerce"
      />
    </SectionCard>
  );
}
