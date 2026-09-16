/**
 * The AI-readiness score: can an answer engine READ this profile?
 *
 * THE CHECK SET, AND WHY IT IS NOT THE HARNESS'S
 * ==============================================
 * geo_harness.py Panel A runs nine checks written for the learn/tool pages:
 * the 988 line surviving both extractors, a clinical disclaimer, a reviewer
 * surname, a "Last reviewed" date, the page's own probe string, a real PDF
 * href, plus three structural ones. Six of those nine describe furniture a
 * therapist profile does not have and should not have. Reusing them verbatim
 * would fail every profile on both SAFETY checks and score the whole cohort
 * red for being profiles, which is a card nobody would ever open twice.
 *
 * So the transferable subset is taken and the rest is replaced with checks a
 * profile can actually pass or fail:
 *
 *   from the harness   C7 -> main_region         (widened: <main> counts, not just <article>)
 *                      C6 -> extraction_yield    (0.60, the harness's own threshold)
 *                      C9 -> script_locked_words (widened past window.TEST/TOOL)
 *                            passages            (the harness's ~110-word packing)
 *   profile-specific   core_fields               (name, credential, city in the no-JS text)
 *                      person_jsonld             (a Person node that names HER)
 *
 * C1-C5 and C8 are explicitly OUT OF PROFILE SCOPE and the card says so, so
 * that "we only ran six checks" is a stated fact rather than a silent one.
 *
 * WHAT THIS DOES NOT MEASURE. Whether any engine cited her, or ever will. See
 * landscape.ts: that side is hand-recorded monthly across the whole site by
 * the harness's own design, and no per-profile citation signal exists.
 */
import {
  hasNoindex,
  jsonLdBlocks,
  mainRegion,
  passages,
  recallText,
  scriptLockedWords,
  stripTags,
  words,
} from "@/lib/ai-readiness/extract";

export type CheckId =
  | "main_region"
  | "extraction_yield"
  | "script_locked_words"
  | "passages"
  | "core_fields"
  | "person_jsonld";

export const CHECK_ORDER: readonly CheckId[] = [
  "main_region",
  "extraction_yield",
  "script_locked_words",
  "passages",
  "core_fields",
  "person_jsonld",
];

export type CheckClass = "STRUCTURE" | "SUBSTANCE" | "IDENTITY";

export type Check = {
  id: CheckId;
  cls: CheckClass;
  label: string;
  passed: boolean;
  /** What was measured, in a sentence a therapist can check herself. */
  detail: string;
  /** Present only when the check failed. One concrete thing to change. */
  fix: string | null;
};

export type Verdict = "readable" | "partial" | "blocked";

export type Metrics = {
  servedWords: number;
  recallWords: number;
  mainWords: number;
  extractionYield: number;
  retrievableRatio: number;
  passages: number;
  scriptLockedWords: number;
};

export type ProfileFacts = {
  name: string;
  credential: string | null;
  city: string | null;
};

export type ReadinessReport = {
  verdict: Verdict;
  /** Set only when the verdict is "blocked": the one thing standing in the way. */
  blockedReason: string | null;
  checks: Check[];
  fixes: string[];
  metrics: Metrics;
  /** The checks the harness runs that a profile is not expected to carry. */
  outOfScope: readonly string[];
};

/** The harness's C6 threshold, kept rather than re-picked. */
const YIELD_FLOOR = 0.6;

/** Two ~110-word packs: below this there is nothing to retrieve a paragraph from. */
const PASSAGE_FLOOR = 2;

export const OUT_OF_SCOPE: readonly string[] = [
  "the 988 crisis line and the clinical disclaimer (checked on our learn pages, not on profiles)",
  "a named reviewer and a last-reviewed date (an editorial claim a profile does not make)",
  "a downloadable PDF (an artifact a profile does not publish)",
];

const round = (n: number) => Math.round(n * 1000) / 1000;

function present(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.trim().toLowerCase());
}

/** Every `@type` on a node, whether it was a string or an array. */
function typesOf(node: Record<string, unknown>): string[] {
  const t = node["@type"];
  if (typeof t === "string") return [t];
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === "string");
  return [];
}

/** Walks @graph and nested objects: a Person can be either. */
function findPersonNamed(payload: unknown, name: string): boolean {
  if (Array.isArray(payload)) return payload.some((p) => findPersonNamed(p, name));
  if (typeof payload !== "object" || payload === null) return false;
  const node = payload as Record<string, unknown>;
  const types = typesOf(node);
  const isPerson = types.some((t) => /^(Person|Psychologist|Physician)$/i.test(t));
  if (isPerson && typeof node.name === "string") {
    const a = node.name.replace(/\s+/g, " ").trim().toLowerCase();
    const b = name.replace(/\s+/g, " ").trim().toLowerCase();
    if (a === b) return true;
  }
  return Object.values(node).some((v) => findPersonNamed(v, name));
}

