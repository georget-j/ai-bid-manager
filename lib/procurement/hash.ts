import crypto from "crypto";

/** Stable SHA-256 hash of a JSON-serialisable payload. Used for deduplication. */
export function hashPayload(payload: unknown): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
}
