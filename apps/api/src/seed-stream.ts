// Streaming collection for round-0 generate/repair calls.

import { collectStream, type GenerationResult, type StreamEvent } from 'genaicode';

// Same header parseSeedResponse matches — one definition, not two to drift.
export const SEED_FENCE_HEADER_RE = /^[ \t]*--- (NOTES|[\w./-]+\.(?:ts|md|json|html|css)) ---[ \t]*\r?\n/gm;

// Streams instead of run to skip the Anthropic 21k token cap.

// Also reports each file boundary as progress, straight from the stream text.
export async function streamCollect(
  events: AsyncIterable<StreamEvent>,
  onFile?: (file: string) => void,
): Promise<GenerationResult> {
  if (!onFile) return collectStream(events);

  let buffer = '';

  // Rescans only the tail — past scanned is fully matched or file content.
  let scanned = 0;
  async function* watched(notify: (file: string) => void) {
    for await (const event of events) {
      if (event.type === 'text-delta') {
        buffer += event.text;
        const from = scanned;
        for (const header of buffer.slice(from).matchAll(SEED_FENCE_HEADER_RE)) {
          notify(header[1]);
          scanned = from + header.index! + header[0].length;
        }
      }
      yield event;
    }
  }
  return collectStream(watched(onFile));
}
