import { startLocalPlay } from './play.js';
import type { AdapterSpec } from './adapters.js';
import { localPreviewAdapter, localPreviewSupported } from './local-preview-adapter.js';
import { startLocalPreviewMcp } from './local-preview-mcp.js';
import { formatError } from './errors.js';

export const LOCAL_PREVIEW_INSTRUCTIONS =
  'Use gamedevpl_local MCP tools for visual verification: preview_status, then capture, then capture_status for its returned jobId. The completed result contains a PNG: inspect it. Tools run on the local CLI, need no shell browser setup, and never publish. They capture the initial rendered state, not an interactive playtest. Do not claim visual verification if they report an error.';

export async function localPreviewTools(input: {
  spec: AdapterSpec;
  previewUrl?: string;
  abort: AbortSignal;
  write: (line: string) => void;
}) {
  if (!input.previewUrl || !localPreviewSupported(input.spec.name)) return undefined;
  let server: Awaited<ReturnType<typeof startLocalPreviewMcp>> | undefined;
  let cleanup: (() => void) | undefined;
  try {
    server = await startLocalPreviewMcp({ ...input, previewUrl: input.previewUrl });
    const wired = localPreviewAdapter(input.spec, server);
    cleanup = wired.cleanup;
    input.write('Local browser tools connected: preview_status, capture, capture_status.');
    return {
      spec: wired.spec,
      async close() {
        await server!.close();
        wired.cleanup();
      },
    };
  } catch (error) {
    await server?.close();
    cleanup?.();
    input.write(`Local browser tools unavailable: ${formatError(error)}`);
    return undefined;
  }
}

export async function startWorkshopPreview(input: {
  root: string;
  slug: string;
  env: NodeJS.ProcessEnv;
  write: (line: string) => void;
  abort: AbortSignal;
  agent: string;
  onLocalPreview?: (url: string) => void;
}): Promise<string | undefined> {
  const preview = await startLocalPlay({ ...input, prepared: true });
  if (preview) {
    input.onLocalPreview?.(preview.url);
    input.write(`live preview while ${input.agent} edits: ${preview.url}`);
  }
  return preview?.url;
}
