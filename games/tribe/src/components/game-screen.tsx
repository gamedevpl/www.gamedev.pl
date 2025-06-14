import React, { useRef, useEffect, useState } from 'react';
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
import { BerryBushEntity } from '../game/entities/plants/berry-bush/berry-bush-types';
import { findClosestEntity, findPlayerEntity } from '../game/utils/world-utils';
import { HUMAN_INTERACTION_RANGE, HUMAN_HUNGER_THRESHOLD_CRITICAL } from '../game/world-consts';
import { playSound } from '../game/sound/sound-utils';
import { SoundType } from '../game/sound/sound-types';

const INITIAL_STATE = initGame();

export const GameScreen: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const gameStateRef = useRef<GameWorldState>(INITIAL_STATE);
  const lastUpdateTimeRef = useRef<number>();
  const keysPressed = useRef<Set<string>>(new Set());
  const [isDebugOn, setIsDebugOn] = useState(false);

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
        renderGame(ctxRef.current, gameStateRef.current, isDebugOn);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isDebugOn]);

  const [stopLoop, startLoop, isActive] = useRafLoop((time) => {
    if (!ctxRef.current || !lastUpdateTimeRef.current) {
      lastUpdateTimeRef.current = time;
      return;
    }
    const deltaTime = (time - lastUpdateTimeRef.current) / 1000; // Seconds

    gameStateRef.current = updateWorld(gameStateRef.current, deltaTime);
    renderGame(ctxRef.current, gameStateRef.current, isDebugOn);
    lastUpdateTimeRef.current = time;

    if (gameStateRef.current.gameOver && appState !== 'gameOver') {
      playSound(SoundType.GameOver);
      setAppState('gameOver', {
        generations: gameStateRef.current.generationCount,
        cause: gameStateRef.current.causeOfGameOver || 'Unknown',
      });
    }
  }, false);

  useEffect(() => {
    startLoop();
    return stopLoop;
  }, [startLoop, stopLoop]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isActive() || gameStateRef.current.gameOver) return;

      const key = event.key.toLowerCase();
      if (key === 'p') {
        setIsDebugOn((prev) => !prev);
        return;
      }

      keysPressed.current.add(key);
      const playerEntity = findPlayerEntity(gameStateRef.current);

      if (!playerEntity) return;

      if (key === 'e') {
        const nearbyBush = findClosestEntity<BerryBushEntity>(
          playerEntity,
          gameStateRef.current,
          'berryBush',
          HUMAN_INTERACTION_RANGE,
          (b) => (b as BerryBushEntity).currentBerries > 0 && playerEntity.berries < playerEntity.maxBerries,
        );

        if (nearbyBush) {
          playerEntity.activeAction = 'gathering';
          playSound(SoundType.Gather);
        } else {
          const potentialPartner = findClosestEntity<HumanEntity>(
            playerEntity,
            gameStateRef.current,
            'human',
            HUMAN_INTERACTION_RANGE,
            (h) => {
              const human = h as HumanEntity;
              return (
                (human.id !== playerEntity.id &&
                  human.gender !== playerEntity.gender &&
                  human.isAdult &&
                  playerEntity.isAdult &&
                  human.hunger < HUMAN_HUNGER_THRESHOLD_CRITICAL &&
                  playerEntity.hunger < HUMAN_HUNGER_THRESHOLD_CRITICAL &&
                  (human.procreationCooldown || 0) <= 0 &&
                  (playerEntity.procreationCooldown || 0) <= 0 &&
                  (human.gender === 'female' ? !human.isPregnant : !playerEntity.isPregnant)) ||
                false
              );
            },
          );

          if (potentialPartner) {
            playerEntity.activeAction = 'procreating';
            playSound(SoundType.Procreate);
          }
        }
      } else if (key === 'f') {
        playerEntity.activeAction = 'eating';
        playSound(SoundType.Eat);
      } else if (key === 'arrowup' || key === 'w') {
        playerEntity.direction.y = -1;
        playerEntity.activeAction = 'moving';
      } else if (key === 'arrowdown' || key === 's') {
        playerEntity.direction.y = 1;
        playerEntity.activeAction = 'moving';
      } else if (key === 'arrowleft' || key === 'a') {
        playerEntity.direction.x = -1;
        playerEntity.activeAction = 'moving';
      } else if (key === 'arrowright' || key === 'd') {
        playerEntity.direction.x = 1;
        playerEntity.activeAction = 'moving';
      } else if (key === 'q') {
        const target = findClosestEntity<HumanEntity>(
          playerEntity,
          gameStateRef.current,
          'human',
          HUMAN_INTERACTION_RANGE,
          (h) => (h as HumanEntity).id !== playerEntity.id,
        );
        if (target) {
          playerEntity.activeAction = 'attacking';
          playerEntity.attackTargetId = target.id;
          playSound(SoundType.Attack);
        }
      } else if (key === ' ') {
        playerEntity.activeAction = 'idle';
      } else {
        return;
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (!isActive() || gameStateRef.current.gameOver) return;
      const key = event.key.toLowerCase();
      keysPressed.current.delete(key);

      const playerEntity = findPlayerEntity(gameStateRef.current);
      if (!playerEntity) return;

      if (key === 'arrowup' || key === 'w') {
        playerEntity.direction.y = 0;
      } else if (key === 'arrowdown' || key === 's') {
        playerEntity.direction.y = 0;
      } else if (key === 'arrowleft' || key === 'a') {
        playerEntity.direction.x = 0;
      } else if (key === 'arrowright' || key === 'd') {
        playerEntity.direction.x = 0;
      }

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
          playerEntity.activeAction = 'idle';
        }
      }

      if (
        !keysPressed.current.has('e') &&
        !keysPressed.current.has('f') &&
        (playerEntity.activeAction === 'gathering' ||
          playerEntity.activeAction === 'eating' ||
          playerEntity.activeAction === 'procreating')
      ) {
        playerEntity.activeAction = 'idle';
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isActive, appState, setAppState, startLoop, stopLoop, setIsDebugOn]);

  return <canvas ref={canvasRef} style={{ display: 'block', background: '#2c5234' }} />;
};
