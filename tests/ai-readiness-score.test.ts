import { describe, expect, test } from "vitest";
import {
  extractElement,
  passages,
  scriptLockedWords,
  stripTags,
  words,
} from "@/lib/ai-readiness/extract";
import { CHECK_ORDER, scoreProfileHtml } from "@/lib/ai-readiness/score";
import { CITATION_LANDSCAPE } from "@/lib/ai-readiness/landscape";

/**
 * The AI-readiness scorer, against fixture HTML only. No network anywhere in
 * this file, by construction: every input is a string literal.
 *
 * What is being pinned is the HONESTY of the verdicts, not their generosity.
 * The failure this suite exists to prevent is the one the plan's critique
 * named (F3): a card that scores every profile red because it reused checks
 * written for a different page type. So the "good" fixture below is a
 * plausible therapist profile: no reviewer byline, no "last reviewed", no
 * PDF, none of the learn-article furniture: and it must come back readable.
 */

const FACTS = { name: "Elena Vance", credential: "LCSW", city: "Portland" };

const BODY = `
  <p>Elena Vance, LCSW, is a therapist in Portland, Oregon. She works with adults
  who carry anxiety that arrived early and stayed. Sessions are fifty minutes and
  begin with what happened this week, not with a questionnaire. She has practiced
  for eleven years and sees clients on weekday mornings and two evenings.</p>
  <p>Her approach draws on acceptance and commitment therapy and on relational
  work. People often arrive after a period of trying to manage alone, and the
  first several sessions are spent understanding what that period cost. She is
  licensed in Oregon and her license was checked against the state board record.
  Fees are one hundred and eighty dollars per session and a limited number of
  reduced-fee hours are held open each term for clients between jobs.</p>
  <p>She offers both in-person appointments at her office and secure video
  sessions for anyone in Oregon. New clients can request a first appointment
  through this page, and she replies to most requests within two working days.</p>
  <p>Clients most often come to her for generalized anxiety, panic, grief after
  a death or a divorce, and the particular exhaustion of people who have been
  the reliable one in their family for a long time. She also works with adults
  who are reconsidering a career they trained years for. She does not treat
  active eating disorders and will say so at the first call rather than after
  three sessions, and she keeps a short list of colleagues she trusts for it.</p>
`;

function page(opts: {
  body?: string;
  main?: boolean;
  jsonLd?: string | null;
  robots?: string | null;
  extraScript?: string;
} = {}): string {
  const body = opts.body ?? BODY;
  const inner = opts.main === false ? body : `<main>${body}</main>`;
  const jsonLd =
    opts.jsonLd === undefined
      ? `<script type="application/ld+json">${JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Person",
          name: "Elena Vance",
        })}</script>`
      : opts.jsonLd === null
        ? ""
        : opts.jsonLd;
  const robots = opts.robots ? `<meta name="robots" content="${opts.robots}"/>` : "";
  return `<!doctype html><html><head><title>Elena Vance, LCSW</title>${robots}${jsonLd}</head>
    <body>
      <nav><a href="/">Home</a><a href="/directory">Directory</a></nav>
      <header><span>example-directory.com</span></header>
      ${inner}
      <footer><p>Example Directory</p></footer>
      ${opts.extraScript ?? ""}
    </body></html>`;
}

// --------------------------------------------------------------------------
// extraction primitives
// --------------------------------------------------------------------------

test("stripTags drops script, style and svg bodies rather than reading them as text", () => {
  const html = `<p>visible</p><script>var hidden = "not text";</script><style>.a{color:red}</style><svg><title>glyph</title></svg>`;
  expect(stripTags(html)).toBe("visible");
});

test("words counts on whitespace and answers zero for empty input", () => {
  expect(words("one two  three")).toBe(3);
  expect(words("")).toBe(0);
});

test("extractElement returns the inner html of a NESTED element, not the first close tag", () => {
  const html = `<body><main><div><main>inner</main></div>tail</main><footer>f</footer></body>`;
  expect(extractElement(html, "main")).toBe(`<div><main>inner</main></div>tail`);
  expect(extractElement(html, "article")).toBeNull();
});

test("passages packs roughly 110-word retrieval units and ignores a trailing scrap", () => {
  const sentence = `${"word ".repeat(59)}end.`; // 60 words
  // 120 words is ONE pack: the 10-word remainder is under the 40-word floor.
  expect(passages(`${sentence} ${sentence}`)).toBe(1);
  // 180 words is two: one full pack plus a 60-word remainder that clears it.
  expect(passages([sentence, sentence, sentence].join(" "))).toBe(2);
  expect(passages("Three words only.")).toBe(0);
});

test("script-locked words counts prose that lives ONLY in a script payload", () => {
  const html = `<body><p>on the page</p><script>window.TOOL = {"copy":"this sentence never reaches the document body at all"};</script></body>`;
  expect(scriptLockedWords(html)).toBeGreaterThan(0);
});

test("script-locked words ignores prose that IS in the document body", () => {
  const html = `<body><p>this sentence never reaches the document body at all</p><script>window.TOOL = {"copy":"this sentence never reaches the document body at all"};</script></body>`;
  expect(scriptLockedWords(html)).toBe(0);
});

test("script-locked words ignores JSON-LD, which is machine-readable on purpose", () => {
  const html = `<body><p>hi</p><script type="application/ld+json">{"description":"a sentence that appears nowhere in the visible body text"}</script></body>`;
  expect(scriptLockedWords(html)).toBe(0);
});

// --------------------------------------------------------------------------
// the report
// --------------------------------------------------------------------------

