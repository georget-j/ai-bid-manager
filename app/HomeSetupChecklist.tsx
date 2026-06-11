// "Get set up" card on the home page. Server component — the steps are derived
// per-request by lib/setup-flow.ts, and the card hides itself once everything is
// done (no stored "dismissed" flag needed; finished users simply never see it).

import Link from "next/link";
import type { SetupFlow } from "@/lib/setup-flow";

export function HomeSetupChecklist({ setup }: { setup: SetupFlow }) {
  if (setup.allDone) return null;

  return (
    <section style={{ marginBottom: 36 }}>
      <div
        className="section-title"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>Get set up</span>
        <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 400 }}>
          {setup.doneCount} of {setup.steps.length} done
        </span>
      </div>
      <div className="card" style={{ overflow: "hidden" }}>
        {setup.steps.map((step, i) => {
          const done = step.status === "done";
          const isNext = setup.nextStep?.key === step.key;
          return (
            <div
              key={step.key}
              style={{
                padding: "14px 20px",
                borderBottom:
                  i < setup.steps.length - 1
                    ? "1px solid var(--border)"
                    : "none",
                display: "flex",
                gap: 14,
                alignItems: "flex-start",
                background: isNext ? "var(--accent-tint)" : undefined,
              }}
            >
              <div
                aria-hidden
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  flexShrink: 0,
                  display: "grid",
                  placeItems: "center",
                  fontSize: 12,
                  fontWeight: 600,
                  fontFamily: "var(--font-mono)",
                  background: done ? "var(--success)" : "var(--accent-tint)",
                  color: done ? "#fff" : "var(--accent)",
                  border: done ? "none" : "1px solid var(--border)",
                }}
              >
                {done ? "✓" : step.number}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Link
                  href={step.href}
                  style={{
                    fontSize: 13.5,
                    fontWeight: 600,
                    color: "var(--ink)",
                    textDecoration: done ? "line-through" : "none",
                    textDecorationColor: "var(--muted)",
                  }}
                >
                  {step.label}
                </Link>
                <div
                  style={{
                    fontSize: 12.5,
                    color: "var(--muted)",
                    marginTop: 2,
                  }}
                >
                  {done ? step.detail : step.help}
                </div>
                {!done && step.detail && (
                  <div
                    style={{
                      fontSize: 11.5,
                      color: "var(--muted)",
                      marginTop: 2,
                      fontStyle: "italic",
                    }}
                  >
                    {step.detail}
                  </div>
                )}
              </div>
              {isNext && (
                <Link
                  href={step.href}
                  className="btn accent sm"
                  style={{ flexShrink: 0, whiteSpace: "nowrap" }}
                >
                  Next step →
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
