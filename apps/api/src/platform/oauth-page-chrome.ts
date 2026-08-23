/**
 * Shared chrome for the OAuth pages the API server-renders itself.
 *
 * Both the consent screen (oauth-as.ts) and the token sign-in page
 * (oauth-token-login.ts) are plain HTML with no bundler and no React, and both are
 * pages where someone decides whether what they are looking at is really gamedev.pl.
 * That judgement is the only anti-phishing cue either page offers, so the two must
 * not be allowed to drift apart into looking like different sites.
 */

/**
 * The gamedev.pl mascot, idle pose, as one static path.
 *
 * Traced spans from apps/web/src/mascotSpans.ts, flattened at authoring time because
 * this page is server-rendered plain HTML with no bundler and no React — and because a
 * consent screen must not depend on a network fetch that can fail or leak a referrer.
 *
 * It is here for recognition, which is the only anti-phishing cue a creator actually
 * has: a page that looks like gamedev.pl is one they can judge. Small and beside the
 * wordmark rather than a hero, so the permissions stay above the fold on a phone.
 */
export const MASCOT_SVG = `<svg class="mascot" viewBox="0 0 70 60" width="34" height="29" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M21 1h28v1h-28zM19 2h32v1h-32zM18 3h14v1h-14zM33 3h4v1h-4zM39 3h14v1h-14zM17 4h13v1h-13zM34 4h3v1h-3zM40 4h14v1h-14zM16 5h13v1h-13zM33 5h5v1h-5zM41 5h14v1h-14zM15 6h13v1h-13zM32 6h6v1h-6zM41 6h14v1h-14zM14 7h14v1h-14zM31 7h8v1h-8zM41 7h15v1h-15zM14 8h42v1h-42zM14 9h43v1h-43zM14 10h43v1h-43zM13 11h20v1h-20zM38 11h19v1h-19zM13 12h19v1h-19zM39 12h18v1h-18zM13 13h18v1h-18zM39 13h18v1h-18zM13 14h18v1h-18zM40 14h17v1h-17zM13 15h17v1h-17zM40 15h10v1h-10zM51 15h7v1h-7zM13 16h6v1h-6zM21 16h9v1h-9zM41 16h8v1h-8zM51 16h7v1h-7zM5 17h6v1h-6zM13 17h6v1h-6zM22 17h7v1h-7zM41 17h8v1h-8zM52 17h6v1h-6zM59 17h6v1h-6zM3 18h15v1h-15zM23 18h6v1h-6zM42 18h6v1h-6zM52 18h14v1h-14zM2 19h16v1h-16zM23 19h5v1h-5zM43 19h4v1h-4zM53 19h15v1h-15zM1 20h16v1h-16zM24 20h3v1h-3zM43 20h3v1h-3zM53 20h15v1h-15zM1 21h4v1h-4zM11 21h6v1h-6zM25 21h2v1h-2zM44 21h2v1h-2zM53 21h6v1h-6zM64 21h5v1h-5zM0 22h4v1h-4zM12 22h5v1h-5zM44 22h1v1h-1zM53 22h5v1h-5zM66 22h3v1h-3zM0 23h3v1h-3zM6 23h4v1h-4zM12 23h5v1h-5zM53 23h4v1h-4zM60 23h4v1h-4zM66 23h4v1h-4zM0 24h3v1h-3zM5 24h6v1h-6zM13 24h4v1h-4zM53 24h4v1h-4zM59 24h5v1h-5zM67 24h3v1h-3zM0 25h3v1h-3zM5 25h6v1h-6zM13 25h4v1h-4zM53 25h4v1h-4zM59 25h6v1h-6zM67 25h3v1h-3zM0 26h3v1h-3zM5 26h6v1h-6zM13 26h4v1h-4zM53 26h4v1h-4zM59 26h6v1h-6zM67 26h3v1h-3zM0 27h3v1h-3zM5 27h6v1h-6zM13 27h4v1h-4zM53 27h4v1h-4zM59 27h6v1h-6zM67 27h3v1h-3zM0 28h3v1h-3zM6 28h4v1h-4zM13 28h4v1h-4zM53 28h4v1h-4zM60 28h4v1h-4zM66 28h4v1h-4zM0 29h4v1h-4zM12 29h5v1h-5zM53 29h5v1h-5zM66 29h3v1h-3zM1 30h4v1h-4zM11 30h6v1h-6zM53 30h6v1h-6zM64 30h5v1h-5zM1 31h16v1h-16zM53 31h15v1h-15zM2 32h15v1h-15zM53 32h15v1h-15zM3 33h14v1h-14zM53 33h14v1h-14zM5 34h12v1h-12zM26 34h1v1h-1zM44 34h1v1h-1zM53 34h12v1h-12zM10 35h8v1h-8zM26 35h2v1h-2zM43 35h2v1h-2zM53 35h7v1h-7zM10 36h8v1h-8zM25 36h4v1h-4zM42 36h4v1h-4zM53 36h7v1h-7zM9 37h9v1h-9zM25 37h5v1h-5zM41 37h5v1h-5zM52 37h10v1h-10zM7 38h12v1h-12zM25 38h6v1h-6zM40 38h7v1h-7zM52 38h11v1h-11zM6 39h13v1h-13zM24 39h8v1h-8zM39 39h8v1h-8zM51 39h13v1h-13zM5 40h15v1h-15zM24 40h9v1h-9zM38 40h9v1h-9zM50 40h15v1h-15zM4 41h5v1h-5zM10 41h11v1h-11zM23 41h11v1h-11zM37 41h11v1h-11zM49 41h11v1h-11zM61 41h4v1h-4zM4 42h4v1h-4zM11 42h11v1h-11zM23 42h12v1h-12zM36 42h24v1h-24zM62 42h4v1h-4zM3 43h4v1h-4zM11 43h48v1h-48zM63 43h3v1h-3zM3 44h4v1h-4zM12 44h47v1h-47zM63 44h3v1h-3zM3 45h3v1h-3zM12 45h46v1h-46zM63 45h4v1h-4zM3 46h3v1h-3zM13 46h44v1h-44zM63 46h4v1h-4zM3 47h3v1h-3zM14 47h42v1h-42zM63 47h4v1h-4zM3 48h3v1h-3zM16 48h38v1h-38zM63 48h4v1h-4zM3 49h3v1h-3zM18 49h34v1h-34zM63 49h4v1h-4zM3 50h3v1h-3zM21 50h8v1h-8zM40 50h8v1h-8zM63 50h4v1h-4zM3 51h3v1h-3zM21 51h8v1h-8zM40 51h8v1h-8zM64 51h3v1h-3zM4 52h1v1h-1zM21 52h8v1h-8zM40 52h8v1h-8zM21 53h8v1h-8zM40 53h8v1h-8zM21 54h8v1h-8zM40 54h8v1h-8zM21 55h8v1h-8zM40 55h8v1h-8zM21 56h7v1h-7zM40 56h8v1h-8zM22 57h6v1h-6zM41 57h6v1h-6zM23 58h4v1h-4zM42 58h4v1h-4z"/></svg>`;

