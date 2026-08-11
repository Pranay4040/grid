/**
 * Regression check for the "login keeps failing on a correct password" bug.
 *
 * loadDashboard() used to map "either parser returned null" straight to
 * `session_expired`, on the assumption that a null parse could ONLY mean
 * Academia had served its logged-out shell. It can also mean the session is
 * perfectly alive and SRM renamed the page — and when that happened the app
 * told users their session had expired, sent them to /login, accepted a
 * correct password, redirected back, and said it again. Forever.
 *
 * These checks pin the distinction: a page carrying a view container is an
 * AUTHENTICATED response no matter what's inside it, and only the portal's
 * actual sign-in shell counts as logged out.
 *
 * Pure/offline — fixtures only, no session or network needed.
 */
import {
  classifyPage,
  parseTimetable,
  resolveView,
  viewContainerNames,
} from "../lib/academia/parse";
import {
  getTimetable,
  timetableViewCandidates,
  TIMETABLE_VIEW,
} from "../lib/academia/data";
import type { FetchAs } from "../lib/academia/client";
import { CookieJar } from "../lib/academia/cookies";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (!ok) {
    failures++;
    console.log(`  expected: ${expected}\n  actual:   ${actual}`);
  }
}

/* ------------------------------- fixtures ------------------------------- */

/** A minimal but structurally real data page for one view. */
function dataPage(view: string, rows: string): string {
  const inner =
    `<div>Registration Number : RA0000000000000 Name : TEST Program : B.Tech ` +
    `Department : CSE Specialization : X Semester : 3 Batch : 1</div>` +
    `<table><tr><td>S.No</td><td>Course Code</td><td>Course Title</td>` +
    `<td>Credit</td><td>Regn. Type</td><td>Category</td><td>Course Type</td>` +
    `<td>Faculty</td><td>Slot</td><td>Room</td><td>Academic Year</td></tr>${rows}</table>`;
  // Zoho ships the content as an escaped JS string; \x3c/\x3e are its < and >.
  const escaped = inner.replace(/</g, "\\x3c").replace(/>/g, "\\x3e");
  return (
    `<html><body><div id="zc-viewcontainer_${view}"></div><script>` +
    `document.getElementById("zc-viewcontainer_${view}").innerHTML = ` +
    `pageSanitizer.sanitize('${escaped}');</script></body></html>`
  );
}

const COURSE_ROW =
  `<td>1</td><td>21CSC302J</td><td>Computer Networks</td><td>4</td>` +
  `<td>Regular</td><td>Professional Core</td><td>Theory</td>` +
  `<td>Dr Someone</td><td>A</td><td>CLS524</td><td>AY2026-27-ODD</td></tr>`;

/** The portal's signed-out response: the signin iframe, no view container. */
const SIGNED_OUT_SHELL =
  `<html><body><iframe id="signinFrame" ` +
  `src="/accounts/p/40-10002227248/signin?hide_title=true"></iframe></body></html>`;

/* ------------------------------ classifyPage ----------------------------- */

check(
  "a page with a view container is authenticated",
  classifyPage(dataPage(TIMETABLE_VIEW, COURSE_ROW)),
  "view_present",
);
check(
  "a page with an UNRECOGNISED view container is still authenticated",
  classifyPage(dataPage("My_Time_Table_2026_27", COURSE_ROW)),
  "view_present",
);
check("the signin shell is logged_out", classifyPage(SIGNED_OUT_SHELL), "logged_out");
check(
  "an error page is neither, not silently 'logged out'",
  classifyPage("<html><body><h1>503 Service Unavailable</h1></body></html>"),
  "unrecognised",
);

check(
  "view container names are extracted and deduped",
  viewContainerNames(dataPage("My_Attendance", "")).join(","),
  "My_Attendance",
);

/* ------------------------------ resolveView ------------------------------ */

