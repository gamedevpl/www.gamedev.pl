// Loopback callback pages — same chrome as the consent screen.
import { MASCOT_SVG } from './mascot-svg.js';

const STYLES = `<style>
  :root {
    --bg: #0f1418; --panel: #161c22; --panel-border: #232c35;
    --text: #f0f4f8; --muted: #94a3b8; --turquoise: #00e4ac;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    padding: 1.5rem; background: var(--bg);
    background-image: radial-gradient(circle at 50% 0%, #1a232b 0%, #0f1418 70%);
    color: var(--text);
    font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; line-height: 1.55;
  }
  main { width: min(26rem, 100%); background: var(--panel);
    border: 1px solid var(--panel-border); border-radius: 14px; padding: 1.75rem 2rem; }
  .brand { margin: 0 0 1.25rem; font-size: 0.8rem; font-weight: 700; color: var(--turquoise);
    display: flex; align-items: center; gap: 0.5rem; }
  .mascot { display: block; flex: none; }
  h1 { font-size: 1.5rem; line-height: 1.2; margin: 0 0 0.75rem; }
  .lead { margin: 0; color: var(--muted); }
</style>`;

const COPY = {
  done: { title: 'Signed in', lead: 'You can close this tab and return to the terminal.' },
  deny: { title: 'Sign-in cancelled', lead: 'You can close this tab.' },
  bad: { title: 'This sign-in link is invalid', lead: 'Return to the terminal and run gamedevpl login again.' },
  fail: { title: 'Sign-in failed', lead: 'Return to the terminal and try again.' },
} as const;

export type LoopbackPageKind = keyof typeof COPY;

export function loopbackPage(kind: LoopbackPageKind): string {
  const copy = COPY[kind];
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>gamedevpl</title>
  ${STYLES}
</head>
<body>
  <main>
    <p class="brand">${MASCOT_SVG}<span>gamedev.pl</span></p>
    <h1>${copy.title}</h1>
    <p class="lead">${copy.lead}</p>
  </main>
</body>
</html>`;
}
