"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div
      className="content"
      style={{
        paddingTop: 48,
        display: "flex",
        flexDirection: "column",
        gap: 16,
        alignItems: "flex-start",
      }}
    >
      <h2
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: 20,
          fontWeight: 400,
        }}
      >
        Something went wrong
      </h2>
      <p style={{ color: "var(--muted)", fontSize: 13.5, margin: 0 }}>
        {error.message || "An unexpected error occurred."}
      </p>
      <button className="btn primary" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
