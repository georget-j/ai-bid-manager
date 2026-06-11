"use client";

// Shared form primitives for the organisation profile page. Pure presentation —
// all state lives in page.tsx; all conversion logic lives in form-state.ts.

import type { ReactNode } from "react";
import type { SectionTick } from "./form-state";

export const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 500,
  marginBottom: 4,
  color: "var(--ink)",
};

export const hintStyle: React.CSSProperties = {
  fontSize: 12,
  color: "var(--muted)",
  marginBottom: 6,
};

export function Field({
  label,
  hint,
  children,
  style,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div style={style}>
      <label style={labelStyle}>{label}</label>
      {hint != null && <p style={hintStyle}>{hint}</p>}
      {children}
    </div>
  );
}

export function TextField({
  label,
  hint,
  value,
  onChange,
  placeholder,
  type = "text",
  required,
  style,
}: {
  label: string;
  hint?: ReactNode;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: "text" | "number" | "date";
  required?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <Field label={label} hint={hint} style={style}>
      <input
        className="input"
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ width: "100%" }}
        required={required}
      />
    </Field>
  );
}

export function SelectField({
  label,
  hint,
  value,
  onChange,
  options,
  placeholder = "Select…",
  style,
}: {
  label: string;
  hint?: ReactNode;
  value: string;
  onChange: (v: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
  placeholder?: string;
  style?: React.CSSProperties;
}) {
  return (
    <Field label={label} hint={hint} style={style}>
      <select
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: "100%" }}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function TagInput({
  label,
  hint,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  hint?: ReactNode;
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
      <label style={labelStyle}>{label}</label>
      {hint != null && <p style={hintStyle}>{hint}</p>}
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

/** Toggleable chip row — regions, delivery models. */
export function ChipToggleGroup({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (option: string) => void;
}) {
  return (
    <div>
      <label style={{ ...labelStyle, marginBottom: 6 }}>{label}</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {options.map((option) => {
          const isSelected = selected.includes(option);
          return (
            <button
              key={option}
              type="button"
              onClick={() => onToggle(option)}
              style={{
                fontSize: 12,
                padding: "4px 12px",
                borderRadius: 999,
                border: `1px solid ${isSelected ? "var(--accent)" : "var(--border)"}`,
                background: isSelected ? "var(--accent-tint)" : "transparent",
                color: isSelected ? "var(--accent)" : "var(--ink-2)",
                cursor: "pointer",
              }}
            >
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Header chip: "✓ Complete" or "3 of 6 filled" with the gaps on hover. */
export function SectionTickChip({ tick }: { tick?: SectionTick }) {
  if (!tick || tick.total === 0) return null;
  if (tick.complete) {
    return (
      <span style={{ fontSize: 12, color: "var(--success)", fontWeight: 500 }}>
        ✓ Complete
      </span>
    );
  }
  return (
    <span
      title={`Still to add: ${tick.missing.join(", ")}`}
      style={{ fontSize: 12, color: "var(--muted)" }}
    >
      {tick.filled} of {tick.total} filled
    </span>
  );
}

/** The standard profile card: eyebrow header + completeness tick + body. */
export function SectionCard({
  title,
  hint,
  tick,
  anchorId,
  children,
}: {
  title: string;
  hint?: ReactNode;
  tick?: SectionTick;
  anchorId?: string;
  children: ReactNode;
}) {
  return (
    <div
      id={anchorId}
      className="card card-pad"
      style={{ marginBottom: 16, ...(anchorId ? { scrollMarginTop: 16 } : {}) }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: hint != null ? 4 : 16,
        }}
      >
        <div className="eyebrow" style={{ margin: 0 }}>
          {title}
        </div>
        <SectionTickChip tick={tick} />
      </div>
      {hint != null && (
        <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 16 }}>
          {hint}
        </p>
      )}
      {children}
    </div>
  );
}
