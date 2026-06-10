"use client";

import { useState, useRef } from "react";
import type { GrantBudget, BudgetLine } from "@/lib/grants/budget";
import { budgetTotals } from "@/lib/grants/budget";

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function fmt(n: number) {
  return `£${Math.round(n).toLocaleString()}`;
}

function BudgetSection({
  title,
  lines,
  placeholder,
  onChange,
}: {
  title: string;
  lines: BudgetLine[];
  placeholder: string;
  onChange: (next: BudgetLine[]) => void;
}) {
  return (
    <div style={{ flex: 1, minWidth: 220 }}>
      <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>
        {title}
      </div>
      {lines.map((line) => (
        <div key={line.id} style={{ display: "flex", gap: 6, marginBottom: 5 }}>
          <input
            value={line.label}
            onChange={(e) =>
              onChange(
                lines.map((l) =>
                  l.id === line.id ? { ...l, label: e.target.value } : l,
                ),
              )
            }
            placeholder={placeholder}
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 12.5,
              padding: "4px 7px",
              borderRadius: 5,
              border: "1px solid var(--border)",
            }}
          />
          <input
            type="number"
            value={Number.isFinite(line.amount) ? line.amount : ""}
            onChange={(e) =>
              onChange(
                lines.map((l) =>
                  l.id === line.id
                    ? { ...l, amount: Number(e.target.value) || 0 }
                    : l,
                ),
              )
            }
            placeholder="£"
            style={{
              width: 96,
              fontSize: 12.5,
              padding: "4px 7px",
              borderRadius: 5,
              border: "1px solid var(--border)",
              fontFamily: "var(--font-mono)",
            }}
          />
          <button
            onClick={() => onChange(lines.filter((l) => l.id !== line.id))}
            aria-label="Remove line"
            style={{
              border: "none",
              background: "none",
              color: "var(--muted)",
              cursor: "pointer",
              fontSize: 15,
            }}
          >
            ×
          </button>
        </div>
      ))}
      <button
        onClick={() =>
          onChange([...lines, { id: uid(), label: "", amount: 0 }])
        }
        className="btn ghost sm"
        style={{ fontSize: 12, marginTop: 2 }}
      >
        + Add line
      </button>
    </div>
  );
}

export function BudgetBuilder({
  draftId,
  initialBudget,
  onSaved,
}: {
  draftId: string;
  initialBudget: GrantBudget | null;
  onSaved?: () => void;
}) {
  const [costs, setCosts] = useState<BudgetLine[]>(initialBudget?.costs ?? []);
  const [funding, setFunding] = useState<BudgetLine[]>(
    initialBudget?.funding ?? [],
  );
  const [saved, setSaved] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function persist(nextCosts: BudgetLine[], nextFunding: BudgetLine[]) {
    setSaved(false);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      await fetch(`/api/rfp/drafts/${draftId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          budget: { costs: nextCosts, funding: nextFunding },
        }),
      }).catch(() => {});
      setSaved(true);
      onSaved?.();
    }, 700);
  }

  const totals = budgetTotals({ costs, funding });

  return (
    <div className="card card-pad" style={{ marginBottom: 18 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <div className="eyebrow">Project budget</div>
        <span style={{ fontSize: 11, color: "var(--muted)" }}>
          {saved ? "Saved" : "Saving…"}
        </span>
      </div>

      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        <BudgetSection
          title="Project costs"
          lines={costs}
          placeholder="e.g. Staff, equipment"
          onChange={(next) => {
            setCosts(next);
            persist(next, funding);
          }}
        />
        <BudgetSection
          title="Funding sources"
          lines={funding}
          placeholder="e.g. Grant requested, match funding"
          onChange={(next) => {
            setFunding(next);
            persist(costs, next);
          }}
        />
      </div>

      <div
        style={{
          display: "flex",
          gap: 24,
          flexWrap: "wrap",
          marginTop: 14,
          paddingTop: 12,
          borderTop: "1px solid var(--border)",
          fontSize: 13,
        }}
      >
        <span>
          Total cost:{" "}
          <strong style={{ fontFamily: "var(--font-mono)" }}>
            {fmt(totals.cost)}
          </strong>
        </span>
        <span>
          Total funding:{" "}
          <strong style={{ fontFamily: "var(--font-mono)" }}>
            {fmt(totals.funding)}
          </strong>
        </span>
        <span
          style={{
            color:
              Math.abs(totals.balance) <= 1
                ? "#059669"
                : totals.balance < 0
                  ? "#dc2626"
                  : "#b45309",
            fontWeight: 600,
          }}
        >
          {Math.abs(totals.balance) <= 1
            ? "Balanced"
            : totals.balance < 0
              ? `${fmt(-totals.balance)} short`
              : `${fmt(totals.balance)} over`}
        </span>
      </div>
    </div>
  );
}
