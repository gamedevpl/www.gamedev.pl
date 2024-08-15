import { Position, Monster, GridSize, Bonus, BonusType, Explosion } from "./gameplay-types";

export const drawGrid = (ctx: CanvasRenderingContext2D, width: number, height: number, cellSize: number) => {
  ctx.strokeStyle = '#ccc';
  ctx.lineWidth = 1;

  for (let i = 0; i <= width; i++) {
    const pos = i * cellSize;
    
    // Draw vertical line
    ctx.beginPath();
    ctx.moveTo(pos, 0);
    ctx.lineTo(pos, height * cellSize);
    ctx.stroke();
  }

  for (let j = 0; j <= height; j++) {
    const pos = j * cellSize;
    
    // Draw horizontal line
    ctx.beginPath();
    ctx.moveTo(0, pos);
    ctx.lineTo(width * cellSize, pos);
    ctx.stroke();
  }
};

export const drawPlayer = (ctx: CanvasRenderingContext2D, position: Position, cellSize: number, isInvisible: boolean = false) => {
  const x = position.x * cellSize;
  const y = position.y * cellSize;
  
  ctx.fillStyle = 'blue';
  if (isInvisible) {
    ctx.globalAlpha = 0.5; // Make player semi-transparent when invisible
  }
  ctx.beginPath();
  ctx.arc(x + cellSize / 2, y + cellSize / 2, cellSize / 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1; // Reset global alpha
};

export const drawMonsters = (ctx: CanvasRenderingContext2D, monsters: Monster[], cellSize: number) => {
  ctx.fillStyle = 'red';
  
  monsters.forEach(monster => {
    const x = monster.position.x * cellSize;
    const y = monster.position.y * cellSize;
    
    ctx.beginPath();
    ctx.moveTo(x + cellSize / 2, y);
    ctx.lineTo(x + cellSize, y + cellSize);
    ctx.lineTo(x, y + cellSize);
    ctx.closePath();
    ctx.fill();
  });
};

export const drawGoal = (ctx: CanvasRenderingContext2D, position: Position, cellSize: number) => {
  const x = position.x * cellSize;
  const y = position.y * cellSize;
  
  ctx.fillStyle = 'green';
  ctx.fillRect(x, y, cellSize, cellSize);
};

export const drawObstacles = (ctx: CanvasRenderingContext2D, obstacles: Position[], cellSize: number) => {
  ctx.fillStyle = 'gray';
  
  obstacles.forEach(obstacle => {
    const x = obstacle.x * cellSize;
    const y = obstacle.y * cellSize;
    
    // Fill the obstacle
    ctx.fillRect(x, y, cellSize, cellSize);
    
    // Add a cross pattern to make obstacles more visible
    ctx.strokeStyle = 'darkgray';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + cellSize, y + cellSize);
    ctx.moveTo(x + cellSize, y);
    ctx.lineTo(x, y + cellSize);
    ctx.stroke();
  });
};

