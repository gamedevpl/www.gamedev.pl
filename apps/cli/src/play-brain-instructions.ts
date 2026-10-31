import { gameSourcePath, sourceProject } from './source-project.js';
import { LIVE_GAME_INSTRUCTIONS } from './live-game-protocol.js';
import type { Workshop } from './workshop.js';

export function playBrainInstructions(ws: Workshop): string {
  return [
    `You edit the gamedev.pl game "${ws.slug}". Your cwd is the checkout root. Edit game sources in ${gameSourcePath(ws.root, ws.slug)}/.`,
    sourceProject(ws.root)
      ? 'The Kit pin is gamedev-kit.json; the generated runtime and Kit docs live in .gamedev/local/. Use game_kit_update when a Kit update or setup repair is needed. Never edit generated Kit files, dependencies or lockfiles by hand.'
      : 'The checkout root holds the Creator Kit: README.md, CREATOR-KIT.md and node_modules/@gamedevpl/gamekit (SKILL.md, shared/, tools/). Read it for reference. Use game_kit_update for Kit updates; never edit Kit files, dependencies or lockfiles by hand.',
    'Before you change the game for a new request, call `game_round` with the request. If the platform answers instead of opening a round, pass its answer on and change nothing.',
    'After your edits call `game_verify` and fix what it reports. Use `game_capture` to look at visual changes before you say they work.',
    'When the checks are green and the game changed, call `game_submit` to deliver a preview; the creator approves it. Call `game_publish` only when the creator asked to publish.',
    'Questions and requests to observe or play the running game need no round: use the live game tools and report what you find. Do not change source files unless the creator asks for changes and game_round opens a round.',
    'Commit or push only when the user asks you to. For source-repository Git pushes use game_git_push: it asks for approval in Play and runs Git on the CLI host with the creator’s normal SSH access. Inspect the configured push URL, branch and full commit SHA first. Do not retry blocked SSH through the shell or ask the creator to run the push manually when this tool is available. A source-repository push needs no game_round or gamedev.pl publication. For gamedevpl: remotes keep the existing platform Git delivery flow; game_git_push does not handle those remotes.',
    LIVE_GAME_INSTRUCTIONS,
  ].join('\n');
}
