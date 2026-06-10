// Loads .env.local before any module-level code runs (e.g. the OpenAI key
// check in lib/openai.ts, or env-gated suites like tenant-isolation).
// Listed in setupFiles in vitest.config.ts, vitest.eval.config.ts and
// vitest.qa.config.ts. Existing env vars are never overridden, so CI keeps
// whatever secrets (or absence of them) it was launched with.
import { readFileSync } from "fs";
import { resolve } from "path";

try {
  const content = readFileSync(resolve(process.cwd(), ".env.local"), "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (key && !process.env[key]) process.env[key] = val;
  }
} catch {
  // .env.local absent — env vars expected to be set already (e.g. CI)
}
