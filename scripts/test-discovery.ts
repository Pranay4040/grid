/**
 * Safe self-test for the credential-free portion of the real client
 * (discoverService + lookup). No password involved. Confirms lib/academia
 * works against the live portal before anyone runs test-auth.ts.
 */
import { CookieJar } from "../lib/academia/cookies";
import { discoverService, lookup } from "../lib/academia/client";

async function main() {
  const { jar, service, csrf } = await discoverService(new CookieJar());
  console.log("discoverService →");
  console.log("  clientId :", service.clientId);
  console.log("  orgtype  :", service.orgtype);
  console.log("  lookupId :", service.lookupId);
  console.log("  appPrefix:", service.appPrefix);
  console.log("  csrf set :", Boolean(csrf));
  console.log("  cookies  :", jar.names().join(", "));

  // A deliberately nonexistent id: proves the lookup path + error mapping.
  const res = await lookup(jar, service, csrf, "zz.nonexistent.probe.0000");
  console.log("\nlookup(dummy) →");
  if (res.ok) {
    console.log("  UNEXPECTED ok for a fake user:", res.result);
  } else {
    console.log("  reason :", res.reason, "(expected: unknown_user)");
    console.log("  message:", res.message);
  }

  console.log(
    "\n" +
      (!res.ok && res.reason === "unknown_user"
        ? "✅ Client steps 1–3 verified against the live portal."
        : "⚠️ Unexpected result — inspect above."),
  );
}

main().catch((err) => {
  console.error("test-discovery crashed:", err);
  process.exit(1);
});
