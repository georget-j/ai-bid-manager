"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export interface ExistingDraftInfo {
  id: string;
  answeredCount: number;
  questionCount: number;
}

export function DraftApplicationButton({
  grantId,
  existingDraft,
}: {
  grantId: string;
  existingDraft?: ExistingDraftInfo | null;
}) {
  if (existingDraft) {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <Link
          href={`/rfp/drafts/${existingDraft.id}`}
          className="btn primary"
          style={{ fontSize: 13, textDecoration: "none" }}
        >
          Continue your application →
        </Link>
        {existingDraft.questionCount > 0 && (
          <span style={{ fontSize: 12, color: "var(--muted)" }}>
            In progress — {existingDraft.answeredCount} of{" "}
            {existingDraft.questionCount} questions answered
          </span>
        )}
      </span>
    );
  }
  return <StartApplicationButton grantId={grantId} />;
}

function StartApplicationButton({ grantId }: { grantId: string }) {
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
      const body = (await res.json()) as {
        draftId?: string;
        existing?: boolean;
        error?: string;
      };
      if (!res.ok || !body.draftId) {
        setError(body.error ?? "Failed to start application.");
      } else {
        // body.existing === true means an application was already underway for this
        // grant — same destination either way, no duplicate is created.
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
        title="We'll pull in the funder's requirements and set up a step-by-step workspace for you"
      >
        {busy ? "Setting up your workspace…" : "Start your application →"}
      </button>
      {error && <span style={{ fontSize: 12, color: "#dc2626" }}>{error}</span>}
    </>
  );
}
