"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SaveAsDraftButton({
  opportunityId,
}: {
  opportunityId: string;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/opportunities/${opportunityId}/save-draft`,
        { method: "POST" },
      );
      const body = (await res.json()) as { draftId?: string; error?: string };
      if (!res.ok || !body.draftId) {
        setError(body.error ?? "Failed to save draft.");
      } else {
        router.push(`/rfp/drafts/${body.draftId}`);
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <button
        className="btn ghost sm"
        onClick={save}
        disabled={saving}
        style={{ fontSize: 12 }}
        title="Snapshot these requirements into a reusable response draft"
      >
        {saving ? "Saving…" : "Save as response draft →"}
      </button>
      {error && <span style={{ fontSize: 12, color: "#dc2626" }}>{error}</span>}
    </div>
  );
}
