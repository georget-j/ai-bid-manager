"use client";

import { useState } from "react";

interface Result {
  total: number;
  ingested: number;
  alreadyPresent: number;
  skipped: number;
}

export function IngestDocumentsButton({
  grantId,
  count,
}: {
  grantId: string;
  count: number;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/grants/${grantId}/ingest-documents`, {
        method: "POST",
      });
      const body = (await res.json()) as Result & { error?: string };
      if (!res.ok) setError(body.error ?? "Import failed.");
      else setResult(body);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    const added = result.ingested + result.alreadyPresent;
    return (
      <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
        {added > 0
          ? `✓ ${added} of ${result.total} resource${result.total === 1 ? "" : "s"} in this grant's knowledge base`
          : "No resources could be imported (they may require sign-in)."}
      </span>
    );
  }

  return (
    <>
      <button
        className="btn ghost sm"
        onClick={run}
        disabled={busy}
        style={{ fontSize: 13 }}
        title="Import this grant's documents and links into a knowledge base scoped to this grant only — it won't affect your other responses"
      >
        {busy
          ? "Importing…"
          : `Add ${count} resource${count === 1 ? "" : "s"} to knowledge base`}
      </button>
      {error && <span style={{ fontSize: 12, color: "#dc2626" }}>{error}</span>}
    </>
  );
}
