import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { createSessionController } from '../../cli/src/session-controller.js';
import { startSessionBrowser } from '../../cli/src/session-browser-server.js';
import { startLocalPreviewMcp } from '../../cli/src/local-preview-mcp.js';

const html = `<!doctype html><html><head></head><body>
<canvas id="game" width="320" height="240" tabindex="0"></canvas>
<script>
const canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d'),keys=new Set();
const boot=crypto.randomUUID();let x=30,frame=0,paused=false,pointing=false;
addEventListener('keydown',e=>keys.add(e.key));addEventListener('keyup',e=>keys.delete(e.key));
addEventListener('pointerdown',()=>pointing=true);addEventListener('pointerup',()=>pointing=false);
document.addEventListener('gdpl-pause',()=>paused=true);
document.addEventListener('gdpl-resume',()=>paused=false);
function paint(){ctx.fillStyle='#204040';ctx.fillRect(0,0,320,240);ctx.fillStyle='#ff8080';ctx.fillRect(x,90,20,20);h.metadata={x,frame,boot,state:'playing'};return h.metadata;}
function step(){frame++;if(keys.has('ArrowRight'))x++;if(keys.has('ArrowLeft'))x--;return paint();}
const h=window.__GAME_HARNESS__={ready:true,frame:0,metadata:{},step(){const r=step();h.frame=frame;return r},paint,pause(){paused=true},resume(){paused=false},screenshot:()=>canvas.toDataURL(),snapshotState:()=>({x,frame}),restoreState:s=>{x=s.x;frame=s.frame;paint();return true}};
function loop(){if(!paused)h.step();requestAnimationFrame(loop)}paint();requestAnimationFrame(loop);
window.fixture={boot,keys,position:()=>x,paused:()=>paused,pointing:()=>pointing};
</script></body></html>`;

export async function liveGameFixture(initial = html, hot?: unknown) {
  let current = initial,
    currentHot = hot;
  const preview = createServer((req, res) => {
    if (req.url === '/status')
      res.end(
        JSON.stringify({
          revision: createHash('sha256').update(current).digest('hex'),
          busy: false,
          stale: false,
          error: '',
          ...(currentHot ? { hot: true } : {}),
        }),
      );
    else if (req.url === '/hot')
      res.end(JSON.stringify({ revision: createHash('sha256').update(current).digest('hex'), hot: currentHot }));
    else res.end(current);
  });
  await new Promise<void>((resolve) => preview.listen(0, '127.0.0.1', resolve));
  const previewUrl = `http://127.0.0.1:${(preview.address() as AddressInfo).port}/`;
  const session = createSessionController('Live game fixture');
  const server = await startSessionBrowser(session);
  server.setPreview(previewUrl);
  const agents: Array<Awaited<ReturnType<typeof startLocalPreviewMcp>>> = [];
  const agent = async () => {
    const controller = new AbortController();
    const mcp = await startLocalPreviewMcp({ previewUrl, abort: controller.signal, write: () => {} });
    agents.push(mcp);
    return {
      stop: () => controller.abort(),
      async call(name: string, args = {}) {
        const response = await fetch(mcp.url, {
          method: 'POST',
          headers: { authorization: mcp.authorization, 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
        });
        const { result } = (await response.json()) as {
          result: { isError?: boolean; content: Array<{ type: string; text?: string; data?: string }> };
        };
        if (result.isError) throw Error(result.content[0]!.text);
        return {
          ...JSON.parse(result.content[0]!.text!),
          image: result.content.find((c) => c.type === 'image')?.data,
        } as {
          tabId: string;
          revision: string;
          image?: string;
          data: {
            observation: { frame: number; snapshot: Record<string, unknown>; stepped: boolean };
            diagnostics: unknown;
          };
        };
      },
    };
  };
  return {
    url: server.url,
    agent,
    update(next?: string, hot?: unknown) {
      current = next ?? current.replace("'#ff8080'", "'#80ff80'");
      currentHot = hot;
    },
    async close() {
      for (const mcp of agents) await mcp.close();
      await server.close();
      session.close();
      preview.closeAllConnections();
      await new Promise<void>((resolve) => preview.close(() => resolve()));
    },
  };
}
