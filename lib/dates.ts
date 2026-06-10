// Pure date helpers safe to import from both server and client code.

const DAY_MS = 86_400_000;

/**
 * Whole days until an ISO timestamp, rounded up — the deadline maths used across
 * the app: negative = past, 0 = due today (within the next 24h), 1 = tomorrow.
 * Accepts an optional `now` so callers (and tests) can pin the clock.
 */
export function daysUntil(
  iso: string,
  now: number | Date = Date.now(),
): number {
  const nowMs = typeof now === "number" ? now : now.getTime();
  const days = Math.ceil((new Date(iso).getTime() - nowMs) / DAY_MS);
  return days === 0 ? 0 : days; // Math.ceil(-0.5) is -0 — normalise it
}
