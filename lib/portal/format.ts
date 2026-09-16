/** "16 Sep, 7:42 pm" in IST — pinned so a UTC server (Vercel) doesn't show the
 *  wrong time for when the student last ran Send to Grid. */
export function formatSyncTime(ms: number): string {
  return new Date(ms).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}