export const drawBonuses = (ctx: CanvasRenderingContext2D, bonuses: Bonus[], cellSize: number) => {
  bonuses.forEach(bonus => {
    const x = bonus.position.x * cellSize;
    const y = bonus.position.y * cellSize;
    
    ctx.fillStyle = getBonusColor(bonus.type);
    ctx.beginPath();
    ctx.arc(x + cellSize / 2, y + cellSize / 2, cellSize / 4, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = 'white';
    ctx.font = `${cellSize / 3}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    ctx.fillText(getBonusSymbol(bonus.type), x + cellSize / 2, y + cellSize / 2);
  });
};

const getBonusColor = (bonusType: BonusType): string => {
  switch (bonusType) {
    case BonusType.CapOfInvisibility:
      return 'purple';
    case BonusType.ConfusedMonsters:
      return 'orange';
    case BonusType.LandMine:
      return 'brown';
    case BonusType.TimeBomb:
      return 'black';
    case BonusType.Crusher:
      return 'pink';
    case BonusType.Builder:
      return 'cyan';
    default:
      return 'yellow';
  }
};

const getBonusSymbol = (bonusType: BonusType): string => {
  switch (bonusType) {
    case BonusType.CapOfInvisibility:
      return 'I';
    case BonusType.ConfusedMonsters:
      return 'C';
    case BonusType.LandMine:
      return 'L';
    case BonusType.TimeBomb:
      return 'T';
    case BonusType.Crusher:
      return 'X';
    case BonusType.Builder:
      return 'B';
    default:
      return '?';
  }
};

export const drawLandMines = (ctx: CanvasRenderingContext2D, landMines: Position[], cellSize: number) => {
  ctx.fillStyle = 'brown';
  
  landMines.forEach(mine => {
    const x = mine.x * cellSize;
    const y = mine.y * cellSize;
    
    ctx.beginPath();
    ctx.arc(x + cellSize / 2, y + cellSize / 2, cellSize / 4, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = 'white';
    ctx.font = `${cellSize / 3}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('L', x + cellSize / 2, y + cellSize / 2);
  });
};

export const drawTimeBombs = (ctx: CanvasRenderingContext2D, timeBombs: { position: Position, timer: number }[], cellSize: number) => {
  ctx.fillStyle = 'black';
  
  timeBombs.forEach(bomb => {
    const x = bomb.position.x * cellSize;
    const y = bomb.position.y * cellSize;
    
    ctx.beginPath();
    ctx.arc(x + cellSize / 2, y + cellSize / 2, cellSize / 4, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = 'white';
    ctx.font = `${cellSize / 3}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(bomb.timer.toString(), x + cellSize / 2, y + cellSize / 2);
  });
};

export const drawExplosions = (ctx: CanvasRenderingContext2D, explosions: Explosion[], cellSize: number) => {
  ctx.fillStyle = 'rgba(255, 165, 0, 0.7)'; // Semi-transparent orange

  for (const {position} of explosions) {
    const x = position.x * cellSize;
    const y = position.y * cellSize;

    ctx.fillRect(x - cellSize, y - cellSize, cellSize * 3, cellSize * 3);

    // Draw explosion lines
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      ctx.moveTo(x + cellSize / 2, y + cellSize / 2);
      const angle = (Math.PI / 4) * i;
      ctx.lineTo(
        x + cellSize / 2 + Math.cos(angle) * cellSize,
        y + cellSize / 2 + Math.sin(angle) * cellSize
      );
      ctx.stroke();
    }
  }
};

export const drawGameState = (
  ctx: CanvasRenderingContext2D, 
  gameState: {
    playerPosition: Position;
    goal: Position;
    obstacles: Position[];
    monsters: Monster[];
    powerUps?: { type: string; position: Position }[];
    bonuses: Bonus[];
    landMines: Position[];
    timeBombs: { position: Position, timer: number }[];
    activeBonus: BonusType | null;
  },
  gridSize: GridSize,
  cellSize: number
) => {
  ctx.clearRect(0, 0, gridSize.width * cellSize, gridSize.height * cellSize);
  drawGrid(ctx, gridSize.width, gridSize.height, cellSize);
  drawObstacles(ctx, gameState.obstacles, cellSize);
  drawBonuses(ctx, gameState.bonuses, cellSize);
  drawLandMines(ctx, gameState.landMines, cellSize);
  drawTimeBombs(ctx, gameState.timeBombs, cellSize);
  if (gameState.powerUps) {
    gameState.powerUps.forEach(powerUp => drawPowerUp(ctx, powerUp.position, cellSize, powerUp.type));
  }
  drawMonsters(ctx, gameState.monsters, cellSize);
  drawPlayer(ctx, gameState.playerPosition, cellSize, gameState.activeBonus === BonusType.CapOfInvisibility);
  drawGoal(ctx, gameState.goal, cellSize);
};

export const drawPowerUp = (ctx: CanvasRenderingContext2D, position: Position, cellSize: number, type: string) => {
  const x = position.x * cellSize;
  const y = position.y * cellSize;
  
  ctx.fillStyle = 'yellow';
  ctx.beginPath();
  ctx.arc(x + cellSize / 2, y + cellSize / 2, cellSize / 4, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.fillStyle = 'black';
  ctx.font = `${cellSize / 3}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let symbol = '?';
  switch (type) {
    case 'StepEraser':
      symbol = 'E';
      break;
    case 'MonsterFreeze':
      symbol = 'F';
      break;
    case 'Teleport':
      symbol = 'T';
      break;
  }
  ctx.fillText(symbol, x + cellSize / 2, y + cellSize / 2);
};

export const drawTooltip = (ctx: CanvasRenderingContext2D, position: Position, cellSize: number, text: string) => {
  const x = position.x * cellSize;
  const y = position.y * cellSize;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(x, y - cellSize, cellSize, cellSize / 2);

  ctx.fillStyle = 'white';
  ctx.font = `${cellSize / 4}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + cellSize / 2, y - cellSize / 4);
};