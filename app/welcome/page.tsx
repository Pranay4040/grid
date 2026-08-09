"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

const NAV_LINKS = [
  { href: "#product", label: "Product" },
  { href: "#features", label: "Features" },
  { href: "/login", label: "Sign in" },
];

/** Deterministic pseudo-random in [0,1) — a plain function of `seed`, so it's
 *  pure (safe to call during render) unlike Math.random()/Date.now(), which
 *  depend on hidden global/wall-clock state React's compiler rules forbid
 *  calling directly in a render path. Classic GLSL-style hash. */
function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/** Rounded to a fixed precision so the server-rendered HTML string and the
 *  client's hydration render produce byte-identical style values — an
 *  unrounded float64 can otherwise format its last digits differently
 *  between React's SSR string serializer and the DOM's live style API,
 *  which React reports as a hydration mismatch even though the underlying
 *  number is the same. */
const round = (n: number) => Math.round(n * 100) / 100;

/** Regenerating on every render would make the ambient dots visibly jump
 *  whenever the menu opens/closes and re-renders this tree — memoized on
 *  `count`, which never changes, so this effectively runs once. */
function useAmbientDots(count: number) {
  return useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        top: round(pseudoRandom(i * 1.7 + 1) * 100),
        left: round(pseudoRandom(i * 3.1 + 7) * 100),
        size: round(2 + pseudoRandom(i * 5.3 + 13)),
        duration: round(24 + pseudoRandom(i * 7.9 + 19) * 12),
        delay: round(-pseudoRandom(i * 11.3 + 23) * 36), // negative → already mid-loop, desyncs them
      })),
    [count],
  );
}

