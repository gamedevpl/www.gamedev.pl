import { runCapturePlan, type CapturePlan, type PlanPointer, type Snapshot } from '../src/capture-plan-runtime.js';

type Harness = {
  ready: boolean;
  captureMode: boolean;
  metadata: Snapshot;
  step(dt: number): void;
  paint(): void;
};

export function start(plan: CapturePlan, mark?: string): void {
  addEventListener(
    'load',
    () => {
      void run(plan, mark);
    },
    { once: true },
  );
}

async function run(plan: CapturePlan, mark?: string): Promise<void> {
  const deadline = performance.now() + 60_000;
  const notify = (type: string, value: unknown) =>
    parent.postMessage({ source: 'gdpl-capture', type, value }, location.origin);
  try {
    const harness = () => (window as Window & { __GAME_HARNESS__?: Harness }).__GAME_HARNESS__;
    while (!harness()?.ready) {
      if (performance.now() > deadline) throw new Error('GameKit harness did not become ready for the capture plan.');
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const h = harness()!;
    if (!h.captureMode || typeof h.step !== 'function' || typeof h.paint !== 'function')
      throw new Error('This capture plan requires a GameKit deterministic capture harness.');
    const canvas = document.getElementById('game') as HTMLCanvasElement | null;
    if (!canvas) throw new Error('Capture plan requires the #game canvas.');
    let frame = 0;
    const reached = {};
    const resolvePointer = (target: PlanPointer) => {
      const x = target.fromMetadata ? Number(h.metadata[target.fromMetadata.x]) / canvas.width : target.x!;
      const y = target.fromMetadata ? Number(h.metadata[target.fromMetadata.y]) / canvas.height : target.y!;
      if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('Pointer target is unavailable.');
      return { x, y };
    };
    try {
      await runCapturePlan(plan, {
        async step(next) {
          if (performance.now() > deadline) throw new Error('Capture plan exceeded its 60-second runtime limit.');
          frame = next;
          h.step(1 / plan.fps);
          if (next % 60 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
        },
        key(type, key, code) {
          window.dispatchEvent(new KeyboardEvent(type, { key, code: code || key, bubbles: true, cancelable: true }));
        },
        resolvePointer,
        pointer(type, target, buttons, synthesizeClick) {
          const rect = canvas.getBoundingClientRect();
          const scale = Math.min(rect.width / canvas.width, rect.height / canvas.height);
          const clientX = rect.left + (rect.width - canvas.width * scale) / 2 + target.x * canvas.width * scale;
          const clientY = rect.top + (rect.height - canvas.height * scale) / 2 + target.y * canvas.height * scale;
          canvas.dispatchEvent(
            new PointerEvent(type, {
              clientX,
              clientY,
              bubbles: true,
              button: 0,
              buttons,
              pointerId: 1,
              pointerType: 'mouse',
            }),
          );
          if (synthesizeClick) {
            const click = new MouseEvent('click', { clientX, clientY, bubbles: true, button: 0 });
            Object.defineProperties(click, { clientX: { value: clientX }, clientY: { value: clientY } });
            canvas.dispatchEvent(click);
          }
        },
        snapshot: () => h.metadata,
        mark(name) {
          if (name === mark) throw reached;
        },
      });
      if (mark) throw new Error(`Capture mark ${JSON.stringify(mark)} was not reached.`);
    } catch (error) {
      if (error !== reached) throw error;
    }
    h.paint();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const snapshot = Object.fromEntries(
      Object.entries(h.metadata ?? {})
        .slice(0, 40)
        .filter(
          ([key, value]) =>
            key.length <= 128 &&
            (value === null ||
              typeof value === 'boolean' ||
              typeof value === 'number' ||
              (typeof value === 'string' && value.length <= 256)),
        ),
    );
    notify('result', { frame, snapshot });
  } catch (error) {
    notify('error', (error instanceof Error ? error.message : 'Capture plan failed.').slice(0, 2500));
  }
}
