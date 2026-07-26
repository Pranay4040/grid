/** Delete the locally saved session bundle. */
import { clearSession, SESSION_FILE } from "../lib/academia/session-store";

clearSession();
console.log(`Removed ${SESSION_FILE} (if it existed).`);
