import { startLocalPlay } from './play.js';
import type { AdapterSpec } from './adapters.js';
import { localPreviewAdapter, localPreviewSupported } from './local-preview-adapter.js';
import { MAX_CAPTURES_PER_TASK, startLocalPreviewMcp } from './local-preview-mcp.js';
import { formatError } from './errors.js';
import type { AgentTask } from 'genaicode/agents';
import type { ApproveTool } from './agent-approval.js';

export const LOCAL_PREVIEW_INSTRUCTIONS = `Use gamedevpl_local MCP tools for visual verification: preview_status, then capture_game({viewport: "desktop"}) (or "mobile"), then capture_status({jobId}) for its returned jobId. Poll until complete or failed; the completed result contains a PNG: inspect it. The local CLI host runs the browser and capture server, outside your shell sandbox; these tools do not require sandbox escalation or npm run capture. Prefer them for local screenshots even when shell commands report listen EPERM or no browser tool is available. They never publish and capture only the current game's initial rendered state, not an interactive playtest or the Creator Kit's deterministic capture plan. Do not claim visual verification if they report an error. Capture after a meaningful visual change, not after every edit; each task has a budget of ${MAX_CAPTURES_PER_TASK} captures. A browser timeout is transient: retry once, then continue.`;

export async function localPreviewTools(input: {
  spec: AdapterSpec;
  previewUrl?: string;
  captureBudget?: { used: number };
  abort: AbortSignal;
  write: (line: string) => void;
  progress?: (text: string, blocked: boolean) => void;
  onApproval?: ApproveTool;
  sandbox?: { permissions: AgentTask['permissions']; cwd: string };
}) {
  if (!localPreviewSupported(input.spec.name)) return undefined;
  let server: Awaited<ReturnType<typeof startLocalPreviewMcp>> | undefined;
  let cleanup: (() => void) | undefined;
  try {
    server = await startLocalPreviewMcp({ ...input, previewUrl: input.previewUrl });
    const wired = localPreviewAdapter(input.spec, server, Boolean(input.onApproval));
    cleanup = wired.cleanup;
    input.write(`Local task tools connected: ${server.tools.join(', ')} (Ctrl+L for diagnostics).`);
    return {
      spec: wired.spec,
      // Claude's permission prompts go to the approve tool on this server.
      approvals: input.spec.name === 'claude' && Boolean(input.onApproval),
      async close() {
        await server!.close();
        wired.cleanup();
      },
    };
  } catch (error) {
    await server?.close();
    cleanup?.();
    input.write(`Local task tools unavailable: ${formatError(error)}`);
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
