// Preview capture is optional; its failure must still reach the report.

const SECTION = /^=== capture \(/;
const GAVE_UP = /capture did not complete/;

// The capture stage's own last word, without the npm banner lines.
function captureFailure(output: string): string | null {
  const lines = output.split(/\r?\n/);
  const start = lines.findIndex((line) => SECTION.test(line.trim()));
  if (start < 0) return null;
  const section = lines.slice(start + 1);
  const end = section.findIndex((line) => GAVE_UP.test(line));
  if (end < 0) return null;
  const said = section
    .slice(0, end)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('>'));
  return said.at(-1)?.slice(0, 300) ?? 'no output';
}

export function previewStillsNote(output: string, screenshot: string | undefined): string {
  if (screenshot) return '';
  const failure = captureFailure(output);
  const why = failure ? `capture failed: ${failure}` : 'CAPTURE.json took no { "capture": … } step';
  return `; no screenshot stored (${why}) — fix CAPTURE.json, or the creator gets no stills or concept proposal`;
}
