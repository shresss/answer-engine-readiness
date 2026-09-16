/**
 * The coach-shaped probe set: the questions an answer engine would have to be
 * asked before this coach's page could possibly come up.
 *
 * WHY THE THERAPIST SET IS NOT REUSED, AND CANNOT BE. The one recorded
 * landscape this estate holds (geo-2026-08-19) put forty MENTAL-HEALTH
 * questions to three answer channels: "why am i sad for no reason", "why do i
 * feel anxious for no reason", and so on (queries-40.tsv, read in full). Those
 * are symptom phrasings. Rendering them on a coach's own dashboard would put
 * clinical vocabulary in front of someone whose entire profile is governed by
 * the rule that coaching is not therapy, treatment, or diagnosis
 * (src/lib/coach-lint.ts, the signed attestation, the JSON-LD node set). So the
 * coach set is built from the coach's OWN facts (her name, her coaching areas,
 * her metro), and the boundary is enforced structurally rather than by care:
 * every candidate runs through `coachQueryGuard` before it can be returned, and
 * a candidate that trips it is DROPPED, not softened.
 *
 * The drop direction matters. A coach whose display name happens to carry
 * clinical vocabulary loses her name queries; she does not get them published
 * with the words taken out, and she does not get them published as they are.
 * The report states how many were withheld, so a silently short list is never
 * mistaken for a short probe set.
 *
 * NOTHING HERE RUNS A QUERY. These are the questions, not answers. What was
 * asked of an engine, and what it said, live in ./citation.ts, whose recorded
 * set ships empty.
 */
import { lintCoachText } from "@/lib/coach-lint";

export type CoachQueryKind = "name" | "niche" | "niche-metro" | "virtual-niche";

export type CoachQuery = {
  /** Stable within one report, so React keys and probe records can name a row. */
  id: string;
  kind: CoachQueryKind;
  text: string;
};

export type CoachQueryFacts = {
  displayName: string;
  city: string;
  coachingAreas: string[];
  meetingTypes: string[];
};

/**
 * Eight is a probe set someone might actually run by hand, which is the only
 * way this ever gets run (the GEO harness's Panel B is hand-recorded by its own
 * design). A list nobody will work through is a list that stays unmeasured.
 */
export const MAX_COACH_QUERIES = 8;

/** Areas beyond this many are not dropped from the profile, only from the probe set. */
const MAX_AREAS_PROBED = 3;

/**
 * Vocabulary that may never appear in a query this product puts in front of a
 * coach. Two kinds, one list: the CLINICAL words a coach may not use of her own
 * services (the same line src/lib/coach-lint.ts draws), and the SYMPTOM words
 * that make a question a mental-health question rather than a coaching one.
 *
 * Matched on WORD BOUNDARIES, never as substrings. A substring match eats
 * surnames: "Treatwell" is not a treatment claim and "Therese" is not therapy.
 * A guard that eats surnames is a guard the next lane deletes.
 */
