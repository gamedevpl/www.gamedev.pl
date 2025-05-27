import { GameWorldState, MAX_HUNGER, HOURS_PER_GAME_DAY } from './world-types';

const CHARACTER_RADIUS = 10;
const BERRY_BUSH_RADIUS = 15;
const BERRY_RADIUS = 3;

export function renderGame(ctx: CanvasRenderingContext2D, gameState: GameWorldState): void {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // Background
  ctx.fillStyle = '#2c5234'; // Dark green
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  if (gameState.gameOver) {
    ctx.fillStyle = 'white';
    ctx.font = '30px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Game Over!', ctx.canvas.width / 2, ctx.canvas.height / 2 - 60);
    ctx.font = '20px Arial';
    ctx.fillText(
      `Lineage Extinct. Generations Survived: ${gameState.generationCount}`,
      ctx.canvas.width / 2,
      ctx.canvas.height / 2 - 20,
    );
    ctx.fillText(`Cause: ${gameState.causeOfGameOver || 'Unknown'}`, ctx.canvas.width / 2, ctx.canvas.height / 2 + 20);
    return;
  }

  // Render Berry Bushes
  for (const bush of gameState.berryBushes) {
    ctx.fillStyle = '#006400'; // DarkGreen for bush
    ctx.beginPath();
    ctx.arc(bush.position.x, bush.position.y, BERRY_BUSH_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    // Draw berries on the bush
    ctx.fillStyle = 'red';
    for (let i = 0; i < bush.berriesAvailable; i++) {
      const angle = (i / bush.maxBerries) * Math.PI * 2 + Math.PI / 4; // Distribute berries around
      const berryX = bush.position.x + (BERRY_BUSH_RADIUS - BERRY_RADIUS * 2) * Math.cos(angle);
      const berryY = bush.position.y + (BERRY_BUSH_RADIUS - BERRY_RADIUS * 2) * Math.sin(angle);
      ctx.beginPath();
      ctx.arc(berryX, berryY, BERRY_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Render Characters
  for (const character of gameState.characters) {
    if (!character.isAlive) continue;

    if (character.type === 'player') {
      ctx.fillStyle = character.gender === 'male' ? 'blue' : 'pink';
    } else if (character.type === 'partner') {
      ctx.fillStyle = character.gender === 'male' ? 'lightblue' : 'lightpink';
    } else {
      // child
      ctx.fillStyle = character.gender === 'male' ? '#add8e6' : '#ffb6c1'; // Lighter shades for children
    }

    ctx.beginPath();
    ctx.arc(character.position.x, character.position.y, CHARACTER_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    // Outline player character
    if (character.id === gameState.currentPlayerId) {
      ctx.strokeStyle = 'gold';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  // Render UI
  ctx.fillStyle = 'white';
  ctx.font = '18px Press Start 2P, Arial'; // Using a common fallback
  ctx.textAlign = 'left';
  let uiLine = 1;
  const lineHeight = 22;

  const currentPlayer = gameState.characters.find((c) => c.id === gameState.currentPlayerId);

  if (currentPlayer && currentPlayer.isAlive) {
    ctx.fillText(`Hunger: ${Math.floor(currentPlayer.hunger)}/${MAX_HUNGER}`, 20, lineHeight * uiLine++);
    ctx.fillText(`Berries: ${currentPlayer.inventory}`, 20, lineHeight * uiLine++);
    ctx.fillText(`Age: ${Math.floor(currentPlayer.age)} yrs`, 20, lineHeight * uiLine++);
  }
  ctx.fillText(`Generation: ${gameState.generationCount}`, 20, lineHeight * uiLine++);
  ctx.fillText(`Time: Day ${Math.floor(gameState.time / HOURS_PER_GAME_DAY)}`, 20, lineHeight * uiLine++);
}
