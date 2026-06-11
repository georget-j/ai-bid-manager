"use client";

// Programme card CTA — same mechanics as app/grants/[id]/DraftApplicationButton:
// POST /api/grants/[id]/draft-application (programmes live in the grants table,
// so the whole guided apply flow works unchanged), then go to the draft
// workspace. The route returns the existing draft when one is already underway,
// so clicking twice never creates a duplicate.

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ProgrammeApplyButton({ grantId }: { grantId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/grants/${grantId}/draft-application`, {
        method: "POST",
      });
      const body = (await res.json()) as { draftId?: string; error?: string };
      if (!res.ok || !body.draftId) {
        setError(body.error ?? "Failed to start your application.");
        setBusy(false);
      } else {
        router.push(`/rfp/drafts/${body.draftId}`);
      }
    } catch {
      setError("Network error — please try again.");
      setBusy(false);
    }
  }

  return (
    <span
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 4,
      }}
    >
      <button
        className="btn primary"
        onClick={start}
        disabled={busy}
        style={{ fontSize: 12.5, flexShrink: 0 }}
        title="We'll set up a step-by-step application using the programme's questions and your evidence library"
      >
        {busy ? "Setting up your workspace…" : "Apply with your evidence →"}
      </button>
      {error && (
        <span style={{ fontSize: 11.5, color: "#dc2626" }}>{error}</span>
      )}
    </span>
  );
}
