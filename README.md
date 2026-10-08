# answer-engine-readiness

A small TypeScript library that answers a narrow question honestly: **can an AI answer engine read this profile page, and what would someone have to ask before the page could come up?**

It came out of a therapist and coach directory I built during a 2026 contract, where the product promise was "be findable by AI." The first version of the feature I wrote implied more than we could measure. This is the rewrite: it scores what is measurable, generates the probe set, and refuses to invent a citation result. Published with the client's permission, with the client's recorded data removed.

## What it does

1. **Extract** (`src/lib/ai-readiness/extract.ts`): parse a profile page's served HTML without a browser. Finds the main region, the share of visible text inside it, words locked in scripts, retrievable passages, identity facts present in the text, and the `Person` node in structured data.
2. **Score** (`src/lib/ai-readiness/score.ts`): turn those observations into a deterministic readiness report: ordered checks, each with a label, a detail, and a fix; an extraction yield; and a blocked reason when the page cannot be scored at all.
3. **Probe set** (`src/lib/coach-ai-readiness/queries.ts`): build the questions an answer engine would have to be asked for this profile to surface, from the profile's own facts (name, areas, metro, virtual or not). Every candidate passes through a vocabulary guard; a query that trips it is dropped, and the report says how many were withheld.
4. **Citation runs** (`src/lib/coach-ai-readiness/citation.ts`): record what an engine actually said, per engine, per date, per query, with the source it was written down in. A query with no recorded run is `not-probed`, which is a different word from `not-cited` on purpose.
5. **Report** (`src/lib/coach-ai-readiness/report.ts`): one measurement, one probe set, one stated absence, assembled for a dashboard card.

## What it deliberately does not do

It does not drive Perplexity, ChatGPT, Gemini, Claude, or Google AI Overviews headlessly. Those channels either block automation or sit behind authentication, so the citation landscape in `landscape.ts` is the *shape* of a hand-recorded monthly run, not an automated signal. Any card built on this library that implied an automated per-profile "cited" result would be inventing a measurement, and the tests in `tests/ai-readiness-score.test.ts` fail if the rendered copy ever claims one.

## Run it

```
npm install
npm test          # 45 tests
npm run typecheck
```

## Layout

```
src/lib/ai-readiness/         extract, score, landscape (shape only)
src/lib/coach-ai-readiness/   queries, citation, report
src/lib/coach-lint.ts         first-person clinical-claim lint used by the query guard
src/lib/coach-constants.ts    the coaching areas the probe set draws from
tests/                        vitest
```

The vocabulary is "coach" and "therapist" because that is the directory it was built for; the mechanics are those of any profile page.

## Design notes worth stealing

Measured versus stated. Every number the report shows is either computed from the HTML in front of it or carried with the date and the file it was recorded in. Nothing is interpolated.

Drop, do not soften. When a generated query contains vocabulary the platform must not put in front of a coach, the query is removed and counted, never rewritten. A silently short list is worse than a stated one.

The negative is a first-class value. `not-probed` exists so that "we have not asked" is never rendered as "no."

## Relationship to ai-visibility-probe

This library and [`ai-visibility-probe`](https://github.com/shresss/ai-visibility-probe) came out of the same contract and answer different questions under one rule. The probe asks the engines, through their official APIs and a SERP vendor, whether a subject is cited today, and records exactly what came back. This library scores a page for what an answer engine needs from it and records hand-run checks as observed, because the consumer products cannot be driven headlessly. Neither one claims a consumer-product citation it did not see: a query here is `cited`, `not-cited`, or `not-probed`, and nothing else.

## License

MIT