export const CLINICAL_QUERY_TOKENS: readonly string[] = [
  // the services a coach does not provide
  "therapy",
  "therapies",
  "therapist",
  "therapists",
  "psychotherapy",
  "counseling",
  "counselling",
  "counselor",
  "counsellor",
  "psychologist",
  "psychiatrist",
  "psychiatry",
  "psychiatric",
  "clinical",
  "clinician",
  "treat",
  "treats",
  "treating",
  "treatment",
  "diagnose",
  "diagnosed",
  "diagnosing",
  "diagnosis",
  "patient",
  "patients",
  "medication",
  "mental health",
  "mental illness",
  // the symptom phrasings that make a question a clinical one
  "symptom",
  "symptoms",
  "disorder",
  "disorders",
  "depression",
  "depressed",
  "anxiety",
  "anxious",
  "trauma",
  "traumatic",
  "ptsd",
  "adhd",
  "ocd",
  "bipolar",
  "addiction",
  "suicide",
  "suicidal",
  "self-harm",
  "grief",
  "bereavement",
  "abuse",
  "sad",
  "sadness",
  "panic attack",
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * `\b` does not fire between "-" and "h", so "self-harm" needs its hyphen
 * treated as part of the token rather than as a boundary. Building the pattern
 * from the token itself keeps that a property of this function instead of a
 * special case someone has to remember when adding a word.
 */
const TOKEN_RE: readonly { token: string; re: RegExp }[] = CLINICAL_QUERY_TOKENS.map((token) => ({
  token,
  re: new RegExp(`(^|[^\\p{L}\\p{N}])${escape(token)}($|[^\\p{L}\\p{N}])`, "iu"),
}));

export type CoachQueryVerdict = { ok: true } | { ok: false; why: string };

/**
 * THE BOUNDARY, as a function.
 *
 * Two checks, and they catch different things. The token scan above catches
 * clinical and symptom VOCABULARY, which is what a query is made of.
 * `lintCoachText` is the estate's existing save-time check for first-person
 * clinical CLAIMS, and it is run here too rather than reimplemented: a probe
 * set is coach-authored text reaching a rendered surface, which is exactly the
 * population that lint governs. Reusing the predicate is the standing rule; a
 * second hand-written notion of "clinical" is how two surfaces come to disagree.
 */
export function coachQueryGuard(text: string): CoachQueryVerdict {
  const t = (text ?? "").trim();
  if (!t) return { ok: false, why: "empty" };
  for (const { token, re } of TOKEN_RE) {
    if (re.test(` ${t} `)) {
      return { ok: false, why: `names ${token}, which is not coaching vocabulary` };
    }
  }
  const lint = lintCoachText(t);
  if (!lint.ok) return { ok: false, why: lint.why };
  return { ok: true };
}

type Candidate = { kind: CoachQueryKind; text: string };

export type CoachQueryBuild = {
  queries: CoachQuery[];
  /** Candidates the guard refused. Stated on the card, never silently dropped. */
  suppressed: number;
};

/**
 * Areas are Title Case in the taxonomy ("Life transitions") because that is how
 * they render on the profile. A person typing a question into an answer engine
 * does not capitalise, so the probe set reads the way the question is asked.
 */
const lower = (s: string) => s.toLowerCase();

/** "Virtual" or "Hybrid" means an engine could be asked the online question. */
function offersVirtual(meetingTypes: string[]): boolean {
  return meetingTypes.some((t) => /^(virtual|hybrid)$/i.test((t ?? "").trim()));
}

/**
 * The candidate list, in the order the cap should keep them.
 *
 * Her own name first (the query most likely to be asked about a specific
 * person), then niche-plus-metro (the query a seeker actually types), then the
 * online variant, then the bare niche. Areas beyond the first three are not
 * probed: a twelve-area coach would otherwise flood the set with rows nobody
 * will run by hand, and an unrun probe is not a measurement.
 */
function candidates(facts: CoachQueryFacts): Candidate[] {
  const name = (facts.displayName ?? "").trim();
  const city = (facts.city ?? "").trim();
  const areas = (facts.coachingAreas ?? [])
    .map((a) => (a ?? "").trim())
    .filter(Boolean)
    .slice(0, MAX_AREAS_PROBED);

  const out: Candidate[] = [];
  if (name) {
    out.push({ kind: "name", text: `${name} coach` });
    if (city) out.push({ kind: "name", text: `${name} coach ${city}` });
  }
  for (const area of areas) {
    if (city) out.push({ kind: "niche-metro", text: `${lower(area)} coach in ${city}` });
  }
  if (areas.length > 0 && offersVirtual(facts.meetingTypes ?? [])) {
    out.push({ kind: "virtual-niche", text: `online ${lower(areas[0])} coach` });
  }
  for (const area of areas) {
    out.push({ kind: "niche", text: `${lower(area)} coaching` });
  }
  return out;
}

export function buildCoachQueries(facts: CoachQueryFacts): CoachQueryBuild {
  const seen = new Set<string>();
  const queries: CoachQuery[] = [];
  let suppressed = 0;

  for (const c of candidates(facts)) {
    const text = c.text.replace(/\s+/g, " ").trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (!coachQueryGuard(text).ok) {
      suppressed++;
      continue;
    }
    if (queries.length >= MAX_COACH_QUERIES) continue;
    queries.push({ id: `cq${queries.length + 1}`, kind: c.kind, text });
  }

  return { queries, suppressed };
}

export function coachQuerySet(facts: CoachQueryFacts): CoachQuery[] {
  return buildCoachQueries(facts).queries;
}
