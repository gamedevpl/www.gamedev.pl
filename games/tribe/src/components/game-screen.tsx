import React, { useRef, useEffect } from 'react';
import { useRafLoop } from 'react-use';
import { initGame } from '../game';
import { updateWorld } from '../game/world-update';
import { GameWorldState } from '../game/world-types';
import { MAP_HEIGHT } from '../game/world-consts';
import { MAP_WIDTH } from '../game/world-consts';
import { useGameContext } from '../context/game-context';
import { renderGame } from '../game/render';
import {} from '../game/entities/entities-types';
import { HumanEntity } from '../game/entities/characters/human/human-types';

const INITIAL_STATE = initGame();

export const GameScreen: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const gameStateRef = useRef<GameWorldState>(INITIAL_STATE);
  const lastUpdateTimeRef = useRef<number>();
  const keysPressed = useRef<Set<string>>(new Set());

  const { appState, setAppState } = useGameContext();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    ctxRef.current = canvas.getContext('2d');

    const handleResize = () => {
      if (canvas && ctxRef.current) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        gameStateRef.current.mapDimensions = { width: MAP_WIDTH, height: MAP_HEIGHT };
        renderGame(ctxRef.current, gameStateRef.current);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [stopLoop, startLoop, isActive] = useRafLoop((time) => {
    if (!ctxRef.current || !lastUpdateTimeRef.current) {
      lastUpdateTimeRef.current = time;
      return;
    }
    const deltaTime = (time - lastUpdateTimeRef.current) / 1000; // Seconds

    // Handle player movement based on keys pressed
    handlePlayerMovement();

    gameStateRef.current = updateWorld(gameStateRef.current, deltaTime);
    renderGame(ctxRef.current, gameStateRef.current);
    lastUpdateTimeRef.current = time;

    if (gameStateRef.current.gameOver && appState !== 'gameOver') {
      setAppState('gameOver', {
        generations: gameStateRef.current.generationCount,
        cause: gameStateRef.current.causeOfGameOver || 'Unknown',
      });
    }
  }, false);

  const handlePlayerMovement = () => {
    // Find the player entity
    const playerEntity = findPlayerEntity();
    if (!playerEntity) return;

    // Calculate movement direction based on keys pressed
    let directionX = 0;
    let directionY = 0;

    if (keysPressed.current.has('w') || keysPressed.current.has('arrowup')) directionY -= 1;
    if (keysPressed.current.has('s') || keysPressed.current.has('arrowdown')) directionY += 1;
    if (keysPressed.current.has('a') || keysPressed.current.has('arrowleft')) directionX -= 1;
    if (keysPressed.current.has('d') || keysPressed.current.has('arrowright')) directionX += 1;

    // Normalize diagonal movement
    if (directionX !== 0 && directionY !== 0) {
      const length = Math.sqrt(directionX * directionX + directionY * directionY);
      directionX /= length;
      directionY /= length;
    }

    // Set player direction and acceleration
    if (directionX !== 0 || directionY !== 0) {
      playerEntity.targetDirection = Math.atan2(directionY, directionX);
      playerEntity.acceleration = 10; // Adjust as needed
    } else {
      playerEntity.acceleration = 0;
    }
  };

  const findPlayerEntity = (): HumanEntity | undefined => {
    for (const entity of gameStateRef.current.entities.entities.values()) {
      if (entity.isPlayer && entity.type === 'human') {
        return entity as HumanEntity;
      }
    }
    return undefined;
  };

  useEffect(() => {
    startLoop();
    return stopLoop;
  }, [startLoop, stopLoop]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isActive() || gameStateRef.current.gameOver) return;

      const key = event.key.toLowerCase();
      keysPressed.current.add(key);

      // Handle interaction and eating
      if (key === 'e') {
        // TODO: Implement interaction with nearby entities (e.g., berry bushes)
      } else if (key === 'f') {
        // TODO: Implement eating from inventory
        const playerEntity = findPlayerEntity();
        if (playerEntity && playerEntity.berries > 0) {
          playerEntity.berries--;
          playerEntity.hunger = Math.max(0, playerEntity.hunger - 25); // Reduce hunger by 25 points
        }
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (!isActive() || gameStateRef.current.gameOver) return;
      const key = event.key.toLowerCase();
      keysPressed.current.delete(key);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isActive, appState, setAppState, startLoop, stopLoop]);

  return <canvas ref={canvasRef} style={{ display: 'block', background: '#2c5234' }} />;
};
