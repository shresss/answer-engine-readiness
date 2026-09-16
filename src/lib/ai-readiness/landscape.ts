/**
 * The citation landscape, hand-recorded once and dated.
 *
 * THIS IS NOT A MEASUREMENT OF HER PROFILE, and the card says so in the words
 * below rather than in a footnote. The GEO harness separates its two panels on
 * purpose: Panel A (extractability) is automated and deterministic, which is
 * what the report scores; Panel B (citations) "reads a hand-recorded TSV
 * (engines cannot be driven headlessly)". There is therefore NO automated
 * per-therapist cited/not-cited signal anywhere in this system, and any card
 * that implied one would be inventing it.
 *
 * Source: a hand-recorded run over a fixed question set (the original client's
 * recorded numbers are not published here; the rows below are the SHAPE, with
 * zero counts, until you record your own run). The two largest answer engines by
 * usage, Google AI Overviews and ChatGPT search, could not be measured at all
 * (an anti-automation interstitial and an authentication wall respectively),
 * and that gap is stated on the card, not buried in the source file.
 *
 * When the next monthly Panel B run lands, edit this file and nothing else.
 */

export type LandscapeRow = {
  channel: string;
  sources: number;
  appearances: number;
  note: string;
};

export const CITATION_LANDSCAPE = {
  measuredOn: "2026-08-19",
  headline:
    "EXAMPLE LANDSCAPE. Replace this sentence with the one-line result of your own hand-recorded run: how many sources the answer channels drew on, and how often your site appeared among them.",
  rows: [
    {
      channel: "Perplexity",
      sources: 0,
      appearances: 0,
      note: "example row: inline citations plus the displayed source panel",
    },
    {
      channel: "Claude web search",
      sources: 0,
      appearances: 0,
      note: "example row: the retrieval layer, recorded verbatim",
    },
    {
      channel: "Bing organic",
      sources: 0,
      appearances: 0,
      note: "example row: top-10 organic results",
    },
  ] as LandscapeRow[],
  unmeasured: [
    "Google AI Overviews (an anti-automation interstitial; zero questions recorded)",
    "ChatGPT search (an authentication wall; zero questions recorded)",
    "Bing Copilot (an empty application shell; zero answers recorded)",
  ],
  caveat:
    "This landscape is hand-recorded once a month across the whole site and is not a measurement of your profile. Nothing here says whether an engine has read, or will read, your page. What this report measures is the part we can measure: whether your page can be read at all.",
} as const;
