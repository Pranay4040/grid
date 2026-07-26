/**
 * Minimal cookie jar for the Academia handshake.
 *
 * Every request in this flow targets a single host (academia.srmist.edu.in),
 * so we deliberately skip domain/path matching and key purely by cookie name.
 * That keeps the jar small and predictable; if this ever needs to span hosts,
 * swap in `tough-cookie` rather than growing this.
 */
export class CookieJar {
  private store = new Map<string, string>();

  /** Ingest every `set-cookie` from a response. Later values win. */
  absorb(res: Response): void {
    // getSetCookie is the only correct way to read multiple Set-Cookie
    // headers; res.headers.get("set-cookie") collapses them.
    const setCookies = res.headers.getSetCookie?.() ?? [];
    for (const line of setCookies) {
      const [pair] = line.split(";");
      const eq = pair.indexOf("=");
      if (eq < 1) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      // Deletions arrive as an expired empty value; honour them.
      if (value === "" || /expires=Thu, 01 Jan 1970/i.test(line)) {
        this.store.delete(name);
      } else {
        this.store.set(name, value);
      }
    }
  }

  /** Serialize into a `Cookie:` request header. */
  header(): string {
    return [...this.store.entries()]
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }

  get(name: string): string | undefined {
    return this.store.get(name);
  }

  names(): string[] {
    return [...this.store.keys()];
  }

  /** A plain snapshot suitable for encrypting + persisting per user session. */
  toJSON(): Record<string, string> {
    return Object.fromEntries(this.store);
  }

  static fromJSON(data: Record<string, string>): CookieJar {
    const jar = new CookieJar();
    for (const [k, v] of Object.entries(data)) jar.store.set(k, v);
    return jar;
  }
}
