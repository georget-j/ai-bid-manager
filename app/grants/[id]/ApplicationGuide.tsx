"use client";

import { useState, useMemo, useSyncExternalStore } from "react";

const UPDATE_EVENT = "grant-guide-progress";

function subscribeProgress(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", cb);
  window.addEventListener(UPDATE_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(UPDATE_EVENT, cb);
  };
}

interface Step {
  title: string;
  detail: string;
  requirements: string[];
  deadline: string | null;
}
interface Guide {
  summary: string;
  eligibilityChecklist: string[];
  steps: Step[];
  generatedAt?: string;
}

export function ApplicationGuide({
  grantId,
  initialGuide,
}: {
  grantId: string;
  initialGuide: Guide | null;
}) {
  const [guide, setGuide] = useState<Guide | null>(initialGuide);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const storageKey = `grant-guide:${grantId}`;

  // Progress lives in client-only localStorage. useSyncExternalStore reads it without a
  // hydration mismatch (server snapshot is empty) and re-renders on change.
  const raw = useSyncExternalStore(
    subscribeProgress,
    () => {
      try {
        return localStorage.getItem(storageKey) ?? "[]";
      } catch {
        return "[]";
      }
    },
    () => "[]",
  );
  const checked = useMemo<Set<string>>(() => {
    try {
      return new Set(JSON.parse(raw) as string[]);
    } catch {
      return new Set();
    }
  }, [raw]);

  function toggle(id: string) {
    const next = new Set(checked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    try {
      localStorage.setItem(storageKey, JSON.stringify([...next]));
      window.dispatchEvent(new Event(UPDATE_EVENT));
    } catch {
      /* ignore */
    }
  }

  async function build() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/grants/${grantId}/guide`, {
        method: "POST",
      });
      const body = (await res.json()) as { guide?: Guide; error?: string };
      if (!res.ok || !body.guide)
        setError(body.error ?? "Could not build a guide.");
      else setGuide(body.guide);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!guide) {
    return (
      <div
        id="how-to-apply"
        className="card card-pad"
        style={{ marginBottom: 16, scrollMarginTop: 16 }}
      >
        <div className="eyebrow" style={{ marginBottom: 8 }}>
          How to apply
        </div>
        <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12 }}>
          Build a step-by-step guide for applying to this grant — tailored to
          its own process, eligibility and deadlines.
        </p>
        <button
          className="btn primary"
          onClick={build}
          disabled={busy}
          style={{ fontSize: 13 }}
        >
          {busy ? "Building guide…" : "Build how-to-apply guide"}
        </button>
        {error && (
          <p style={{ fontSize: 12, color: "#dc2626", marginTop: 8 }}>
            {error}
          </p>
        )}
      </div>
    );
  }

  const totalItems = guide.eligibilityChecklist.length + guide.steps.length;
  const doneItems = [...checked].filter(
    (id) => id.startsWith("e-") || id.startsWith("s-"),
  ).length;
  const pct = totalItems ? Math.round((doneItems / totalItems) * 100) : 0;

  return (
    <div
      id="how-to-apply"
      className="card card-pad"
      style={{ marginBottom: 16, scrollMarginTop: 16 }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <div className="eyebrow">How to apply</div>
        <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
          {doneItems}/{totalItems} done
        </span>
      </div>

      {/* progress bar */}
      <div
        style={{
          height: 5,
          borderRadius: 999,
          background: "var(--border)",
          overflow: "hidden",
          marginBottom: 14,
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: "var(--accent)",
            transition: "width .2s",
          }}
        />
      </div>

      <p
        style={{
          fontSize: 14,
          lineHeight: 1.6,
          color: "var(--ink-2)",
          marginBottom: 16,
        }}
      >
        {guide.summary}
      </p>

      {guide.eligibilityChecklist.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              color: "var(--ink)",
              marginBottom: 8,
            }}
          >
            Before you apply — confirm you meet:
          </div>
          {guide.eligibilityChecklist.map((item, i) => {
            const id = `e-${i}`;
            const on = checked.has(id);
            return (
              <Check key={id} on={on} onClick={() => toggle(id)}>
                {item}
              </Check>
            );
          })}
        </div>
      )}

      <div
        style={{
          fontSize: 12.5,
          fontWeight: 600,
          color: "var(--ink)",
          marginBottom: 8,
        }}
      >
        Steps to apply
      </div>
      <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {guide.steps.map((step, i) => {
          const id = `s-${i}`;
          const on = checked.has(id);
          return (
            <li
              key={id}
              style={{
                display: "flex",
                gap: 12,
                padding: "12px 0",
                borderTop: i > 0 ? "1px solid var(--border)" : "none",
                opacity: on ? 0.6 : 1,
              }}
            >
              <button
                onClick={() => toggle(id)}
                aria-label={on ? "Mark step not done" : "Mark step done"}
                style={{
                  flexShrink: 0,
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  border: `1.5px solid ${on ? "var(--accent)" : "var(--border)"}`,
                  background: on ? "var(--accent)" : "transparent",
                  color: "#fff",
                  fontSize: 12,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginTop: 1,
                }}
              >
                {on ? "✓" : i + 1}
              </button>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: 13.5,
                    fontWeight: 600,
                    color: "var(--ink)",
                    textDecoration: on ? "line-through" : "none",
                  }}
                >
                  {step.title}
                </div>
                <p
                  style={{
                    fontSize: 13,
                    lineHeight: 1.55,
                    color: "var(--ink-2)",
                    margin: "3px 0 0",
                  }}
                >
                  {step.detail}
                </p>
                {step.requirements.length > 0 && (
                  <ul
                    style={{
                      margin: "6px 0 0",
                      paddingLeft: 18,
                      fontSize: 12.5,
                      color: "var(--muted)",
                    }}
                  >
                    {step.requirements.map((r, j) => (
                      <li key={j} style={{ marginBottom: 2 }}>
                        {r}
                      </li>
                    ))}
                  </ul>
                )}
                {step.deadline && (
                  <span
                    style={{
                      display: "inline-block",
                      marginTop: 6,
                      fontSize: 11,
                      fontWeight: 600,
                      padding: "2px 8px",
                      borderRadius: 999,
                      background: "#fef3c7",
                      color: "#b45309",
                    }}
                  >
                    ⏱ {step.deadline}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Check({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        width: "100%",
        textAlign: "left",
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: "4px 0",
        fontSize: 13,
        color: on ? "var(--muted)" : "var(--ink-2)",
      }}
    >
      <span
        style={{
          flexShrink: 0,
          width: 16,
          height: 16,
          borderRadius: 4,
          border: `1.5px solid ${on ? "var(--accent)" : "var(--border)"}`,
          background: on ? "var(--accent)" : "transparent",
          color: "#fff",
          fontSize: 11,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginTop: 1,
        }}
      >
        {on ? "✓" : ""}
      </span>
      <span style={{ textDecoration: on ? "line-through" : "none" }}>
        {children}
      </span>
    </button>
  );
}
