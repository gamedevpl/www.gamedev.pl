export function workshopBrief(slug: string, request: string, ack?: string): string {
  return [
    `You are editing the gamedev.pl game "${slug}". This directory is its source tree (games/${slug} in the checkout).`,
    `Creator request: ${request}`,
    ack ? `Studio understood it as: ${ack}` : '',
    'Change only files in this directory. Do not run git, install packages, or publish — the creator delivers with `gamedevpl submit`.',
    'Use the live preview supplied below for browser work. A preview URL alone does not provide browser tooling. Check whether your browser tool is available before promising screenshots.',
    'If browser access is unavailable or denied, report that limitation and finish; never claim visual verification or change sandbox permissions to obtain it.',
    'The CLI runs typecheck and check:static after you exit. Do not run these checks yourself.',
    'This is a non-interactive task: do not wait for replies or approvals. If blocked, report the blocker and finish.',
  ]
    .filter(Boolean)
    .join('\n');
}
