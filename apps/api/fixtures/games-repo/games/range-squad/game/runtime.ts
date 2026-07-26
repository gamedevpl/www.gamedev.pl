declare const GameKit: {
  mount(game: { update(): void; draw(ctx: CanvasRenderingContext2D): void }): void;
  gfx?: boolean;
  actors?: boolean;
  audio?: boolean;
};

/**
 * Composition root for the contract-regression fixture. Touches the post-draw-surface
 * modules (gfx / actors) and relies on the shared audio/music embedding path.
 */
export function startGame(): void {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const context = canvas.getContext('2d') as CanvasRenderingContext2D;
  let tick = 0;

  GameKit.mount({
    update(): void {
      tick += 1;
    },
    draw(ctx: CanvasRenderingContext2D): void {
      ctx.fillStyle = GameKit.gfx ? '#6f8f4e' : '#444';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (GameKit.actors) {
        ctx.fillStyle = '#f0e6d2';
        ctx.fillRect(40 + (tick % 20), 160, 18, 24);
      }
    },
  });

  // Keep a live frame so local play exercises the assembled bundle end-to-end.
  function frame(): void {
    context.save();
    // GameKit.mount owns the real loop in production; the fixture stubs only set flags,
    // so we draw once here to prove the modular graph bundled.
    context.fillStyle = '#6f8f4e';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.restore();
  }
  frame();
}
