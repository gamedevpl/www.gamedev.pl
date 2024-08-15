import { Position, Monster, GridSize } from "./gameplay-types";

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

export const drawPlayer = (ctx: CanvasRenderingContext2D, position: Position, cellSize: number) => {
  const x = position.x * cellSize;
  const y = position.y * cellSize;
  
  ctx.fillStyle = 'blue';
  ctx.beginPath();
  ctx.arc(x + cellSize / 2, y + cellSize / 2, cellSize / 3, 0, Math.PI * 2);
  ctx.fill();
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

export const drawGameState = (
  ctx: CanvasRenderingContext2D, 
  gameState: {
    playerPosition: Position;
    goal: Position;
    obstacles: Position[];
    monsters: Monster[];
    powerUps?: { type: string; position: Position }[];
  },
  gridSize: GridSize,
  cellSize: number
) => {
  ctx.clearRect(0, 0, gridSize.width * cellSize, gridSize.height * cellSize);
  drawGrid(ctx, gridSize.width, gridSize.height, cellSize);
  drawObstacles(ctx, gameState.obstacles, cellSize);
  drawGoal(ctx, gameState.goal, cellSize);
  if (gameState.powerUps) {
    gameState.powerUps.forEach(powerUp => drawPowerUp(ctx, powerUp.position, cellSize, powerUp.type));
  }
  drawMonsters(ctx, gameState.monsters, cellSize);
  drawPlayer(ctx, gameState.playerPosition, cellSize);
};