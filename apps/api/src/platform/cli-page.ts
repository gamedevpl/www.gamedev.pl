import { escapeHtml, MASCOT_SVG, OAUTH_PAGE_STYLES } from './oauth-page-chrome.js';

export function cliPageHtml(origin: string): string {
  const install = escapeHtml(`curl -fsSL ${origin}/install.sh | bash`);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>gamedevpl CLI</title>
  ${OAUTH_PAGE_STYLES}
</head>
<body>
  <main>
    <p class="brand">${MASCOT_SVG} gamedev.pl</p>
    <h1>gamedevpl, in a terminal</h1>
    <p class="lead">A conversational front door for making and iterating games on gamedev.pl. It has no model of its own. Coding happens on the platform, or by a tool you already installed. MCP and this CLI are documented together at <a href="/connect">/connect</a>.</p>
    <h2>Install</h2>
    <pre class="redirect">${install}</pre>
    <p class="hint">Needs Node 20+ — same as a game checkout. Windows: <code>irm ${escapeHtml(origin)}/install.ps1 | iex</code>. The script verifies a SHA-256 before it writes <code>~/.local/bin</code>.</p>
    <h2>Journeys</h2>
    <ul class="can">
      <li><code>gamedevpl login</code> opens a browser — approve once, no token to copy. Then describe a game.</li>
      <li><code>gamedevpl checkout &lt;slug&gt;</code> for your own editor; <code>git push</code> uses <code>git-remote-gamedevpl</code>.</li>
      <li>CI: <code>GAMEDEV_TOKEN</code> from secrets, <code>gamedevpl submit --json</code>.</li>
    </ul>
    <h2>Security posture</h2>
    <ul class="cannot">
      <li>Checksums on every install and update. No postinstall beyond the copy.</li>
      <li>Tokens in an encrypted file under ~/.config/gamedevpl.</li>
      <li>Revoke the grant in Studio to kill CLI access on the next request.</li>
      <li>A sub-agent never receives your OAuth token — round-scoped credentials only.</li>
    </ul>
    <p class="bail"><a href="/">Back to gamedev.pl</a></p>
  </main>
</body>
</html>`;
}