check(
  "exact view name resolves to itself",
  resolveView(dataPage(TIMETABLE_VIEW, COURSE_ROW), TIMETABLE_VIEW)?.name,
  TIMETABLE_VIEW,
);
check(
  "a renamed sole view resolves to the new name",
  resolveView(dataPage("My_Time_Table_2026_27", COURSE_ROW), TIMETABLE_VIEW)?.name,
  "My_Time_Table_2026_27",
);
check(
  "a page with NO view container resolves to null",
  resolveView(SIGNED_OUT_SHELL, TIMETABLE_VIEW),
  null,
);
check(
  "ambiguity (two views, neither exact) refuses to guess",
  resolveView(
    dataPage("Some_Other_View", "") + dataPage("And_Another", ""),
    TIMETABLE_VIEW,
  ),
  null,
);
check(
  "a sole view from a DIFFERENT page is refused, not silently accepted",
  resolveView(dataPage("Unrelated_View", COURSE_ROW), TIMETABLE_VIEW),
  null,
);
check(
  "attendance has no year suffix, so an unrelated sole view is refused too",
  resolveView(dataPage("My_Time_Table_2026_27", ""), "My_Attendance"),
  null,
);

check(
  "parseTimetable reports the view it actually read",
  parseTimetable(dataPage("My_Time_Table_2026_27", COURSE_ROW), TIMETABLE_VIEW)?.view,
  "My_Time_Table_2026_27",
);
check(
  "parseTimetable still parses courses through the rename",
  parseTimetable(dataPage("My_Time_Table_2026_27", COURSE_ROW), TIMETABLE_VIEW)?.courses.length,
  1,
);

/* ------------------------- timetableViewCandidates ------------------------ */

const candidates = timetableViewCandidates(new Date("2026-08-11T00:00:00Z"));
check("pinned view name is tried first", candidates[0], TIMETABLE_VIEW);
check(
  "the current academic year is a candidate (Aug 2026 -> 2026_27)",
  candidates.includes("My_Time_Table_2026_27"),
  true,
);
check(
  "a pre-July date belongs to the PREVIOUS academic year",
  timetableViewCandidates(new Date("2026-03-01T00:00:00Z")).includes("My_Time_Table_2025_26"),
  true,
);
check("candidates are deduped", candidates.length, new Set(candidates).size);

/* --------------------------- getTimetable wiring -------------------------- */

/** A FetchAs that serves canned bodies per requested path. */
function fakeFetch(respond: (path: string) => string): FetchAs {
  const fn = (async (path: string) =>
    new Response(respond(path), { status: 200 })) as FetchAs;
  fn.jar = new CookieJar();
  return fn;
}

// tsx compiles these scripts to CJS, so the async checks live in a main().
async function main() {
  const at = new Date("2026-08-11T00:00:00Z");

  const renamed = await getTimetable(
    fakeFetch((path) =>
      path.endsWith("My_Time_Table_2026_27")
        ? dataPage("My_Time_Table_2026_27", COURSE_ROW)
        : dataPage("Unrelated_View", ""),
    ),
    at,
  );
  check("a renamed timetable page is found by falling through candidates", renamed.ok, true);
  check(
    "and reports the view it landed on",
    renamed.ok ? renamed.view : "(failed)",
    "My_Time_Table_2026_27",
  );

  const loggedOut = await getTimetable(fakeFetch(() => SIGNED_OUT_SHELL), at);
  check(
    "a genuinely dead session still reports logged_out",
    loggedOut.ok ? "(ok)" : loggedOut.reason,
    "logged_out",
  );

  const broken = await getTimetable(
    fakeFetch(() => dataPage("Totally_Different", "") + dataPage("Second_View", "")),
    at,
  );
  check(
    "a live session on an unreadable page is NOT reported as logged out",
    broken.ok ? "(ok)" : broken.reason,
    "unreadable",
  );

  console.log(failures ? `\n${failures} failure(s)` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
