"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Two ways to save the bookmarklet: drag the link to the bookmarks bar
 * (desktop), or copy its code into a bookmark's URL (phones can't drag).
 *
 * The href is set through a ref because React refuses to render
 * `javascript:` URLs — which is exactly what a bookmarklet is.
 */
export function BookmarkletInstall({ code }: { code: string }) {
  const linkRef = useRef<HTMLAnchorElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    linkRef.current?.setAttribute("href", code);
  }, [code]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <a
        ref={linkRef}
        onClick={(e) => e.preventDefault()}
        className="cursor-grab rounded-lg border border-dashed border-[var(--accent)] px-4 py-2 text-sm font-medium text-accent"
        title="Drag me to your bookmarks bar"
      >
        Send to Grid
      </a>
      <button
        type="button"
        onClick={copy}
        className="rounded-lg bg-[var(--accent-soft)] px-4 py-2 text-sm font-medium text-accent transition-[filter] hover:brightness-110"
      >
        {copied ? "Copied" : "Copy bookmark code"}
      </button>
    </div>
  );
}
