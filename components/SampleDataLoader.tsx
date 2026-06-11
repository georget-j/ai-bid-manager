"use client";

import { useState } from "react";
import { LoadingDots } from "./LoadingState";
import { ErrorAlert } from "./ErrorAlert";

interface SampleDataLoaderProps {
  onSuccess?: () => void;
}

export function SampleDataLoader({ onSuccess }: SampleDataLoaderProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    seeded: string[];
    skipped: string[];
  } | null>(null);

  async function handleLoad() {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/documents/seed", { method: "POST" });
      const data = await res.json();
      if (!res.ok)
        throw new Error(
          data.error ??
            "We couldn’t load the sample documents — please try again.",
        );
      setResult(data);
      onSuccess?.();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "We couldn’t load the sample documents — please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="p-5 bg-blue-50 border border-blue-200 rounded-xl">
        <h3 className="text-sm font-semibold text-blue-900 mb-1">
          Just exploring?
        </h3>
        <p className="text-xs text-blue-700 mb-3">
          Load 8 sample documents — case studies, security notes and a past
          answer library — and try drafting answers before you add your own
          files.
        </p>
        <button
          onClick={handleLoad}
          disabled={loading}
          className="px-4 py-2 bg-blue-700 text-white text-sm font-medium rounded-lg hover:bg-blue-800 disabled:opacity-50 transition-colors flex items-center gap-2"
        >
          {loading ? (
            <>
              <LoadingDots />
              <span>Adding documents…</span>
            </>
          ) : (
            "Load sample documents"
          )}
        </button>
      </div>

      {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

      {result && (
        <div className="rounded border border-green-200 bg-green-50 px-4 py-3">
          {result.seeded.length > 0 && (
            <p className="text-sm text-green-700">
              ✓ Added {result.seeded.length} sample document
              {result.seeded.length !== 1 ? "s" : ""} — ready to use in your
              answers
            </p>
          )}
          {result.skipped.length > 0 && (
            <p className="text-xs text-green-600 mt-0.5">
              {result.skipped.length} already in your library — skipped
            </p>
          )}
          {result.seeded.length === 0 && result.skipped.length > 0 && (
            <p className="text-sm text-green-700">
              All sample documents are already in your library.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
