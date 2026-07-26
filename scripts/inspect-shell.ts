/** Diagnostic: what IS the 8391-byte shell? Structure only, no personal data. */
import { authedFetch } from "../lib/academia/client";
import { loadSession } from "../lib/academia/session-store";

async function main() {
  const session = loadSession();
  if (!session) {
    console.error("No saved session. Run scripts/save-session.ts first.");
    process.exit(1);
  }
  const fetchAs = authedFetch(session);

  const path = "/srm_university/academia-academic-services/page/My_Time_Table";
  const res = await fetchAs(path);
  const html = await res.text();

  console.log("PATH:", path);
  console.log("status:", res.status, "bytes:", html.length);
  console.log("title:", html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim());

  // Is this a login / redirect page, or the app bootstrap?
  const markers = {
    login: /login|signin|sign in|password/i.test(html),
    redirect: /window\.location|location\.href|location\.replace/i.test(html),
    zohoCreator: /ZC\.|zoho.*creator|creatorapp|zc_config/i.test(html),
    iframe: /<iframe/i.test(html),
    appLinkName: /appLinkName|viewLinkName|pageLinkName|zc_pageName/i.test(html),
  };
  console.log("markers:", JSON.stringify(markers));

  // Script srcs (reveal which Zoho app bundle loads).
  const scripts = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)]
    .map((m) => m[1])
    .slice(0, 15);
  console.log("\nscript srcs:");
  scripts.forEach((s) => console.log("  " + s));

  // Any embedded config object keys (Zoho drops a config blob inline).
  const cfg = html.match(/(?:ZC_CONFIG|zc_config|pageConfig|window\.\w+Config)\s*=\s*(\{[\s\S]{0,600}?\})/i);
  if (cfg) console.log("\ninline config blob (first 600 chars):\n", cfg[1]);

  // Any absolute/relative API-ish paths mentioned in the shell.
  const paths = [
    ...new Set(
      [...html.matchAll(/["'](\/[a-z_][\w/.\-]*(?:viewLinkName|json|api|getRecords|report)[\w/.\-]*)["']/gi)].map(
        (m) => m[1],
      ),
    ),
  ].slice(0, 20);
  console.log("\napi-ish paths found:", paths.length);
  paths.forEach((p) => console.log("  " + p));

  // Raw head so I can see the exact bootstrap (structure, not personal data).
  console.log("\n--- first 1200 chars ---");
  console.log(html.slice(0, 1200).replace(/\s+/g, " "));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
