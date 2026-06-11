// Pure keyword classifiers for investor events. Sources rarely tag events with a
// clean type, so we classify from the title/description; same for spotting
// virtual events from free-text location fields.

import type { InvestorEventType } from "./types";

// Priority-ordered: the first matching rule wins. More specific formats (demo
// day, office hours, pitch) outrank broader ones (conference, networking) so
// "Accelerator Demo Day" is a demo-day and "Angel pitch night" is a pitch-night.
const TYPE_RULES: Array<{ type: InvestorEventType; pattern: RegExp }> = [
  { type: "demo-day", pattern: /\bdemo[\s-]?days?\b/i },
  { type: "vc-office-hours", pattern: /\boffice hours?\b|\bopen office\b/i },
  {
    type: "pitch-night",
    pattern: /\bpitch(es|ing)?\b|\bdragons.?\s?den\b|\bshark tank\b/i,
  },
  {
    type: "webinar",
    pattern: /\bwebinars?\b|\bonline workshop\b|\bmasterclass(es)?\b/i,
  },
  {
    type: "accelerator",
    pattern:
      /\b(pre-?)?accelerators?\b|\bincubators?\b|\bcohort\b|\bbootcamp\b/i,
  },
  { type: "angel-network", pattern: /\bangels?\b/i },
  {
    type: "conference",
    pattern: /\bconference\b|\bsummits?\b|\bexpo\b|\bfestival\b|\bforum\b/i,
  },
  {
    type: "networking",
    pattern:
      /\bnetwork(ing)?\b|\bmeet-?ups?\b|\bmixers?\b|\bdrinks\b|\bbreakfast\b|\broundtable\b/i,
  },
];

/**
 * Classify an event into an `investor_events.event_type` from its title and
 * description. The title is checked first (against every rule, in priority
 * order) so a "Founder networking drinks" event whose blurb mentions pitching
 * stays a networking event. Falls back to "other".
 */
export function classifyEventType(
  title: string,
  description?: string | null,
): InvestorEventType {
  for (const text of [title, description ?? ""]) {
    if (!text.trim()) continue;
    for (const rule of TYPE_RULES) {
      if (rule.pattern.test(text)) return rule.type;
    }
  }
  return "other";
}

const PLATFORM_RULES: Array<{ platform: string; pattern: RegExp }> = [
  { platform: "zoom", pattern: /\bzoom\b/i },
  { platform: "google-meet", pattern: /\bgoogle meet\b|\bmeet\.google\b/i },
  { platform: "teams", pattern: /\b(microsoft |ms )?teams\b/i },
  { platform: "webex", pattern: /\bwebex\b/i },
];

const VIRTUAL_PATTERN =
  /\bonline\b|\bvirtual(ly)?\b|\bwebinars?\b|\blive-?stream(ed|ing)?\b|\bremote\b|\bvideo call\b/i;

/**
 * Detect a virtual event from a free-text location (e.g. Eventbrite's venue
 * field: "Online — Zoom link sent on registration"). Returns the platform when
 * a known one is named, otherwise platform null. Physical addresses (and empty
 * input) return { isVirtual: false, platform: null }.
 */
export function classifyVirtual(locationText?: string | null): {
  isVirtual: boolean;
  platform: string | null;
} {
  const text = (locationText ?? "").trim();
  if (!text) return { isVirtual: false, platform: null };
  for (const rule of PLATFORM_RULES) {
    if (rule.pattern.test(text))
      return { isVirtual: true, platform: rule.platform };
  }
  if (VIRTUAL_PATTERN.test(text)) return { isVirtual: true, platform: null };
  return { isVirtual: false, platform: null };
}
