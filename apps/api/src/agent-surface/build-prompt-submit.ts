// 2026-11-27: "rather improve" beat the art pass in every round.
export function submitLines(shellCreation: boolean): string[] {
  if (shellCreation) {
    return [
      '- Stage the `CAPTURE.json` you ran locally with the first preview, uploaded from disk. After changing it or a renderer module, run that exact plan again and confirm it wrote its PNGs before staging it. Prove the objective with the capture DSL’s `equals` or `greaterThanOrEqual`; in an endless game, prove the scoring action (such as a delivery) rather than adding a finish line the brief does not have.',
      '- Stage and `submit_sources({ fromStaged: true, mode: "preview", kitEngineRef })` once the game is playable and its one look check (system prompt) is done. A delivered draft beats a better one that never arrived, so keep that check to one pass.',
      '- `end` straight after that submit returns, with your closing word in `summary`. Do not wait on the gate. Once `end` replies `ended: true`, write nothing more.',
    ];
  }
  return [
    '- Stage and `submit_sources({ fromStaged: true, mode: "preview", kitEngineRef })` as soon as the',
    '  game is playable, even if you can see things you would rather improve. A delivered rough',
    '  draft beats a better one that never arrived.',
    '- `end` straight after the submit returns. Do not wait on the gate. No one reads text after `end`: stop there.',
  ];
}
