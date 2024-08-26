import { interpolatePosition } from './animation-utils';
import { BlasterShot, Direction, GameState, Position } from '../gameplay-types';
import { toIsometric } from './isometric-utils';

export const TSUNAMI_TEARDOWN_DURATION = 1000;

type TsunamiWave = {
  tsunamiLevel: number;
  grid: Position;
  isoTop: Position[];
  isoFront: Position[] | undefined;
  isoSide: Position[] | undefined;
};

export const generateTsunamiWaves = (gameState: GameState, gridSize: number, cellSize: number): TsunamiWave[] => {
  let { tsunamiLevel } = gameState;
  if (gameState.tsunamiTeardownTimestamp) {
    tsunamiLevel = gameState.player.isVanishing
      ? 13
      : (1 - (Date.now() - gameState.tsunamiTeardownTimestamp) / TSUNAMI_TEARDOWN_DURATION) * 13;
  }

  const maxWaterHeight = cellSize * 0.8;
  const waves: TsunamiWave[] = [];

  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const topL = toIsometric(x, y);
      const topR = toIsometric(x + 1, y);
      const bottomL = toIsometric(x, y + 1);
      const bottomR = toIsometric(x + 1, y + 1);
      const waterHeight = Math.min(Math.max(tsunamiLevel / 13, 0), 1) * maxWaterHeight;

      const wave1 = waterHeight + Math.sin(Date.now() / 200 + x * 0.5) * 5;
      const wave2 = waterHeight + Math.sin(Date.now() / 200 + (x + 1) * 0.5) * 5;

      waves.push({
        tsunamiLevel,
        grid: { x, y },
        isoTop: [
          { x: topL.x, y: topL.y - wave1 },
          { x: bottomL.x, y: bottomL.y - wave2 },
          { x: bottomR.x, y: bottomR.y - wave2 },
          { x: topR.x, y: topR.y - wave1 },
        ],
        isoFront: y === gridSize - 1
          ? [
              { x: bottomL.x, y: bottomL.y - wave2 },
              { x: bottomL.x, y: bottomL.y },
              { x: bottomR.x, y: bottomR.y },
              { x: bottomR.x, y: bottomR.y - wave2 },
            ]
          : undefined,
        isoSide: x === gridSize - 1
          ? [
              { x: bottomR.x, y: bottomR.y - wave2 },
              { x: bottomR.x, y: bottomR.y },
              { x: topR.x, y: topR.y },
              { x: topR.x, y: topR.y - wave1 },
            ]
          : undefined,
      });
    }
  }

  return waves;
};

export const drawTsunamiWave = (ctx: CanvasRenderingContext2D, wave: TsunamiWave) => {
  ctx.save();
  ctx.globalAlpha = 0.6;

  const alpha = Math.floor((wave.tsunamiLevel / 13) * 255).toString(16).padStart(2, '0');
  drawTsunamieWavePlane(ctx, wave.isoTop, `#0064FF${alpha}`);
  if (wave.isoFront) {
    drawTsunamieWavePlane(ctx, wave.isoFront, `#002762${alpha}`);
  }
  if (wave.isoSide) {
    drawTsunamieWavePlane(ctx, wave.isoSide, `#003F9D${alpha}`);
  }

  ctx.restore();
};

function drawTsunamieWavePlane(ctx: CanvasRenderingContext2D, plane: Position[], fillStyle: string) {
  ctx.fillStyle = fillStyle;
  ctx.beginPath();
  ctx.moveTo(plane[0].x, plane[0].y);
  for (let i = 1; i < plane.length; i++) {
    ctx.lineTo(plane[i].x, plane[i].y);
  }
  ctx.closePath();
  ctx.fill();
}

export const drawSlideTrail = (ctx: CanvasRenderingContext2D, start: Position, end: Position) => {
  const { x: startX, y: startY } = toIsometric(start.x, start.y);
  const { x: endX, y: endY } = toIsometric(end.x, end.y);

  ctx.save();
  ctx.strokeStyle = '#00FFFF80';
  ctx.lineWidth = 3;
  ctx.setLineDash([5, 5]);

  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(endX, endY);
  ctx.stroke();

  ctx.restore();
};

export const drawBlasterShot = (ctx: CanvasRenderingContext2D, shot: BlasterShot, cellSize: number) => {
  if (Date.now() - shot.shotTimestamp > shot.duration) {
    return;
  }

  const pos = interpolatePosition(shot.endPosition, shot.startPosition, shot.shotTimestamp, shot.duration);
  const { x: isoX, y: isoY } = toIsometric(pos.x, pos.y);

  ctx.save();

  ctx.shadowColor = '#FF0000CC';
  ctx.shadowBlur = cellSize * 0.2;

  ctx.fillStyle = '#FF0000';
  ctx.strokeStyle = '#FF6464CC';
  ctx.lineWidth = 2;

  const shotLength = cellSize * 0.6;
  const shotWidth = cellSize * 0.1;

  ctx.translate(isoX, isoY);
  switch (shot.direction) {
    case Direction.Up:
      ctx.rotate(-Math.PI / 4);
      break;
    case Direction.Down:
      ctx.rotate((3 * Math.PI) / 4);
      break;
    case Direction.Left:
      ctx.rotate((-3 * Math.PI) / 4);
      break;
    case Direction.Right:
      ctx.rotate(Math.PI / 4);
      break;
  }

  ctx.beginPath();
  ctx.ellipse(0, 0, shotLength / 2, shotWidth / 2, 0, 0, 2 * Math.PI);
  ctx.fill();
  ctx.stroke();

  ctx.globalAlpha = 0.5;
  for (let i = 1; i <= 3; i++) {
    ctx.globalAlpha *= 0.5;
    ctx.beginPath();
    ctx.ellipse(-i * shotLength * 0.2, 0, shotLength / (2 + i), shotWidth / (2 + i), 0, 0, 2 * Math.PI);
    ctx.fill();
  }

  ctx.restore();
};