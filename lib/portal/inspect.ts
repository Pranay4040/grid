/**
 * Masked structural forensics on a page from a portal we have no client for.
 *
 * WHY THIS EXISTS: SRM's Student Portal publishes no API, so the only way to
 * read it is the same way `lib/academia/` reads Academia — replay the requests
 * the site's own frontend makes, then parse what comes back. Writing that
 * parser requires seeing the REAL markup. Guessing at response shapes is
 * exactly what produced the login misclassification bugs (see ROADMAP.md), so
 * this module exists to turn one captured response into something that can be
 * read, shared and reasoned about WITHOUT leaking the capture itself.
 *
 * Everything here is pure — body in, report string out. No fetching, no files,
 * no session. `scripts/capture-portal.ts` does the I/O; this does the thinking,
 * so it can be tested offline (`scripts/verify-portal-inspect.ts`).
 *
 * MASKING IS THE POINT. A real capture contains the student's name, register
 * number and live session cookies. Structure is what a parser needs; values are
 * not. digits -> #, letters -> x, which preserves format ("RA2111003010123"
 * -> "xx#############") while destroying content. This repo has already caught
 * one real PII leak from a probe script printing an unmasked cell; don't
 * loosen this.
 */

/** digits -> #, letters -> x. Preserves shape, destroys content. */
export function maskValue(s: string): string {
  return s.replace(/[0-9]/g, "#").replace(/[A-Za-z]/g, "x");
}

export function stripTags(s: string): string {
  return s
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Does this row look like column LABELS rather than data?
 *
 * Short cells with no long digit runs. Getting this wrong is how the earlier
 * probe leaked a register number: it printed a "header" row verbatim that was
 * actually a label/value data row.
 */
export function looksLikeHeaderRow(cells: string[]): boolean {
  if (cells.length < 2) return false;
  return cells.every((c) => c.length > 0 && c.length <= 40 && !/\d{4,}/.test(c));
}

/* ------------------------------ JSON shapes ------------------------------ */

/**
 * A JSON value's SHAPE: keys verbatim (they're the field names a parser needs),
 * leaves reduced to type + masked sample. Arrays collapse to their first
 * element so a 200-row response prints as one row.
 */
export function describeJson(value: unknown, indent = ""): string {
  const next = indent + "  ";
  if (value === null) return "null";
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return `[ (${value.length} items)\n${next}${describeJson(value[0], next)}\n${indent}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return "{}";
    const lines = entries.map(([k, v]) => `${next}${k}: ${describeJson(v, next)}`);
    return `{\n${lines.join("\n")}\n${indent}}`;
  }
  if (typeof value === "string") {
    return value.length > 60
      ? `string(${value.length}ch)`
      : `string "${maskValue(value)}"`;
  }
  return typeof value; // number | boolean
}

/* --------------------------- endpoint discovery --------------------------- */

/**
 * Paths and URLs referenced in the markup and its inline scripts.
 *
 * This is the highest-value thing in the file. "The portal has no API" almost
 * always means "no DOCUMENTED api" — the site's own JavaScript still calls
 * something to get its data, and THAT is what a client should target. Academia
 * taught this lesson already: its data pages return an 8KB shell unless the
 * request looks like the page's own XHR (CLAUDE.md fact 2).
 *
 * Static assets are filtered out — they're never the data source.
 */
export function findEndpointCandidates(body: string): string[] {
  const found = new Set<string>();
  const patterns = [
    /["'`](\/[A-Za-z0-9_\-./]{3,}(?:\?[^"'`\s]*)?)["'`]/g,
    /["'`](https?:\/\/[A-Za-z0-9_\-.]+\/[A-Za-z0-9_\-./]*(?:\?[^"'`\s]*)?)["'`]/g,
  ];
  for (const re of patterns) {
    for (const m of body.matchAll(re)) {
      const url = m[1];
      if (/\.(css|js|png|jpe?g|gif|svg|ico|woff2?|ttf|eot|map)(\?|$)/i.test(url)) continue;
      found.add(url);
    }
  }
  return [...found].sort();
}

/* ------------------------------ page shape ------------------------------- */

export type CaptureInput = {
  url: string;
  status: number;
  contentType: string;
  body: string;
};

/** Is this the portal's sign-in page rather than the data we asked for? */
export function looksLikeLogin(body: string): boolean {
  return /type=["']password["']|name=["']password["']|<form[^>]+login|signinFrame|\/login\b/i.test(
    body,
  );
}

function summarizeTables(html: string): string[] {
  const out: string[] = [];
  const tables = [...html.matchAll(/<table\b[\s\S]*?<\/table>/gi)].map((m) => m[0]);
  tables.forEach((table, i) => {
    const rows = table
      .split(/<\/tr>/i)
      .map((chunk) =>
        [...chunk.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) => stripTags(m[1])),
      )
      .filter((cells) => cells.length > 0);
    if (rows.length === 0) return;

    const widths = rows.map((r) => r.length);
    out.push(
      `  table[${i}] rows=${rows.length} cols=${Math.min(...widths)}..${Math.max(...widths)}`,
    );
    const first = rows[0];
    if (looksLikeHeaderRow(first)) {
      out.push(`    headers: ${first.join(" | ")}`);
      if (rows[1]) out.push(`    sample:  ${rows[1].map(maskValue).join(" | ")}`);
    } else {
      out.push(`    (no header row detected — all rows masked)`);
      out.push(`    sample:  ${first.map(maskValue).join(" | ")}`);
    }
  });
  return out;
}

/**
 * The whole report for one captured response. Safe to paste into a chat or an
 * issue: field NAMES and structure survive, values do not.
 */
export function summarizeResponse(input: CaptureInput): string {
  const { url, status, contentType, body } = input;
  const lines: string[] = [];
  lines.push(`URL:          ${url}`);
  lines.push(`HTTP:         ${status}`);
  lines.push(`Content-Type: ${contentType || "(none)"}`);
  lines.push(`Size:         ${body.length} bytes`);

  const isJson = /json/i.test(contentType) || /^\s*[[{]/.test(body);
  if (isJson) {
    try {
      lines.push("", "JSON SHAPE (keys real, values masked):");
      lines.push(describeJson(JSON.parse(body)));
      return lines.join("\n");
    } catch {
      lines.push("", "(looked like JSON but did not parse — treating as text)");
    }
  }

  if (looksLikeLogin(body)) {
    lines.push("", "!! This looks like a LOGIN page, not the data page.");
    lines.push("   The captured cookies are probably expired or wrong-scoped.");
  }

  const tables = summarizeTables(body);
  lines.push("", `TABLES: ${tables.length ? "" : "none found"}`);
  lines.push(...tables);

  const endpoints = findEndpointCandidates(body);
  lines.push("", `ENDPOINT CANDIDATES (${endpoints.length}) — what this page's own JS calls:`);
  lines.push(...endpoints.slice(0, 60).map((e) => `  ${e}`));
  if (endpoints.length > 60) lines.push(`  … ${endpoints.length - 60} more`);

  return lines.join("\n");
}
