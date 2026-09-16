/**
 * Whether an answer engine cited this coach, and the reason that question is
 * answered "nobody has asked" rather than "no".
 *
 * THE RULE THIS FILE EXISTS TO KEEP. "Cited" and "not cited" are statements
 * about a probe that RAN. This system runs no probe. The GEO harness separates
 * its two panels for exactly that reason: Panel A (extractability) is automated
 * and deterministic, Panel B "reads a hand-recorded TSV (engines cannot be
 * driven headlessly)". There is no automated per-person citation signal
 * anywhere in this estate, and the one hand-recorded landscape it holds
 * (geo-2026-08-19) measured the WHOLE SITE against forty mental-health
 * questions, which is neither this coach nor a coaching question.
 *
 * So `RECORDED_COACH_CITATION_RUNS` ships EMPTY, and the card built on it says
 * so in words. An empty set producing "not cited" would be this product
 * inventing a measurement and then handing a coach a bad number for it. An
 * empty set producing "cited" would be worse. It produces neither.
 *
 * WHEN A RUN ACTUALLY HAPPENS, add its rows here and edit nothing else. A row
 * is a specific engine, on a specific date, given a specific query, with the
 * result someone read with their own eyes and the file it was written down in.
 * A query with no row stays `not-probed` forever, and `not-probed` is a
 * different word from `not-cited` on purpose.
 */
import type { CoachQuery } from "@/lib/coach-ai-readiness/queries";

export type CoachCitationRun = {
  /** ISO date the run was recorded. The run's own date, never a clock read. */
  measuredOn: string;
  /** The answer channel, named as it was asked ("Perplexity", "Bing organic"). */
  engine: string;
  /** The query text, matched EXACTLY against the coach's own probe set. */
  queryText: string;
  cited: boolean;
  /** Where this row was written down, so the claim has a receipt. */
  source: string;
};

/**
 * EMPTY, and deliberately so. See the header. Nothing has probed an answer
 * engine on behalf of a coach on this platform.
 */
export const RECORDED_COACH_CITATION_RUNS: readonly CoachCitationRun[] = [];

export type CoachCitationResultState = "cited" | "not-cited" | "not-probed";

export type CoachCitationResult = {
  query: CoachQuery;
  state: CoachCitationResultState;
  /** Present only when a run exists for this query. */
  run: CoachCitationRun | null;
};

export type CoachCitationStatus =
  | {
      measured: false;
      /** What is true instead. Rendered verbatim; it is the whole claim. */
      reason: string;
      probeSet: CoachQuery[];
    }
  | {
      measured: true;
      measuredOn: string;
      results: CoachCitationResult[];
    };

/** The sentence the card renders when nothing has been probed. */
export const NOT_MEASURED_REASON =
  "No answer engine has been asked any of these questions about you yet, so this report cannot say whether you were named in an answer. It does not say you were not: that would be a measurement nobody has made. What it can measure, it measures above.";

/**
 * Fold the recorded runs into the coach's own probe set.
 *
 * A run counts only when its query is one THIS coach's set contains: a row
 * recorded for a different coach's question is ignored rather than grafted onto
 * a query it never asked about. When no run survives that match, the answer is
 * the stated absence, not a page of "not cited" rows.
 */
export function coachCitationStatus(
  queries: CoachQuery[],
  runs: readonly CoachCitationRun[] = RECORDED_COACH_CITATION_RUNS,
): CoachCitationStatus {
  const byQuery = new Map<string, CoachCitationRun>();
  for (const run of runs) {
    const match = queries.find((q) => q.text === run.queryText);
    if (!match) continue;
    // First recorded run wins; a second row for the same query is a re-run and
    // belongs in its own dated set, not silently overwriting this one.
    if (!byQuery.has(match.text)) byQuery.set(match.text, run);
  }

  if (byQuery.size === 0) {
    return { measured: false, reason: NOT_MEASURED_REASON, probeSet: queries };
  }

  const results: CoachCitationResult[] = queries.map((query) => {
    const run = byQuery.get(query.text) ?? null;
    if (!run) return { query, state: "not-probed", run: null };
    return { query, state: run.cited ? "cited" : "not-cited", run };
  });

  // The earliest recorded date, so the card's "measured on" is a date every
  // row below it is at least as new as, rather than the newest row's date
  // standing in for rows that are older.
  const measuredOn = [...byQuery.values()].map((r) => r.measuredOn).sort()[0];
  return { measured: true, measuredOn, results };
}