test("a plausible profile page scores readable, with every check green", () => {
  const report = scoreProfileHtml(page(), FACTS);
  expect(report.verdict).toBe("readable");
  expect(report.checks.filter((c) => !c.passed)).toEqual([]);
  expect(report.checks.map((c) => c.id)).toEqual([...CHECK_ORDER]);
  expect(report.fixes).toEqual([]);
});

test("no main or article region is BLOCKED, and says what to wrap", () => {
  const report = scoreProfileHtml(page({ main: false }), FACTS);
  expect(report.verdict).toBe("blocked");
  expect(report.blockedReason).toContain("main");
  expect(report.fixes.join(" ")).toContain("<main>");
});

test("a noindex directive is BLOCKED and is reported as a plan fact, not a defect", () => {
  const report = scoreProfileHtml(page({ robots: "noindex, follow" }), FACTS);
  expect(report.verdict).toBe("blocked");
  expect(report.blockedReason).toContain("noindex");
});

test("prose locked in a script payload fails a check and names the words", () => {
  const locked = `<script>window.PROFILE = {"bio":"a paragraph about her practice that the document body never shows to anyone"};</script>`;
  const report = scoreProfileHtml(page({ extraScript: locked }), FACTS);
  const check = report.checks.find((c) => c.id === "script_locked_words")!;
  expect(check.passed).toBe(false);
  expect(report.verdict).toBe("partial");
  expect(report.metrics.scriptLockedWords).toBeGreaterThan(0);
});

test("a missing Person node fails only the JSON-LD check", () => {
  const report = scoreProfileHtml(page({ jsonLd: null }), FACTS);
  expect(report.verdict).toBe("partial");
  expect(report.checks.filter((c) => !c.passed).map((c) => c.id)).toEqual(["person_jsonld"]);
});

test("JSON-LD naming a DIFFERENT person does not satisfy the check", () => {
  const other = `<script type="application/ld+json">{"@type":"Person","name":"Someone Else"}</script>`;
  const report = scoreProfileHtml(page({ jsonLd: other }), FACTS);
  expect(report.checks.find((c) => c.id === "person_jsonld")!.passed).toBe(false);
});

test("a Person inside an @graph counts", () => {
  const graph = `<script type="application/ld+json">${JSON.stringify({
    "@graph": [{ "@type": "WebPage" }, { "@type": ["Psychologist", "Person"], name: "Elena Vance" }],
  })}</script>`;
  expect(scoreProfileHtml(page({ jsonLd: graph }), FACTS).checks.find((c) => c.id === "person_jsonld")!.passed).toBe(true);
});

test("malformed JSON-LD is a failed check, never a thrown render", () => {
  const bad = `<script type="application/ld+json">{ not json at all </script>`;
  const report = scoreProfileHtml(page({ jsonLd: bad }), FACTS);
  expect(report.checks.find((c) => c.id === "person_jsonld")!.passed).toBe(false);
});

test("a profile whose city never reaches the no-JS text fails core fields and names the field", () => {
  const report = scoreProfileHtml(page(), { ...FACTS, city: "Bend" });
  const check = report.checks.find((c) => c.id === "core_fields")!;
  expect(check.passed).toBe(false);
  expect(check.detail).toContain("city");
});

test("a fact we do not hold is skipped, not failed", () => {
  const report = scoreProfileHtml(page(), { name: "Elena Vance", credential: null, city: null });
  expect(report.checks.find((c) => c.id === "core_fields")!.passed).toBe(true);
});

test("a thin profile fails the passages check instead of pretending it is retrievable", () => {
  const report = scoreProfileHtml(page({ body: "<p>Elena Vance, LCSW. Portland.</p>" }), FACTS);
  expect(report.checks.find((c) => c.id === "passages")!.passed).toBe(false);
  expect(report.metrics.passages).toBeLessThan(2);
});

test("content stranded outside the main region drags the extraction yield down", () => {
  const stranded = `<main><p>Elena Vance, LCSW, Portland.</p></main><div>${BODY}</div>`;
  const html = `<!doctype html><html><body>${stranded}</body></html>`;
  const report = scoreProfileHtml(html, FACTS);
  const check = report.checks.find((c) => c.id === "extraction_yield")!;
  expect(check.passed).toBe(false);
  expect(report.metrics.extractionYield).toBeLessThan(0.6);
});

// --------------------------------------------------------------------------
// copy honesty: the reason this feature was renamed
// --------------------------------------------------------------------------

describe("the report never claims an engine cited her", () => {
  const report = scoreProfileHtml(page(), FACTS);
  const prose = [
    ...report.checks.flatMap((c) => [c.label, c.detail, c.fix ?? ""]),
    ...report.fixes,
    report.blockedReason ?? "",
    CITATION_LANDSCAPE.headline,
    CITATION_LANDSCAPE.caveat,
    ...CITATION_LANDSCAPE.rows.map((r) => `${r.channel} ${r.note}`),
  ].join(" ");

  test.each(["cites you", "citing you", "we rank", "guarantee", "will be cited"])(
    "no sentence contains %s",
    (banned) => {
      expect(prose.toLowerCase()).not.toContain(banned);
    },
  );

  test("the landscape carries its measurement date and its own limits", () => {
    expect(CITATION_LANDSCAPE.measuredOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(CITATION_LANDSCAPE.caveat.toLowerCase()).toContain("hand-recorded");
    expect(CITATION_LANDSCAPE.caveat.toLowerCase()).toContain("not a measurement of your profile");
  });
});
