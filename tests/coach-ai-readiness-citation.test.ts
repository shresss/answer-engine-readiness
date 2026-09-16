import { describe, expect, test } from "vitest";
import {
  RECORDED_COACH_CITATION_RUNS,
  coachCitationStatus,
  type CoachCitationRun,
} from "@/lib/coach-ai-readiness/citation";
import { coachQuerySet } from "@/lib/coach-ai-readiness/queries";

/**
 * THE NO-OVERCLAIM RULE, as a test rather than a promise.
 *
 * "Cited" and "not cited" are statements about a probe that ran. Nothing in
 * this system probes an answer engine for a coach: the GEO harness's Panel B
 * is hand-recorded by its own design, and the one recorded landscape we hold
 * (geo-2026-08-19) asked forty MENTAL-HEALTH questions about the whole site.
 * So the recorded coach set is empty, and an empty set must produce a stated
 * absence, never a "not cited" verdict, which is a measurement nobody made.
 */

const FACTS = {
  displayName: "Marisol Reyes",
  city: "Austin",
  coachingAreas: ["Career"],
  meetingTypes: ["Virtual"],
};

const QUERIES = coachQuerySet(FACTS);

describe("with nothing recorded", () => {
  test("the shipped recorded set is empty: no coach probe has ever run", () => {
    expect(RECORDED_COACH_CITATION_RUNS).toEqual([]);
  });

  test("an empty recorded set is 'not measured', never 'not cited'", () => {
    const status = coachCitationStatus(QUERIES, []);
    expect(status.measured).toBe(false);
    if (status.measured) throw new Error("unreachable");
    expect(status.reason.toLowerCase()).toContain("not");
    expect(status.probeSet).toEqual(QUERIES);
  });

  test("the default argument is the shipped set, so the card cannot opt into a claim", () => {
    expect(coachCitationStatus(QUERIES).measured).toBe(false);
  });
});

describe("with a recorded run", () => {
  const RUN: CoachCitationRun = {
    measuredOn: "2026-09-01",
    engine: "Perplexity",
    queryText: QUERIES[0].text,
    cited: true,
    source: "fixture",
  };

  test("only the query that was actually probed carries a verdict", () => {
    const status = coachCitationStatus(QUERIES, [RUN]);
    expect(status.measured).toBe(true);
    if (!status.measured) throw new Error("unreachable");
    const probed = status.results.filter((r) => r.state !== "not-probed");
    expect(probed).toHaveLength(1);
    expect(probed[0].query.text).toBe(QUERIES[0].text);
    expect(probed[0].state).toBe("cited");
  });

  test("every other query is 'not-probed', which is not 'not-cited'", () => {
    const status = coachCitationStatus(QUERIES, [RUN]);
    if (!status.measured) throw new Error("unreachable");
    for (const r of status.results.slice(1)) {
      expect(r.state).toBe("not-probed");
    }
    expect(status.results.some((r) => r.state === "not-cited")).toBe(false);
  });

  test("a recorded miss reports not-cited, and only for the query it probed", () => {
    const status = coachCitationStatus(QUERIES, [{ ...RUN, cited: false }]);
    if (!status.measured) throw new Error("unreachable");
    expect(status.results[0].state).toBe("not-cited");
    expect(status.results.filter((r) => r.state === "not-cited")).toHaveLength(1);
  });

  test("a run for a query this coach does not hold is ignored, never grafted on", () => {
    const status = coachCitationStatus(QUERIES, [
      { ...RUN, queryText: "some other coach's query" },
    ]);
    expect(status.measured).toBe(false);
  });

  test("the measured date is the run's own, never today's clock", () => {
    const status = coachCitationStatus(QUERIES, [RUN]);
    if (!status.measured) throw new Error("unreachable");
    expect(status.measuredOn).toBe("2026-09-01");
  });
});
