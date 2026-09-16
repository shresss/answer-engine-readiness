/**
 * The coach report: one measurement, one probe set, and one stated absence.
 *
 * WHAT IS REUSED AND WHY. `scoreProfileHtml` measures whether an extractor can
 * read a page: a main region, the share of text inside it, words locked in a
 * script, retrievable passages, the identity facts in the served text, a Person
 * node in the structured data. Every one of those is a property of HTML, not of
 * a profession, so the coach lane runs the SAME scorer against the coach's page
 * rather than a second arithmetic that could drift from it. The coach JSON-LD
 * emits a `Person` node (src/lib/coach-jsonld.ts), which is the node that
 * scorer looks for, so the check is live rather than decorative.
 *
 * WHAT IS NOT REUSED, AND MUST NOT BE.
 *
 *   1. THE LABELS. The therapist scorer's identity check reads "Your name,
 *      credential and city are in the page text". A coach holds no credential
 *      in that sense (her badge says "Identity verified; no credential on
 *      file" until a body confirms one), and putting the word in front of her
 *      invites a claim the platform spends real effort refusing. So the coach
 *      card renders COACH_CHECK_LABELS, and `credential` is not passed to the
 *      scorer at all: a fact we do not hold is skipped by that scorer, never
 *      failed, so nothing is scored red for a column we chose not to fill.
 *
 *   2. THE OUT-OF-SCOPE LIST. The therapist list names the 988 line and the
 *      clinical disclaimer as things a profile is not checked for. Naming them
 *      to a coach would put crisis and clinical vocabulary on a coaching
 *      dashboard to explain something the coach never had. COACH_OUT_OF_SCOPE
 *      says the same thing in the coach's own terms.
 *
 *   3. THE CITATION LANDSCAPE. `src/lib/ai-readiness/landscape.ts` is a
 *      site-wide hand-recorded measurement over forty MENTAL-HEALTH questions.
 *      It is not a coaching measurement, it is not about this coach, and its
 *      questions are symptom phrasings. It is deliberately not imported here.
 *      ./citation.ts carries the coach answer, which is that nobody has probed.
 */
import { scoreProfileHtml, type CheckId, type ReadinessReport } from "@/lib/ai-readiness/score";
import {
  buildCoachQueries,
  type CoachQuery,
  type CoachQueryFacts,
} from "@/lib/coach-ai-readiness/queries";
import {
  coachCitationStatus,
  type CoachCitationRun,
  type CoachCitationStatus,
} from "@/lib/coach-ai-readiness/citation";

/**
 * Coach-facing copy for each check the shared scorer runs.
 *
 * A full map rather than an override of the one line that differs, so a check
 * added to the scorer later cannot silently render therapist copy on a coach's
 * dashboard: the type demands a coach label for every id, and the build fails
 * without one. tests/coach-ai-readiness-card.test.tsx pins the outcome.
 */
export const COACH_CHECK_LABELS: Record<CheckId, string> = {
  main_region: "Your page has a main content region",
  extraction_yield: "Most of your writing sits inside that region",
  script_locked_words: "None of your writing is locked inside a script",
  passages: "There is enough of you to quote",
  core_fields: "Your name and city are in the page text",
  person_jsonld: "Your page carries structured data naming you",
};

/**
 * What this report does not check, said in coaching terms.
 *
 * The therapist version of this list names clinical furniture. A coaching
 * profile has none of it, should never claim any of it, and does not need it
 * named to understand what was skipped.
 */
export const COACH_OUT_OF_SCOPE: readonly string[] = [
  "the reviewer name and last-reviewed date our learn articles carry (a coaching profile makes no editorial review claim)",
  "the safety and disclaimer furniture those articles carry, which a coaching profile does not have and must not claim",
  "a downloadable PDF (an artifact a coaching profile does not publish)",
];

export type CoachReadinessReport = {
  /** The shared extractability measurement, verbatim from the shared scorer. */
  readability: ReadinessReport;
  /** The coach-shaped probe set. Questions, not answers. */
  queries: CoachQuery[];
  /** Candidates the coaching-language guard refused. Stated, never hidden. */
  suppressedQueries: number;
  citation: CoachCitationStatus;
  outOfScope: readonly string[];
};

export function coachReadinessReport(
  html: string,
  facts: CoachQueryFacts,
  runs?: readonly CoachCitationRun[],
): CoachReadinessReport {
  const readability = scoreProfileHtml(html, {
    name: (facts.displayName ?? "").trim(),
    // NOT a coach field. See note 1 in the header: the scorer skips a fact we
    // do not hold rather than failing the page for it.
    credential: null,
    city: (facts.city ?? "").trim() || null,
  });

  const { queries, suppressed } = buildCoachQueries(facts);

  return {
    readability,
    queries,
    suppressedQueries: suppressed,
    citation: runs === undefined ? coachCitationStatus(queries) : coachCitationStatus(queries, runs),
    outOfScope: COACH_OUT_OF_SCOPE,
  };
}
