"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DraftApplicationButton({ grantId }: { grantId: string }) {
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
        setError(body.error ?? "Failed to start application.");
      } else {
        router.push(`/rfp/drafts/${body.draftId}`);
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        className="btn primary"
        onClick={start}
        disabled={busy}
        style={{ fontSize: 13 }}
        title="Create a KB-grounded application draft for this grant"
      >
        {busy ? "Starting…" : "Draft an application →"}
      </button>
      {error && <span style={{ fontSize: 12, color: "#dc2626" }}>{error}</span>}
    </>
  );
}
