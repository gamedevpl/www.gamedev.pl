const canvas = document.getElementById('game') as HTMLCanvasElement;
const context = canvas.getContext('2d') as CanvasRenderingContext2D;
const statusLine = document.getElementById('game-status');

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const PLAYER_SIZE = 26;
const PLAYER_Y = HEIGHT - PLAYER_SIZE - 16;

interface Block {
  x: number;
  y: number;
  size: number;
  speed: number;
}

let playerX = WIDTH / 2;
let targetX = playerX;
let blocks: Block[] = [];
let elapsed = 0;
let spawnTimer = 0;
let running = true;
let best = 0;
const heldKeys = new Set<string>();

function reset(): void {
  playerX = WIDTH / 2;
  targetX = playerX;
  blocks = [];
  elapsed = 0;
  spawnTimer = 0;
  running = true;
  announce('Run started.');
}

function announce(message: string): void {
  if (statusLine) statusLine.textContent = message;
}

/** Converts a pointer position to playfield coordinates, which the CSS may have scaled. */
function toPlayfieldX(clientX: number): number {
  const bounds = canvas.getBoundingClientRect();
  return ((clientX - bounds.left) / bounds.width) * WIDTH;
}

canvas.addEventListener('pointerdown', (event: PointerEvent) => {
  event.preventDefault();
  canvas.setPointerCapture(event.pointerId);
  if (!running) {
    reset();
    return;
  }
  targetX = toPlayfieldX(event.clientX);
});

canvas.addEventListener('pointermove', (event: PointerEvent) => {
  if (event.pressure === 0 && event.pointerType === 'touch') return;
  if (running) targetX = toPlayfieldX(event.clientX);
});

window.addEventListener('keydown', (event: KeyboardEvent) => {
  if (!running) {
    reset();
    return;
  }
  heldKeys.add(event.key);
  if (['ArrowLeft', 'ArrowRight', ' ', 'a', 'd'].includes(event.key)) event.preventDefault();
});

window.addEventListener('keyup', (event: KeyboardEvent) => {
  heldKeys.delete(event.key);
});

function keyboardDirection(): number {
  const left = heldKeys.has('ArrowLeft') || heldKeys.has('a') || heldKeys.has('A');
  const right = heldKeys.has('ArrowRight') || heldKeys.has('d') || heldKeys.has('D');
  return (right ? 1 : 0) - (left ? 1 : 0);
}

function update(deltaSeconds: number): void {
  if (!running) return;

  elapsed += deltaSeconds;

  const direction = keyboardDirection();
  if (direction !== 0) {
    targetX = playerX + direction * 420 * deltaSeconds;
  }
  // Easing toward the target keeps thumb-dragging smooth instead of teleporting.
  playerX += (targetX - playerX) * Math.min(1, deltaSeconds * 14);
  playerX = Math.max(PLAYER_SIZE / 2, Math.min(WIDTH - PLAYER_SIZE / 2, playerX));

  const difficulty = 1 + elapsed / 22;
  spawnTimer -= deltaSeconds;
  if (spawnTimer <= 0) {
    spawnTimer = Math.max(0.16, 0.62 / difficulty);
    const size = 18 + Math.random() * 26;
    blocks.push({
      x: Math.random() * (WIDTH - size) + size / 2,
      y: -size,
      size,
      speed: (120 + Math.random() * 90) * difficulty,
    });
  }

  for (const block of blocks) {
    block.y += block.speed * deltaSeconds;
  }
  blocks = blocks.filter((block) => block.y - block.size < HEIGHT + 40);

  for (const block of blocks) {
    const overlapsX = Math.abs(block.x - playerX) < (block.size + PLAYER_SIZE) / 2;
    const overlapsY = Math.abs(block.y - (PLAYER_Y + PLAYER_SIZE / 2)) < (block.size + PLAYER_SIZE) / 2;
    if (overlapsX && overlapsY) {
      running = false;
      best = Math.max(best, elapsed);
      announce(`Hit. You lasted ${elapsed.toFixed(1)} seconds.`);
      break;
    }
  }
}

function draw(): void {
  context.fillStyle = '#05060b';
  context.fillRect(0, 0, WIDTH, HEIGHT);

  for (const block of blocks) {
    context.fillStyle = '#ff6b8a';
    context.fillRect(block.x - block.size / 2, block.y - block.size / 2, block.size, block.size);
  }

  context.fillStyle = running ? '#7ce7ff' : '#4a5170';
  context.fillRect(playerX - PLAYER_SIZE / 2, PLAYER_Y, PLAYER_SIZE, PLAYER_SIZE);

  context.fillStyle = '#f2f4ff';
  context.font = '600 20px system-ui, sans-serif';
  context.textAlign = 'left';
  context.fillText(`${elapsed.toFixed(1)}s`, 16, 32);
  if (best > 0) {
    context.textAlign = 'right';
    context.fillStyle = '#8c93bb';
    context.fillText(`best ${best.toFixed(1)}s`, WIDTH - 16, 32);
  }

  if (!running) {
    context.fillStyle = 'rgba(5, 6, 11, 0.78)';
    context.fillRect(0, HEIGHT / 2 - 70, WIDTH, 140);
    context.textAlign = 'center';
    context.fillStyle = '#f2f4ff';
    context.font = '700 30px system-ui, sans-serif';
    context.fillText(`You lasted ${elapsed.toFixed(1)}s`, WIDTH / 2, HEIGHT / 2 - 12);
    context.font = '500 19px system-ui, sans-serif';
    context.fillStyle = '#aeb4d8';
    context.fillText('Tap or press any key to play again', WIDTH / 2, HEIGHT / 2 + 26);
  }
}

let lastFrame = performance.now();
function frame(now: number): void {
  const deltaSeconds = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  update(deltaSeconds);
  draw();
  requestAnimationFrame(frame);
}

announce('Drag to move. Avoid the falling blocks.');
requestAnimationFrame(frame);
