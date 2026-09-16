export function workshopBrief(slug: string, request: string, ack?: string): string {
  return [
    `You are editing the gamedev.pl game "${slug}". This directory is its source tree (games/${slug} in the checkout).`,
    `Creator request: ${request}`,
    ack ? `Studio understood it as: ${ack}` : '',
    'Change game files only in this directory. Do not run git or publish — the creator delivers with `gamedevpl push`. Do not change project dependencies or lockfiles.',
    'For visual checks, use an available browser tool or launch and control a local browser through shell commands or scripts, when permitted by the applicable tool instructions. A disconnected browser plugin does not by itself mean shell-based browser automation is unavailable. Use suitable installed tooling; Playwright, Puppeteer, or a browser headless CLI are examples, not requirements.',
    'If needed and permitted, install suitable browser automation tooling and its browser into an isolated temporary directory/cache, outside the game project. Do not install global packages, change sandbox permissions, or bypass a denied operation. If setup fails, report it once and continue the work that does not need a browser.',
    'Use the live preview supplied below for browser work. A preview URL alone does not provide browser tooling. Verify that your chosen browser method can open the preview and capture screenshots before promising visual verification.',
    'Missing browser access blocks visual verification, not implementation. Continue requested code changes and non-browser checks; do not refuse or end an implementation task solely because screenshots are unavailable. State what changed and what remains visually unverified. Never claim screenshots or visual verification you did not perform.',
    'The CLI runs typecheck and check:static after you exit. Do not run these checks yourself.',
    'This is a non-interactive task: do not wait for replies or approvals. Complete all unblocked work before reporting remaining blockers. For a task consisting only of browser interaction or screenshots, explain if that requested result cannot be produced.',
  ]
    .filter(Boolean)
    .join('\n');
}
