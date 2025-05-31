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
      const playerEntity = findPlayerEntity();

      if (!playerEntity) return;

      // Handle interaction and eating
      if (key === 'e') {
        playerEntity.activeAction = 'gathering'; // Set to gathering when 'e' is pressed
      } else if (key === 'f') {
        playerEntity.activeAction = 'eating'; // Set to eating when 'f' is pressed
      } else if (key === 'arrowup' || key === 'w') {
        playerEntity.direction.y = -1; // Move up
        playerEntity.activeAction = 'moving';
      } else if (key === 'arrowdown' || key === 's') {
        playerEntity.direction.y = 1; // Move down
        playerEntity.activeAction = 'moving';
      } else if (key === 'arrowleft' || key === 'a') {
        playerEntity.direction.x = -1; // Move left
        playerEntity.activeAction = 'moving';
      } else if (key === 'arrowright' || key === 'd') {
        playerEntity.direction.x = 1; // Move right
        playerEntity.activeAction = 'moving';
      } else if (key === ' ') {
        playerEntity.activeAction = 'idle'; // Set to idle when space is pressed
      } else {
        return; // Ignore other keys
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (!isActive() || gameStateRef.current.gameOver) return;
      const key = event.key.toLowerCase();
      keysPressed.current.delete(key);

      const playerEntity = findPlayerEntity();
      if (!playerEntity) return;

      if (key === 'arrowup' || key === 'w') {
        playerEntity.direction.y = 0; // Stop moving up
      } else if (key === 'arrowdown' || key === 's') {
        playerEntity.direction.y = 0; // Stop moving down
      } else if (key === 'arrowleft' || key === 'a') {
        playerEntity.direction.x = 0; // Stop moving left
      } else if (key === 'arrowright' || key === 'd') {
        playerEntity.direction.x = 0; // Stop moving right
      }

      // if none of the movement keys are pressed, set activeAction to idle
      if (
        !keysPressed.current.has('arrowup') &&
        !keysPressed.current.has('arrowdown') &&
        !keysPressed.current.has('arrowleft') &&
        !keysPressed.current.has('arrowright') &&
        !keysPressed.current.has('w') &&
        !keysPressed.current.has('a') &&
        !keysPressed.current.has('s') &&
        !keysPressed.current.has('d')
      ) {
        if (playerEntity && playerEntity.activeAction === 'moving') {
          playerEntity.activeAction = 'idle'; // Set to idle when no movement keys are pressed
        }
      }

      if (
        !keysPressed.current.has('e') &&
        !keysPressed.current.has('f') &&
        (playerEntity.activeAction === 'gathering' || playerEntity.activeAction === 'eating')
      ) {
        playerEntity.activeAction = 'idle'; // Set to idle when not gathering or eating
      }
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