export default function WelcomePage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const productRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const dots = useAmbientDots(20);

  // Drifts the product panel up ~20px as it enters view. IntersectionObserver
  // + a state flag rather than animation-timeline: view() — that CSS
  // feature's browser support is still too patchy to be the only path.
  // Starts false unconditionally (matches SSR, which has no `window` at all,
  // so branching the initial value on IntersectionObserver support would
  // diverge from the client's first render and trip a hydration mismatch).
  // A browser without IntersectionObserver just keeps the panel's small
  // resting offset forever — a minor visual nit, not a functional bug.
  const [productInView, setProductInView] = useState(false);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const el = productRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setProductInView(true);
          io.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!menuOpen) return;

    const scrollY = window.scrollY;
    const body = document.body.style;
    body.position = "fixed";
    body.top = `-${scrollY}px`;
    body.width = "100%";

    const firstFocusable = panelRef.current?.querySelector<HTMLElement>("a, button");
    firstFocusable?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMenuOpen(false);
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    const trigger = triggerRef.current;

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      body.position = "";
      body.top = "";
      body.width = "";
      window.scrollTo(0, scrollY);
      trigger?.focus();
    };
  }, [menuOpen]);

  return (
    <>
      <style>{CSS}</style>
      <div className="pf-hero">
        <header className="pf-nav">
          <a href="#top" className="pf-logo">
            <span className="pf-logo-mark" aria-hidden>
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
                <rect x="2" y="2" width="20" height="20" rx="6" stroke="currentColor" strokeWidth="2" />
                <path d="M8 12h8M12 8v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </span>
            Grid
          </a>
          <button
            ref={triggerRef}
            type="button"
            className="pf-burger"
            data-open={menuOpen}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls={panelId}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <span className="pf-burger-bar" />
            <span className="pf-burger-bar" />
            <span className="pf-burger-bar" />
          </button>
        </header>

        <div
          id={panelId}
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
          className="pf-panel"
          data-open={menuOpen}
          {...(!menuOpen ? { inert: true } : {})}
        >
          <nav className="pf-panel-links">
            {NAV_LINKS.map((l, i) => (
              <a
                key={l.href}
                href={l.href}
                style={{ "--i": i } as React.CSSProperties}
                onClick={() => setMenuOpen(false)}
              >
                {l.label}
              </a>
            ))}
          </nav>
          <div className="pf-panel-ctas">
            <a className="pf-btn pf-btn-primary" href="/login" onClick={() => setMenuOpen(false)}>
              Get started free
            </a>
            <a
              className="pf-btn pf-btn-secondary"
              href="#product"
              onClick={() => setMenuOpen(false)}
            >
              See how it works
            </a>
          </div>
        </div>

        {menuOpen ? (
          <button
            type="button"
            className="pf-backdrop-catcher"
            aria-hidden
            tabIndex={-1}
            onClick={() => setMenuOpen(false)}
          />
        ) : null}

        <main className="pf-main" id="top">
          <div className="pf-center">
            <p className="pf-pill">
              <span aria-hidden>◆</span> Built for SRM students
            </p>
            <h1 className="pf-h1">
              <span className="pf-h1-line" style={{ "--d": "90ms" } as React.CSSProperties}>
                <span className="pf-h1-line-inner">Your timetable,</span>
              </span>
              <span className="pf-h1-line" style={{ "--d": "170ms" } as React.CSSProperties}>
                <span className="pf-h1-line-inner">finally free.</span>
              </span>
            </h1>
            <p className="pf-subhead pf-rise" style={{ "--d": "270ms" } as React.CSSProperties}>
              Grid replaces the paywalled portal with a fast, ad-free view
              of your timetable, attendance, and marks — built by a student,
              for students.
            </p>
            <div className="pf-cta-row pf-rise" style={{ "--d": "360ms" } as React.CSSProperties}>
              <a className="pf-btn pf-btn-primary" href="/login">
                Get started free
              </a>
              <a className="pf-btn pf-btn-secondary" href="#product">
                See how it works
              </a>
            </div>
          </div>

          <div
            id="product"
            ref={productRef}
            className="pf-product pf-rise"
            data-inview={productInView}
            style={{ "--d": "480ms" } as React.CSSProperties}
          >
            <div className="pf-product-chrome">
              <span />
              <span />
              <span />
            </div>
            <div className="pf-product-body">
              <div className="pf-product-row">
                <div className="pf-product-tile" />
                <div className="pf-product-tile" />
                <div className="pf-product-tile" />
              </div>
              <div className="pf-product-list">
                <div className="pf-product-line" />
                <div className="pf-product-line" />
                <div className="pf-product-line" />
              </div>
            </div>
          </div>
        </main>

        <div className="pf-dots" aria-hidden>
          {dots.map((d) => (
            <span
              key={d.id}
              style={
                {
                  top: `${d.top}%`,
                  left: `${d.left}%`,
                  width: `${d.size}px`,
                  height: `${d.size}px`,
                  animationDuration: `${d.duration}s`,
                  animationDelay: `${d.delay}s`,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
      </div>
    </>
  );
}

const CSS = `
.pf-hero {
  --bg: #0d0d11;
  --surface: #141419;
  --border: #23232b;
  --accent: #b6b2f2;
  --text: #e8e7f0;
  --muted: #8a8a97;

  --u: clamp(8px, 1.4svh, 18px);

  --dur-fast: 160ms;
  --dur-base: 320ms;
  --dur-slow: 640ms;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-soft: cubic-bezier(0.25, 1, 0.5, 1);
  --ease-back: cubic-bezier(0.34, 1.4, 0.64, 1);

  position: relative;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif;
  isolation: isolate;
}

.pf-hero * { box-sizing: border-box; }

/* ---------------------------------------------------------------- nav */

.pf-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: calc(var(--u) * 1.5) clamp(20px, 4vw, 48px);
  position: relative;
  z-index: 20;
}

.pf-logo {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--text);
  font-weight: 700;
  font-size: 1.05rem;
  letter-spacing: -0.01em;
  text-decoration: none;
}

.pf-logo-mark {
  display: inline-flex;
  color: var(--accent);
  transition: transform var(--dur-base) var(--ease-back);
}

.pf-logo:hover .pf-logo-mark { transform: rotate(-6deg); }

.pf-burger {
  appearance: none;
  background: transparent;
  border: none;
  width: 44px;
  height: 44px;
  display: none;
  align-items: center;
  justify-content: center;
  position: relative;
  cursor: pointer;
  border-radius: 8px;
}

.pf-burger:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}

.pf-burger-bar {
  position: absolute;
  width: 20px;
  height: 2px;
  border-radius: 2px;
  background: var(--text);
  transition: transform 320ms var(--ease-out), opacity 320ms var(--ease-out);
}

.pf-burger-bar:nth-child(1) { transform: translateY(-5px); }
.pf-burger-bar:nth-child(2) { transform: translateY(0); }
.pf-burger-bar:nth-child(3) { transform: translateY(5px); }

.pf-burger[data-open="true"] .pf-burger-bar:nth-child(1) { transform: translateY(7px) rotate(45deg); }
.pf-burger[data-open="true"] .pf-burger-bar:nth-child(2) { opacity: 0; transform: scaleX(0.4); }
.pf-burger[data-open="true"] .pf-burger-bar:nth-child(3) { transform: translateY(-7px) rotate(-45deg); }

/* ------------------------------------------------------------- overlay */

.pf-panel {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: clamp(24px, 6vw, 56px);
  background: color-mix(in srgb, var(--bg) 97%, transparent);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  opacity: 0;
  transform: translateY(-8px);
  visibility: hidden;
  pointer-events: none;
  transition:
    opacity 240ms var(--ease-out),
    transform 240ms var(--ease-out),
    visibility 0s linear 240ms;
}

.pf-panel[data-open="true"] {
  opacity: 1;
  transform: translateY(0);
  visibility: visible;
  pointer-events: auto;
  transition:
    opacity 380ms var(--ease-out),
    transform 380ms var(--ease-out),
    visibility 0s linear 0s;
}

.pf-backdrop-catcher {
  position: fixed;
  inset: 0;
  z-index: 90;
  background: transparent;
  border: none;
  padding: 0;
  cursor: default;
}

.pf-panel-links {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 0;
}

.pf-panel-links a {
  font-size: 2rem;
  font-weight: 600;
  color: var(--text);
  text-decoration: none;
  align-self: flex-start;
  opacity: 0;
  transform: translateY(20px);
}

.pf-panel[data-open="true"] .pf-panel-links a {
  animation: pf-link-in 420ms var(--ease-out) both;
  animation-delay: calc(var(--i) * 55ms);
}

.pf-panel-links a:hover { color: var(--accent); }

@keyframes pf-link-in {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

.pf-panel-ctas {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.pf-panel-ctas .pf-btn { width: 100%; text-align: center; }

/* ---------------------------------------------------------------- hero */

.pf-main {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: calc(var(--u) * 3);
  padding: calc(var(--u) * 2) clamp(24px, 5vw, 72px);
  position: relative;
  z-index: 10;
}

.pf-center {
  width: 100%;
  max-width: 1180px;
  margin-inline: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: calc(var(--u) * 1.5);
}

.pf-pill {
  font-family: var(--font-geist-mono), ui-monospace, monospace;
  font-size: clamp(0.8rem, 1.6svh, 0.95rem);
  color: var(--muted);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  opacity: 0;
  animation: pf-rise var(--dur-slow) var(--ease-out) 0ms both;
}

.pf-pill span { color: var(--accent); }

.pf-h1 {
  margin: 0;
  font-weight: 800;
  font-size: clamp(2.5rem, 7.2svh, 6rem);
  line-height: 0.95;
  letter-spacing: -0.03em;
}

.pf-h1-line {
  display: block;
  overflow: hidden;
}

.pf-h1-line-inner {
  display: block;
  opacity: 0;
  transform: translateY(100%);
  animation: pf-line-rise var(--dur-slow) var(--ease-out) both;
  animation-delay: var(--d);
}

@keyframes pf-line-rise {
  from { opacity: 0; transform: translateY(100%); }
  to { opacity: 1; transform: translateY(0); }
}

.pf-subhead {
  font-size: 1.125rem;
  font-weight: 400;
  color: var(--muted);
  max-width: 42ch;
  margin: 0;
}

.pf-rise {
  opacity: 0;
  animation: pf-rise var(--dur-slow) var(--ease-out) both;
  animation-delay: var(--d, 0ms);
}

@keyframes pf-rise {
  from { opacity: 0; transform: translateY(24px); }
  to { opacity: 1; transform: translateY(0); }
}

.pf-cta-row {
  display: flex;
  gap: 16px;
  margin-top: calc(var(--u) * 1.5);
}

.pf-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  padding: 12px 28px;
  font-weight: 600;
  font-size: 0.95rem;
  text-decoration: none;
  transition: transform var(--dur-fast) var(--ease-out), filter var(--dur-fast) var(--ease-out),
    background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out),
    color var(--dur-fast) var(--ease-out);
}

.pf-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}

.pf-btn-primary {
  background: var(--accent);
  color: var(--bg);
  border: 1px solid transparent;
}

.pf-btn-primary:hover { transform: translateY(-2px); filter: brightness(1.06); }
.pf-btn-primary:active { transform: scale(0.97); }

.pf-btn-secondary {
  background: transparent;
  color: var(--accent);
  border: 1px solid var(--accent);
}

.pf-btn-secondary:hover {
  background: color-mix(in srgb, var(--accent) 8%, transparent);
}
.pf-btn-secondary:active { transform: scale(0.97); }

/* ------------------------------------------------------------- product */

.pf-product {
  width: 100%;
  max-width: 1180px;
  margin-inline: auto;
  height: 60svh;
  border-radius: 16px 16px 0 0;
  background: var(--surface);
  border: 1px solid var(--border);
  border-bottom: none;
  overflow: hidden;
  transform: translateY(20px);
  transition: transform 640ms var(--ease-soft);
}

.pf-product[data-inview="true"] { transform: translateY(0); }

.pf-product-chrome {
  display: flex;
  gap: 6px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border);
}

.pf-product-chrome span {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--border);
}

.pf-product-body { padding: 24px; display: flex; flex-direction: column; gap: 16px; }

.pf-product-row { display: flex; gap: 12px; }

.pf-product-tile {
  flex: 1;
  height: 64px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--accent) 6%, var(--bg));
  border: 1px solid var(--border);
}

.pf-product-list { display: flex; flex-direction: column; gap: 10px; }

.pf-product-line {
  height: 14px;
  border-radius: 6px;
  background: var(--border);
  width: 100%;
}
.pf-product-line:nth-child(2) { width: 80%; }
.pf-product-line:nth-child(3) { width: 60%; }

/* ---------------------------------------------------------------- dots */

.pf-dots {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  overflow: hidden;
}

.pf-dots span {
  position: absolute;
  border-radius: 50%;
  background: var(--muted);
  opacity: 0.2;
  animation: pf-drift 30s ease-in-out infinite;
}

@keyframes pf-drift {
  0% { transform: translate(0, 0); opacity: 0.15; }
  50% { transform: translate(6px, -6px); opacity: 0.3; }
  100% { transform: translate(0, 0); opacity: 0.15; }
}

/* ------------------------------------------------------- desktop 16:9 */

@media (min-width: 1024px) {
  .pf-hero {
    height: 100svh;
    overflow: hidden;
    display: grid;
    grid-template-rows: auto 1fr minmax(0, 32svh);
  }

  .pf-main {
    display: contents;
  }

  .pf-center {
    grid-row: 2;
    align-self: center;
    justify-self: center;
  }

  .pf-product {
    grid-row: 3;
    align-self: start;
  }

  .pf-burger { display: none; }
  .pf-nav > .pf-burger { display: none; }
}

@media (max-width: 1023.98px) {
  .pf-burger { display: inline-flex; }

  .pf-main {
    display: flex;
  }

  .pf-product {
    height: auto;
    margin-top: 48px;
    border-radius: 16px;
    border-bottom: 1px solid var(--border);
  }

  .pf-cta-row { flex-direction: column; width: 100%; }
  .pf-cta-row .pf-btn { width: 100%; }
}

@media (min-width: 1024px) and (min-aspect-ratio: 2/1) {
  .pf-h1 { font-size: min(clamp(2.5rem, 7.2svh, 6rem), 5rem); }
  .pf-main { padding-inline: clamp(72px, 10vw, 160px); }
}

@media (min-width: 1024px) and (max-aspect-ratio: 4/3) {
  .pf-hero { height: auto; overflow: visible; display: block; }
  .pf-main { display: flex; }
  .pf-product { height: auto; margin-top: 48px; border-radius: 16px; border-bottom: 1px solid var(--border); }
}

/* -------------------------------------------------------- reduced motion */

@media (prefers-reduced-motion: reduce) {
  .pf-hero * {
    animation: none !important;
    transition: none !important;
  }
  .pf-pill,
  .pf-rise,
  .pf-h1-line-inner,
  .pf-panel-links a {
    opacity: 1 !important;
    transform: none !important;
  }
  .pf-product { transform: none !important; }
  .pf-dots { display: none; }
}
`;
