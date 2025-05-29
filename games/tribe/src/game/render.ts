import {
  GameWorldState,
  MAX_HUNGER,
  HOURS_PER_GAME_DAY,
  INTERACTION_RANGE,
  PLAYER_MAX_INVENTORY,
  CHILD_TO_ADULT_AGE_YEARS,
  HUNGER_PROCREATION_THRESHOLD,
  Character,
  CHILD_HUNGER_THRESHOLD_FOR_SEEKING_PARENT,
} from './world-types';

const CHARACTER_RADIUS = 10;
const BERRY_BUSH_RADIUS = 15;
const BERRY_RADIUS = 3;
const INTERACTION_HIGHLIGHT_COLOR = 'gold';
const INTERACTION_HIGHLIGHT_LINE_WIDTH = 2;
const SMALL_TEXT_FONT = '10px Press Start 2P, Arial';
const HUNGRY_CHILD_INDICATOR_COLOR = 'orange';

function distance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
}

function canPlayerFeedChild(player: Character, child: Character): boolean {
  if (!player || !child || player.inventory <= 0 || child.type !== 'child') {
    return false;
  }
  const dist = distance(player.position.x, player.position.y, child.position.x, child.position.y);
  return dist < INTERACTION_RANGE;
}

export function renderGame(ctx: CanvasRenderingContext2D, gameState: GameWorldState): void {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // Background
  ctx.fillStyle = '#2c5234'; // Dark green
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  if (gameState.gameOver) {
    ctx.fillStyle = 'white';
    ctx.font = '30px Press Start 2P, Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Game Over!', ctx.canvas.width / 2, ctx.canvas.height / 2 - 60);
    ctx.font = '20px Press Start 2P, Arial';
    ctx.fillText(
      `Lineage Extinct. Generations Survived: ${gameState.generationCount}`,
      ctx.canvas.width / 2,
      ctx.canvas.height / 2 - 20,
    );
    ctx.fillText(`Cause: ${gameState.causeOfGameOver || 'Unknown'}`, ctx.canvas.width / 2, ctx.canvas.height / 2 + 20);
    return;
  }

  const currentPlayer = gameState.characters.find((c) => c.id === gameState.currentPlayerId);

  // Render Interaction Hints
  if (currentPlayer && currentPlayer.isAlive) {
    // Berry Bush Interaction Hint
    for (const bush of gameState.berryBushes) {
      if (bush.berriesAvailable > 0 && currentPlayer.inventory < PLAYER_MAX_INVENTORY) {
        const dist = distance(currentPlayer.position.x, currentPlayer.position.y, bush.position.x, bush.position.y);
        if (dist < INTERACTION_RANGE) {
          ctx.strokeStyle = INTERACTION_HIGHLIGHT_COLOR;
          ctx.lineWidth = INTERACTION_HIGHLIGHT_LINE_WIDTH;
          ctx.beginPath();
          ctx.arc(
            bush.position.x,
            bush.position.y,
            BERRY_BUSH_RADIUS + INTERACTION_HIGHLIGHT_LINE_WIDTH,
            0,
            Math.PI * 2,
          );
          ctx.stroke();
        }
      }
    }

    // Character Procreation Interaction Hint
    if (currentPlayer.type !== 'child' && currentPlayer.age >= CHILD_TO_ADULT_AGE_YEARS) {
      for (const character of gameState.characters) {
        if (
          character.id !== currentPlayer.id &&
          character.isAlive &&
          character.type !== 'child' &&
          character.age >= CHILD_TO_ADULT_AGE_YEARS &&
          character.gender !== currentPlayer.gender &&
          (!currentPlayer.procreationCooldownEndsAtGameTime ||
            gameState.time >= currentPlayer.procreationCooldownEndsAtGameTime) &&
          (!character.procreationCooldownEndsAtGameTime ||
            gameState.time >= character.procreationCooldownEndsAtGameTime) &&
          currentPlayer.hunger < HUNGER_PROCREATION_THRESHOLD &&
          character.hunger < HUNGER_PROCREATION_THRESHOLD
        ) {
          const dist = distance(
            currentPlayer.position.x,
            currentPlayer.position.y,
            character.position.x,
            character.position.y,
          );
          if (dist < INTERACTION_RANGE) {
            ctx.strokeStyle = INTERACTION_HIGHLIGHT_COLOR;
            ctx.lineWidth = INTERACTION_HIGHLIGHT_LINE_WIDTH;
            ctx.beginPath();
            ctx.arc(
              character.position.x,
              character.position.y,
              CHARACTER_RADIUS + INTERACTION_HIGHLIGHT_LINE_WIDTH,
              0,
              Math.PI * 2,
            );
            ctx.stroke();
          }
        }
      }
    }

    // Child Feeding Interaction Hint
    for (const child of gameState.characters) {
      if (child.type === 'child' && child.isAlive && canPlayerFeedChild(currentPlayer, child)) {
        ctx.strokeStyle = INTERACTION_HIGHLIGHT_COLOR;
        ctx.lineWidth = INTERACTION_HIGHLIGHT_LINE_WIDTH;
        ctx.beginPath();
        ctx.arc(
          child.position.x,
          child.position.y,
          CHARACTER_RADIUS + INTERACTION_HIGHLIGHT_LINE_WIDTH + 2, // Slightly larger highlight for feeding
          0,
          Math.PI * 2,
        );
        ctx.stroke();
      }
    }
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
      if (
        character.hunger > CHILD_HUNGER_THRESHOLD_FOR_SEEKING_PARENT &&
        character.currentAction === 'childSeekingParentForFood'
      ) {
        // Optional: Add a visual cue if child is actively seeking parent due to hunger
        ctx.strokeStyle = HUNGRY_CHILD_INDICATOR_COLOR;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(character.position.x, character.position.y, CHARACTER_RADIUS + 2, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    ctx.beginPath();
    ctx.arc(character.position.x, character.position.y, CHARACTER_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    // Outline player character
    if (character.id === gameState.currentPlayerId) {
      ctx.strokeStyle = 'lime';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Display Hunger Level above character
    ctx.fillStyle = 'white';
    ctx.font = SMALL_TEXT_FONT;
    ctx.textAlign = 'center';
    ctx.fillText(
      `H:${Math.floor(character.hunger)}`,
      character.position.x,
      character.position.y - CHARACTER_RADIUS - 14,
    );

    // Display Age above character, below hunger
    ctx.fillStyle = 'white';
    ctx.font = SMALL_TEXT_FONT;
    ctx.textAlign = 'center';
    ctx.fillText(`A:${Math.floor(character.age)}`, character.position.x, character.position.y - CHARACTER_RADIUS - 2);

    // Display Gestation Progress below character for gestating adult females
    if (
      character.gender === 'female' &&
      character.age >= CHILD_TO_ADULT_AGE_YEARS &&
      character.gestationEndsAtGameTime &&
      character.gestationStartTime &&
      character.gestationEndsAtGameTime > character.gestationStartTime &&
      gameState.time < character.gestationEndsAtGameTime
    ) {
      const totalGestationDuration = character.gestationEndsAtGameTime - character.gestationStartTime;
      const elapsedGestation = gameState.time - character.gestationStartTime;
      const progressPercentage =
        totalGestationDuration > 0 ? Math.min(100, Math.max(0, (elapsedGestation / totalGestationDuration) * 100)) : 0;
      ctx.fillStyle = 'lightcoral'; // Differentiate gestation text color
      ctx.font = SMALL_TEXT_FONT;
      ctx.textAlign = 'center';
      ctx.fillText(
        `G:${Math.floor(progressPercentage)}%`,
        character.position.x,
        character.position.y + CHARACTER_RADIUS + 12,
      );
    }
  }

  // Render UI
  ctx.fillStyle = 'white';
  ctx.font = '18px Press Start 2P, Arial'; // Using a common fallback
  ctx.textAlign = 'left';
  let uiLine = 1;
  const lineHeight = 22;

  if (currentPlayer && currentPlayer.isAlive) {
    ctx.fillText(`Hunger: ${Math.floor(currentPlayer.hunger)}/${MAX_HUNGER}`, 20, lineHeight * uiLine++);
    ctx.fillText(`Berries: ${currentPlayer.inventory}`, 20, lineHeight * uiLine++);
    ctx.fillText(`Age: ${Math.floor(currentPlayer.age)} yrs`, 20, lineHeight * uiLine++);

    // Gestation Progress Display (for current player, in main UI block)
    if (
      currentPlayer.gender === 'female' &&
      currentPlayer.gestationEndsAtGameTime &&
      currentPlayer.gestationStartTime &&
      currentPlayer.gestationEndsAtGameTime > currentPlayer.gestationStartTime &&
      gameState.time < currentPlayer.gestationEndsAtGameTime // Also check if currently gestating
    ) {
      const totalGestationDuration = currentPlayer.gestationEndsAtGameTime - currentPlayer.gestationStartTime;
      const elapsedGestation = gameState.time - currentPlayer.gestationStartTime;
      const progressPercentage =
        totalGestationDuration > 0 ? Math.min(100, Math.max(0, (elapsedGestation / totalGestationDuration) * 100)) : 0;
      ctx.fillText(`Gestation: ${Math.floor(progressPercentage)}%`, 20, lineHeight * uiLine++);
    }
  }
  ctx.fillText(`Generation: ${gameState.generationCount}`, 20, lineHeight * uiLine++);
  ctx.fillText(`Time: Day ${Math.floor(gameState.time / HOURS_PER_GAME_DAY)}`, 20, lineHeight * uiLine++);
}
