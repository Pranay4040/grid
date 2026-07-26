/**
 * Theory test: the IAM session needs a final GET to the portal's
 * redirectFromLogin to mint the Creator app session. Uses one shared cookie
 * jar across both calls (authedFetch makes a fresh jar per call, so we drive
 * the jar directly here).
 */
import { CookieJar } from "../lib/academia/cookies";
import { loadSession, saveSession } from "../lib/academia/session-store";

const ORIGIN = "https://academia.srmist.edu.in";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

async function get(url: string, jar: CookieJar, ajax = false) {
  let current = url;
  for (let i = 0; i < 6; i++) {
    const res = await fetch(current, {
      redirect: "manual",
      headers: {
        "user-agent": UA,
        accept: "*/*",
        cookie: jar.header(),
        referer: `${ORIGIN}/`,
        ...(ajax
          ? {
              "x-requested-with": "XMLHttpRequest",
              "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
            }
          : {}),
      },
    });
    jar.absorb(res);
    const loc = res.headers.get("location");
    if (!loc) return res;
    current = new URL(loc, current).toString();
  }
  return null;
}

async function main() {
  const session = loadSession();
  if (!session) {
    console.error("No saved session.");
    process.exit(1);
  }
  const jar = CookieJar.fromJSON(session.cookies);
  console.log("start cookies:", jar.names().join(", "));

  // Step A: finalize the app session.
  const finalizeUrl = `${ORIGIN}/portal/academia-academic-services/redirectFromLogin`;
  const fin = await get(finalizeUrl, jar);
  console.log("\nredirectFromLogin →", fin?.status, "cookies now:", jar.names().length);
  console.log("new cookies:", jar.names().join(", "));

  // Step B: retry the data page with the (hopefully) upgraded jar.
  const dataUrl = `${ORIGIN}/srm_university/academia-academic-services/page/My_Time_Table`;
  const res = await get(dataUrl, jar, true);
  const html = (await res?.text()) ?? "";
  console.log("\nMy_Time_Table →", res?.status, "bytes:", html.length);
  console.log("title:", html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim());
  console.log("has <table>:", /<table/i.test(html));
  console.log("still login page:", /Web Services Login/i.test(html));

  // If it worked, persist the upgraded session so discovery can use it.
  if (!/Web Services Login/i.test(html) && html.length > 12000) {
    saveSession({ cookies: jar.toJSON(), expiresAt: session.expiresAt, issuedAt: session.issuedAt });
    console.log("\n✅ App session established — saved upgraded cookies.");
  } else {
    console.log("\n⚠️ Still not the data page. redirectFromLogin wasn't the missing step.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
