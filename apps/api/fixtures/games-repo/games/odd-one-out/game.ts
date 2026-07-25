const canvas = document.getElementById('game') as HTMLCanvasElement;
const context = canvas.getContext('2d') as CanvasRenderingContext2D;
const statusLine = document.getElementById('game-status');

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const BOARD = Math.min(WIDTH, HEIGHT) - 90;
const BOARD_X = (WIDTH - BOARD) / 2;
const BOARD_Y = HEIGHT - BOARD - 20;
const GAP = 8;

let level = 1;
let gridSize = 2;
let oddIndex = 0;
let baseHue = 210;
let difference = 26;
let timeLeft = 20;
let running = true;
let cursor = 0;

function announce(message: string): void {
  if (statusLine) statusLine.textContent = message;
}

function startLevel(): void {
  gridSize = Math.min(6, 2 + Math.floor((level - 1) / 2));
  // The shrinking gap, not the growing grid, is what makes late levels hard.
  difference = Math.max(5, 26 - level * 1.6);
  baseHue = Math.floor(Math.random() * 360);
  oddIndex = Math.floor(Math.random() * gridSize * gridSize);
  cursor = 0;
}

function reset(): void {
  level = 1;
  timeLeft = 20;
  running = true;
  startLevel();
  announce('New game. Find the tile with a different shade.');
}

function tileRect(index: number): { x: number; y: number; size: number } {
  const size = (BOARD - GAP * (gridSize - 1)) / gridSize;
  const column = index % gridSize;
  const row = Math.floor(index / gridSize);
  return {
    x: BOARD_X + column * (size + GAP),
    y: BOARD_Y + row * (size + GAP),
    size,
  };
}

function pick(index: number): void {
  if (!running) {
    reset();
    return;
  }
  if (index === oddIndex) {
    level += 1;
    timeLeft = Math.min(30, timeLeft + 3);
    startLevel();
    announce(`Correct. Level ${level}.`);
  } else {
    timeLeft -= 3;
    announce('Wrong tile. Three seconds lost.');
  }
}

canvas.addEventListener('pointerdown', (event: PointerEvent) => {
  event.preventDefault();
  if (!running) {
    reset();
    return;
  }
  const bounds = canvas.getBoundingClientRect();
  const x = ((event.clientX - bounds.left) / bounds.width) * WIDTH;
  const y = ((event.clientY - bounds.top) / bounds.height) * HEIGHT;
  for (let index = 0; index < gridSize * gridSize; index += 1) {
    const rect = tileRect(index);
    if (x >= rect.x && x <= rect.x + rect.size && y >= rect.y && y <= rect.y + rect.size) {
      pick(index);
      return;
    }
  }
});

window.addEventListener('keydown', (event: KeyboardEvent) => {
  if (!running) {
    reset();
    return;
  }
  const column = cursor % gridSize;
  const row = Math.floor(cursor / gridSize);
  if (event.key === 'ArrowLeft') cursor = row * gridSize + Math.max(0, column - 1);
  else if (event.key === 'ArrowRight') cursor = row * gridSize + Math.min(gridSize - 1, column + 1);
  else if (event.key === 'ArrowUp') cursor = Math.max(0, row - 1) * gridSize + column;
  else if (event.key === 'ArrowDown') cursor = Math.min(gridSize - 1, row + 1) * gridSize + column;
  else if (event.key === 'Enter' || event.key === ' ') pick(cursor);
  else return;
  event.preventDefault();
});

function draw(): void {
  context.fillStyle = '#05060b';
  context.fillRect(0, 0, WIDTH, HEIGHT);

  for (let index = 0; index < gridSize * gridSize; index += 1) {
    const rect = tileRect(index);
    const lightness = index === oddIndex ? 58 + difference : 58;
    context.fillStyle = `hsl(${baseHue}, 62%, ${lightness}%)`;
    context.beginPath();
    context.roundRect(rect.x, rect.y, rect.size, rect.size, 10);
    context.fill();

    if (index === cursor && running) {
      context.strokeStyle = '#ffffff';
      context.lineWidth = 3;
      context.stroke();
    }
  }

  context.fillStyle = '#f2f4ff';
  context.font = '600 20px system-ui, sans-serif';
  context.textAlign = 'left';
  context.fillText(`Level ${level}`, 16, 32);
  context.textAlign = 'right';
  context.fillStyle = timeLeft < 5 ? '#ff6b8a' : '#8c93bb';
  context.fillText(`${Math.max(0, timeLeft).toFixed(1)}s`, WIDTH - 16, 32);

  if (!running) {
    context.fillStyle = 'rgba(5, 6, 11, 0.8)';
    context.fillRect(0, HEIGHT / 2 - 70, WIDTH, 140);
    context.textAlign = 'center';
    context.fillStyle = '#f2f4ff';
    context.font = '700 30px system-ui, sans-serif';
    context.fillText(`Level ${level} reached`, WIDTH / 2, HEIGHT / 2 - 12);
    context.font = '500 19px system-ui, sans-serif';
    context.fillStyle = '#aeb4d8';
    context.fillText('Tap or press any key to play again', WIDTH / 2, HEIGHT / 2 + 26);
  }
}

let lastFrame = performance.now();
function frame(now: number): void {
  const deltaSeconds = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  if (running) {
    timeLeft -= deltaSeconds;
    if (timeLeft <= 0) {
      timeLeft = 0;
      running = false;
      announce(`Out of time at level ${level}.`);
    }
  }
  draw();
  requestAnimationFrame(frame);
}

startLevel();
announce('Find the tile with a different shade.');
requestAnimationFrame(frame);
