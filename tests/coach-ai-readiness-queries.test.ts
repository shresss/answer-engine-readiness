import { describe, expect, test } from "vitest";
import {
  CLINICAL_QUERY_TOKENS,
  MAX_COACH_QUERIES,
  coachQueryGuard,
  coachQuerySet,
} from "@/lib/coach-ai-readiness/queries";
import { COACH_AREAS } from "@/lib/coach-constants";

/**
 * The coach-shaped probe set, and the line it may never cross.
 *
 * The therapist landscape's forty questions are symptom phrasings ("why am i
 * sad for no reason", geo-2026-08-19/queries-40.tsv). A coach probe set built
 * on that shape would breach the coaching-language boundary on the coach's own
 * dashboard, so the boundary here is STRUCTURAL: every generated query runs
 * through `coachQueryGuard` before it can be returned, and a query that trips
 * it is dropped rather than rendered.
 */

const FACTS = {
  displayName: "Marisol Reyes",
  city: "Austin",
  coachingAreas: ["Career", "Leadership"],
  meetingTypes: ["Virtual", "In-person"],
};

describe("the shapes", () => {
  test("a coach with a name, a city and areas gets name, niche and metro queries", () => {
    const set = coachQuerySet(FACTS);
    const kinds = new Set(set.map((q) => q.kind));
    expect(kinds.has("name")).toBe(true);
    expect(kinds.has("niche")).toBe(true);
    expect(kinds.has("niche-metro")).toBe(true);
  });

  test("every query names the coach, one of her areas, or her city", () => {
    for (const q of coachQuerySet(FACTS)) {
      const t = q.text.toLowerCase();
      const hit =
        t.includes("marisol reyes") ||
        t.includes("austin") ||
        FACTS.coachingAreas.some((a) => t.includes(a.toLowerCase()));
      expect(hit, `"${q.text}" names none of the coach's own facts`).toBe(true);
    }
  });

  test("the word coach or coaching is in every query: this is the coach lane, not the therapist one", () => {
    for (const q of coachQuerySet(FACTS)) {
      expect(q.text.toLowerCase()).toMatch(/\bcoach(ing)?\b/);
    }
  });

  test("a virtual-only coach gets an online query, an in-person-only coach does not", () => {
    const virtual = coachQuerySet({ ...FACTS, meetingTypes: ["Virtual"] });
    expect(virtual.some((q) => q.kind === "virtual-niche")).toBe(true);
    const inPerson = coachQuerySet({ ...FACTS, meetingTypes: ["In-person"] });
    expect(inPerson.some((q) => q.kind === "virtual-niche")).toBe(false);
  });

  test("the set is deduplicated and bounded", () => {
    const set = coachQuerySet({
      ...FACTS,
      coachingAreas: [...COACH_AREAS],
    });
    expect(set.length).toBeLessThanOrEqual(MAX_COACH_QUERIES);
    expect(new Set(set.map((q) => q.text)).size).toBe(set.length);
    expect(new Set(set.map((q) => q.id)).size).toBe(set.length);
  });

  test("a fact we do not hold produces no query built on it, and never an empty slot", () => {
    const noCity = coachQuerySet({ ...FACTS, city: "" });
    expect(noCity.some((q) => q.kind === "niche-metro")).toBe(false);
    for (const q of noCity) expect(q.text.trim()).toBe(q.text);

    const nothing = coachQuerySet({
      displayName: "",
      city: "",
      coachingAreas: [],
      meetingTypes: [],
    });
    expect(nothing).toEqual([]);
  });
});

describe("the coaching-language boundary, structurally", () => {
  test("the guard refuses therapy, counseling and clinical phrasings", () => {
    for (const bad of [
      "therapy coach in Austin",
      "counseling coach near me",
      "coach who can diagnose burnout",
      "coach for treatment of anxiety",
      "clinical coach Austin",
      "psychologist coach Austin",
    ]) {
      expect(coachQueryGuard(bad).ok, `"${bad}" was allowed`).toBe(false);
    }
  });

  test("the guard refuses symptom phrasings, the exact shape the therapist landscape uses", () => {
    for (const bad of [
      "why am i sad for no reason coach",
      "coach for depression",
      "adhd coach Austin",
      "trauma coach Austin",
    ]) {
      expect(coachQueryGuard(bad).ok, `"${bad}" was allowed`).toBe(false);
    }
  });

  test("the guard allows ordinary coaching phrasings", () => {
    for (const good of [
      "career coach in Austin",
      "executive coaching Austin",
      "Marisol Reyes coach",
      "online leadership coach",
      "health & habits coach in Austin",
    ]) {
      expect(coachQueryGuard(good).ok, `"${good}" was refused`).toBe(true);
    }
  });

  test("every token the guard blocks is matched on a word boundary, not a substring", () => {
    // "Treat" is a surname before it is a clinical verb, and a guard that eats
    // surnames is a guard the next lane deletes.
    expect(coachQueryGuard("Marcus Treatwell coach").ok).toBe(true);
    expect(coachQueryGuard("Therese Coachman coach").ok).toBe(true);
    expect(CLINICAL_QUERY_TOKENS.length).toBeGreaterThan(10);
  });

  test("a coach whose own name carries clinical vocabulary loses those queries, she does not publish them", () => {
    const set = coachQuerySet({
      ...FACTS,
      displayName: "Anxiety Therapy Collective",
    });
    for (const q of set) expect(coachQueryGuard(q.text).ok).toBe(true);
    expect(set.some((q) => q.kind === "name")).toBe(false);
  });

  test("every generated query passes the guard, for every area the taxonomy allows", () => {
    for (const area of COACH_AREAS) {
      const set = coachQuerySet({ ...FACTS, coachingAreas: [area] });
      expect(set.length).toBeGreaterThan(0);
      for (const q of set) {
        expect(coachQueryGuard(q.text).ok, `"${q.text}" tripped its own guard`).toBe(true);
      }
    }
  });
});
