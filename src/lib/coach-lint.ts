/**
 * Save-time coaching-language check (invariant 3, both directions; COACH-03
 * §7). A coach's own free text claiming to offer therapy, to treat
 * conditions, to diagnose, or to be a licensed clinician is a legal exposure
 * (unlicensed-practice implications) and a brand breach on this domain - and
 * it blurs the exact line the therapist verification story depends on.
 *
 * Deliberately NARROW: it flags first-person clinical CLAIMS, not mentions.
 * "Coaching is not therapy" must pass; "I provide therapy" must not. The
 * deterministic lint is the floor, not the whole control - the signed
 * attestation and human spot-review sit above it (proposal (f) risk 3).
 */

const CLINICAL_CLAIM_PATTERNS: { re: RegExp; why: string }[] = [
  {
    re: /\b(i|we)\s+(offer|provide|practice|do|deliver)\s+(psycho)?therapy\b/i,
    why: "describes the service as therapy",
  },
  {
    re: /\b(i|we)\s+(offer|provide|practice|do|deliver)\s+(mental\s+health\s+)?(counseling|counselling)\b/i,
    why: "describes the service as counseling",
  },
  {
    re: /\b(i|we)\s+(treat|cure|heal)\b/i,
    why: "claims to treat a condition",
  },
  {
    re: /\btreatment\s+(of|for)\s+\w/i,
    why: "claims to provide treatment",
  },
  {
    re: /\b(i|we)\s+(can\s+)?diagnos(e|ing)\b/i,
    why: "claims to diagnose",
  },
  {
    re: /\b(i|we)\s+am\s+a\s+licensed\s+(therapist|psychologist|counselor|counsellor|clinician)\b/i,
    why: "claims a clinical license",
  },
  {
    re: /\bas\s+a\s+licensed\s+(therapist|psychologist|counselor|counsellor|clinician)\b/i,
    why: "claims a clinical license",
  },
];

export type CoachTextLintVerdict = { ok: true } | { ok: false; why: string };

/** Check coach-authored free text for first-person clinical claims. */
export function lintCoachText(...parts: (string | null | undefined)[]): CoachTextLintVerdict {
  const text = parts
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join("\n\n");
  if (!text) return { ok: true };
  for (const { re, why } of CLINICAL_CLAIM_PATTERNS) {
    if (re.test(text)) return { ok: false, why };
  }
  return { ok: true };
}

/** The message a rejected save shows. Names the rule, not just "invalid". */
export const COACH_LINT_MESSAGE =
  "Please describe your services as coaching. Coaching on this platform is not therapy, counseling, treatment, or diagnosis, and profile text may not present it as any of those.";
