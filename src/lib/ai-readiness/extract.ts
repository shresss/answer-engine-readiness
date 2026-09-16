/**
 * Extraction primitives for the AI-readiness report, ported from the GEO
 * harness (the original GEO harness (not included)) and
 * DELIBERATELY dependency-free.
 *
 * WHY A PORT AND NOT THE HARNESS ITSELF. The harness is Python and its Panel A
 * runs `trafilatura.extract` and `readability.Document`. Neither library is in
 * services/requirements.txt, and adding two extraction dependencies to the API
 * process to render one dashboard card is a cost this card does not justify,
 * so the scorer lives in the Next tier, where the page it scores is rendered,
 * and the two extractions are reimplemented here in about eighty lines with no
 * dependency at all. What is REUSED verbatim is the harness's arithmetic: the
 * tag-stripping shape, the ~110-word passage packing, the script-payload word
 * count, and the 0.60 yield threshold. What is NOT reused is any claim that
 * this produces the same numbers trafilatura would; it does not, and the card
 * says which method it used.
 *
 * The harness's Panel A check list is a LEARN-ARTICLE list (988 line, clinical
 * disclaimer, reviewer surname, "last reviewed", a probe string, a PDF href).
 * A therapist profile has none of that furniture, so reusing those checks would
 * score every profile red for the crime of being a profile. score.ts defines
 * the profile-applicable set instead; this file only measures.
 */

const TAG = /<[^>]+>/g;
const WS = /\s+/g;

/** Tags whose CONTENT is not page text: removed body and all. Harness parity. */
const NON_TEXT = /<(script|style|svg|noscript|template)\b[^>]*>[\s\S]*?<\/\1>/gi;

/** Site chrome: present on every page, and not what an engine is retrieving. */
const CHROME = /<(nav|footer|aside)\b[^>]*>[\s\S]*?<\/\1>/gi;

/** All visible text of a fragment, with script/style/svg bodies discarded. */
export function stripTags(html: string): string {
  return html.replace(NON_TEXT, " ").replace(TAG, " ").replace(WS, " ").trim();
}

/** Text with the site chrome removed too: the recall-favouring extraction. */
export function recallText(html: string): string {
  return stripTags(html.replace(CHROME, " "));
}

/** Whitespace word count. Empty and whitespace-only inputs are zero, not one. */
export function words(s: string | null | undefined): number {
  if (!s) return 0;
  return s.split(/\s+/).filter(Boolean).length;
}

/**
 * The inner HTML of the first `tag` element, counting NESTED opens so that a
 * `<main>` containing another `<main>` does not end at the inner close tag.
 * Returns null when the element is absent, "" when it is self-closed or empty.
 */
export function extractElement(html: string, tag: string): string | null {
  const open = new RegExp(`<${tag}\\b[^>]*>`, "i").exec(html);
  if (!open) return null;
  if (open[0].endsWith("/>")) return "";
  const start = open.index + open[0].length;
  const scan = new RegExp(`<${tag}\\b[^>]*>|</${tag}\\s*>`, "gi");
  scan.lastIndex = start;
  let depth = 1;
  let hit: RegExpExecArray | null;
  while ((hit = scan.exec(html)) !== null) {
    if (hit[0].startsWith("</")) {
      depth -= 1;
      if (depth === 0) return html.slice(start, hit.index);
    } else if (!hit[0].endsWith("/>")) {
      depth += 1;
    }
  }
  // An unclosed element: everything after the open tag is the best honest read.
  return html.slice(start);
}

/**
 * The main content region an extractor would lock onto: <article> if the page
 * offers one, else <main>. Null when the page offers neither, which is the
 * condition score.ts reports as blocked rather than as a low number.
 */
export function mainRegion(html: string): string | null {
  return extractElement(html, "article") ?? extractElement(html, "main");
}

/**
 * Approximate retrieval passages: ~110-word packs on sentence boundaries.
 * Ported line for line from geo_harness.passages, including the rule that a
 * trailing scrap under 40 words is not a passage.
 */
export function passages(text: string | null | undefined, target = 110): number {
  const sentences = (text ?? "").split(/(?<=[.!?])\s+/);
  let out = 0;
  let cur = 0;
  for (const s of sentences) {
    cur += words(s);
    if (cur >= target) {
      out += 1;
      cur = 0;
    }
  }
  return out + (cur > 40 ? 1 : 0);
}

/**
 * Words that live in a script payload and NOWHERE in the document text.
 *
 * The harness scans `window.TEST` / `window.TOOL` because those were the two
 * blobs its learn pages hid content in. A therapist profile has no such
 * convention, so the scan is widened to every script body and narrowed by the
 * harness's own two filters, kept verbatim: a string literal must be at least
 * twelve characters, must contain two adjacent word-like tokens
 * (`[a-z]{3}\s+[a-z]{3}`), and must not be a URL.
 *
 * JSON-LD IS DELIBERATELY EXEMPT. `application/ld+json` is structured data an
 * engine is MEANT to read; counting it as "locked" would mark the one script
 * on the page that helps as the defect, and would fail every profile that
 * ships a correct Person node. The check is about prose that only the browser
 * can see, not about machine-readable markup.
 */
export function scriptLockedWords(html: string): number {
  const dom = stripTags(html).toLowerCase();
  const scripts = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let total = 0;
  let script: RegExpExecArray | null;
  while ((script = scripts.exec(html)) !== null) {
    if (/type\s*=\s*["']?application\/ld\+json/i.test(script[1] ?? "")) continue;
    const body = script[2] ?? "";
    const literals = /"((?:[^"\\]|\\.){12,})"/g;
    let lit: RegExpExecArray | null;
    while ((lit = literals.exec(body)) !== null) {
      const text = lit[1].replace(/\\"/g, '"').replace(/\\n/g, " ");
      if (text.startsWith("http")) continue;
      if (!/[a-z]{3}\s+[a-z]{3}/i.test(text)) continue;
      if (!dom.includes(text.toLowerCase().slice(0, 60))) total += words(text);
    }
  }
  return total;
}

/** Every parsed JSON-LD payload on the page. Malformed blocks are skipped. */
export function jsonLdBlocks(html: string): unknown[] {
  const scripts = /<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;
  const out: unknown[] = [];
  let hit: RegExpExecArray | null;
  while ((hit = scripts.exec(html)) !== null) {
    try {
      out.push(JSON.parse(hit[1]));
    } catch {
      // A block we cannot parse is a block an engine cannot parse either. It
      // is dropped here and the check that wanted it fails, which is the
      // honest outcome; it must never throw and take the dashboard with it.
    }
  }
  return out;
}

/** True when the served HTML tells crawlers not to index this page. */
export function hasNoindex(html: string): boolean {
  const metas = /<meta\b[^>]*>/gi;
  let hit: RegExpExecArray | null;
  while ((hit = metas.exec(html)) !== null) {
    const tag = hit[0];
    if (!/name\s*=\s*["']?robots["']?/i.test(tag)) continue;
    const content = /content\s*=\s*["']([^"']*)["']/i.exec(tag);
    if (content && /\bnoindex\b/i.test(content[1])) return true;
  }
  return false;
}