/**
 * The site's own tokens, copied from apps/web/src/styles.css.
 *
 * This page is server-rendered and never met the design system, so it shipped on the
 * browser default white while gamedev.pl is dark. That is not only ugly: a consent
 * screen is where someone decides whether a page is really the site it claims to be,
 * and one that looks nothing like the site removes the only cue they have.
 */
export const OAUTH_PAGE_STYLES = `<style>
    :root {
      --bg: #0f1418; --panel: #161c22; --panel-border: #232c35; --panel-card: #1c242c;
      --text: #f0f4f8; --muted: #94a3b8; --turquoise: #00e4ac; --warn: #e5b76a;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0; padding: 2rem 1rem 4rem; background: var(--bg);
      background-image: radial-gradient(circle at 50% 0%, #1a232b 0%, #0f1418 70%);
      background-attachment: fixed; color: var(--text);
      font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; line-height: 1.55;
    }
    main { max-width: 34rem; margin: 0 auto; background: var(--panel);
      border: 1px solid var(--panel-border); border-radius: 14px; padding: 2rem; }
    .brand { margin: 0 0 1.25rem; font-size: 0.8rem; font-weight: 700; color: var(--turquoise);
      display: flex; align-items: center; gap: 0.5rem; }
    .mascot { display: block; flex: none; }
    h1 { font-size: 1.5rem; line-height: 1.2; margin: 0 0 0.75rem; }
    h2 { font-size: 0.9rem; margin: 1.5rem 0 0.5rem; }
    .lead { margin: 0 0 1rem; }
    .who { margin: 0 0 1rem; padding: 0.75rem 0; color: var(--muted); font-size: 0.9rem;
      border-top: 1px solid var(--panel-border); border-bottom: 1px solid var(--panel-border); }
    .who strong { color: var(--text); }
    ul { margin: 0; padding-left: 1.1rem; }
    ul.can li { margin: 0.25rem 0; }
    ul.cannot li { margin: 0.25rem 0; color: var(--muted); font-size: 0.92rem; }
    .redirect { font-family: ui-monospace, monospace; word-break: break-all;
      background: var(--panel-card); border: 1px solid var(--panel-border);
      padding: 0.75rem; border-radius: 0.5rem; margin: 0; }
    .hint, .duration { color: var(--muted); font-size: 0.85rem; }
    .duration { background: var(--panel-card); padding: 0.7rem 0.8rem; border-radius: 0.5rem; margin: 1.25rem 0 0; }
    .waiting { display: inline-block; margin: 0 0 0.75rem; padding: 0.25rem 0.75rem; border-radius: 999px;
      background: rgba(229,183,106,0.14); color: var(--warn); font-size: 0.8rem; font-weight: 700; }
    label { display: block; margin: 1.5rem 0 0.4rem; font-size: 0.9rem; font-weight: 700; }
    input[type="password"], input[type="text"] {
      width: 100%; font: inherit; font-family: ui-monospace, monospace; padding: 0.6rem 0.75rem;
      border-radius: 0.55rem; border: 1px solid var(--panel-border); background: var(--panel-card);
      color: var(--text); }
    input[type="password"]:focus, input[type="text"]:focus {
      outline: 2px solid var(--turquoise); outline-offset: 1px; }
    .actions { display: flex; gap: 0.75rem; margin-top: 1.5rem; flex-wrap: wrap; }
    button { font: inherit; font-weight: 700; padding: 0.6rem 1.25rem; border-radius: 0.55rem;
      border: 1px solid var(--panel-border); background: transparent; color: var(--text); cursor: pointer; }
    .approve { background: var(--turquoise); color: #0b1017; border-color: var(--turquoise); }
    .bail { margin: 1.25rem 0 0; padding-top: 1rem; border-top: 1px solid var(--panel-border);
      color: var(--muted); font-size: 0.85rem; }
  </style>`;

export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