export function scoreProfileHtml(html: string, facts: ProfileFacts): ReadinessReport {
  const served = stripTags(html);
  const recall = recallText(html);
  const region = mainRegion(html);
  const main = region === null ? "" : stripTags(region);

  const servedWords = words(served);
  const recallWords = words(recall);
  const mainWords = words(main);
  const locked = scriptLockedWords(html);
  const packs = passages(main);

  const metrics: Metrics = {
    servedWords,
    recallWords,
    mainWords,
    extractionYield: recallWords ? round(mainWords / recallWords) : 0,
    // The harness's own ratio: how much of everything served (including words
    // locked inside scripts) survives into the chrome-stripped extraction.
    retrievableRatio: servedWords + locked ? round(recallWords / (servedWords + locked)) : 0,
    passages: packs,
    scriptLockedWords: locked,
  };

  const checks: Check[] = [];

  checks.push({
    id: "main_region",
    cls: "STRUCTURE",
    label: "Your page has a main content region",
    passed: region !== null,
    detail:
      region !== null
        ? "An extractor can lock onto the main region of your page and skip the site chrome."
        : "Your page has no <main> or <article> element, so an extractor has to guess which part of it is you.",
    fix: region !== null ? null : "Wrap the profile body in a <main> element.",
  });

  const yieldOk = metrics.extractionYield >= YIELD_FLOOR;
  checks.push({
    id: "extraction_yield",
    cls: "STRUCTURE",
    label: "Most of your writing sits inside that region",
    passed: yieldOk,
    detail: `${Math.round(metrics.extractionYield * 100)}% of your page's text is inside the main region (${mainWords} of ${recallWords} words). The bar is ${Math.round(YIELD_FLOOR * 100)}%.`,
    fix: yieldOk
      ? null
      : "Move the stranded text inside the main region. Anything outside it is text an extractor is likely to drop.",
  });

  checks.push({
    id: "script_locked_words",
    cls: "SUBSTANCE",
    label: "None of your writing is locked inside a script",
    passed: locked === 0,
    detail:
      locked === 0
        ? "Everything an engine reads is in the page itself, not only in the JavaScript."
        : `${locked} words appear only inside a script payload and never in the page text.`,
    fix:
      locked === 0
        ? null
        : "Render that text into the page itself. Words that exist only in JavaScript are words a retrieval crawler does not have.",
  });

  const packsOk = packs >= PASSAGE_FLOOR;
  checks.push({
    id: "passages",
    cls: "SUBSTANCE",
    label: "There is enough of you to quote",
    passed: packsOk,
    detail: `Your main region offers ${packs} retrievable ${packs === 1 ? "passage" : "passages"} of roughly a paragraph each. The bar is ${PASSAGE_FLOOR}.`,
    fix: packsOk
      ? null
      : "Write more in your own words: how you work, who you work with, what a first session is like. Two full paragraphs is the floor.",
  });

  const wanted: [string, string | null][] = [
    ["name", facts.name],
    ["credential", facts.credential],
    ["city", facts.city],
  ];
  // A fact we do not hold is SKIPPED, never failed: a therapist who has not
  // told us her city has not made her page unreadable, and marking her red for
  // our own empty column would be scoring our record instead of her page.
  const checked = wanted.filter((entry): entry is [string, string] => Boolean(entry[1]));
  const missing = checked.filter(([, value]) => !present(served, value)).map(([field]) => field);
  checks.push({
    id: "core_fields",
    cls: "IDENTITY",
    label: "Your name, credential and city are in the page text",
    passed: missing.length === 0,
    detail:
      missing.length === 0
        ? `Every fact we hold about you (${checked.map(([f]) => f).join(", ") || "none on file"}) appears in the text an engine reads.`
        : `These are missing from the page text an engine reads: ${missing.join(", ")}.`,
    fix:
      missing.length === 0
        ? null
        : `Make sure your ${missing.join(" and ")} appears as text on the page, not only in an image or a heading built by JavaScript.`,
  });

  const personOk = jsonLdBlocks(html).some((b) => findPersonNamed(b, facts.name));
  checks.push({
    id: "person_jsonld",
    cls: "IDENTITY",
    label: "Your page carries structured data naming you",
    passed: personOk,
    detail: personOk
      ? "A Person record in the page's structured data names you, so an engine does not have to infer who the page is about."
      : "The page carries no readable Person record naming you in its structured data.",
    fix: personOk
      ? null
      : "This one is ours, not yours. Tell us and we will add the Person record to your profile page.",
  });

  const noindex = hasNoindex(html);
  let verdict: Verdict;
  let blockedReason: string | null = null;
  if (noindex) {
    verdict = "blocked";
    blockedReason =
      "Your page tells search engines noindex, so nothing below is reachable by them yet. That is your plan's publishing setting, not a fault in your page.";
  } else if (region === null || mainWords === 0) {
    verdict = "blocked";
    blockedReason =
      "There is no main content region on your page, so an extractor has nothing to lock onto.";
  } else {
    verdict = checks.every((c) => c.passed) ? "readable" : "partial";
  }

  return {
    verdict,
    blockedReason,
    checks,
    fixes: checks.filter((c) => !c.passed && c.fix).map((c) => c.fix as string),
    metrics,
    outOfScope: OUT_OF_SCOPE,
  };
}
