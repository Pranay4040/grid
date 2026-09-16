/**
 * The "Send to Grid" bookmarklet. Runs INSIDE the student's signed-in SRM
 * Student Portal tab, so the portal's own cookies authenticate every request —
 * Grid never holds a portal session, never sees a password, and never touches
 * the captcha or bot-detection on the sign-in page.
 *
 * It makes the same three requests the portal's own pages make (attendance
 * iden=9, marks iden=13, and View Details per course), then hands the raw pages
 * to Grid with an ordinary top-level form POST. A form rather than fetch():
 * the portal's CSP is `default-src 'self'`, which blocks fetch/XHR to another
 * origin but has no form-action directive; and a same-tab navigation isn't
 * eaten by mobile pop-up blockers.
 */
export const PORTAL_ORIGIN = "https://sp.srmist.edu.in";

export function buildBookmarklet(gridOrigin: string): string {
  const src = `(async()=>{
if(location.origin!==${JSON.stringify(PORTAL_ORIGIN)}){alert("Open the SRM Student Portal (sp.srmist.edu.in), sign in, then run Send to Grid again.");return;}
const B="/srmiststudentportal/students/report/";
const post=(p,b)=>fetch(B+p,{method:"POST",credentials:"include",headers:{"Content-Type":"application/x-www-form-urlencoded; charset=UTF-8","X-Requested-With":"XMLHttpRequest"},body:b}).then(r=>r.text());
try{
const R="&filter=&hdnFormDetails=1&csrfPreventionSalt=";
const [a,m]=await Promise.all([post("studentAttendanceDetails.jsp","iden=9"+R),post("studentInternalMarkDetails.jsp","iden=13"+R)]);
const d={};
await Promise.all([...m.matchAll(/funViewComponentWiseMarks\\(\\s*'([^']*)'[^)]*?,\\s*'?(\\w+)'?\\s*\\)/g)].map(async x=>{d[x[1]]=await post("studentInternalMarkDetailsInner.jsp","iden=1&hdnSubjectId="+encodeURIComponent(x[1])+"&status="+encodeURIComponent(x[2]));}));
const f=document.createElement("form");f.method="POST";f.action=${JSON.stringify(gridOrigin + "/portal/import")};f.style.display="none";
for(const [k,v] of [["attendance",a],["marks",m],["details",JSON.stringify(d)]]){const t=document.createElement("textarea");t.name=k;t.value=v;f.appendChild(t);}
document.body.appendChild(f);f.submit();
}catch(e){alert("Send to Grid couldn't read the portal: "+e);}
})();`;
  return "javascript:" + encodeURIComponent(src.replace(/\n/g, ""));
}
