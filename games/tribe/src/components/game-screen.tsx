import React, { useRef, useEffect } from 'react';
import { useRafLoop } from 'react-use';
import { initGame } from '../game';
import { updateWorld } from '../game/world-update';
import { GameWorldState } from '../game/world-types';
import { useGameContext } from '../context/game-context';
import { renderGame } from '../game/render';
import {} from '../game/entities/entities-types';
import { HumanEntity } from '../game/entities/characters/human/human-types';
import { BerryBushEntity } from '../game/entities/plants/berry-bush/berry-bush-types';
import { findClosestEntity, findPlayerEntity, getAvailablePlayerActions } from '../game/utils/world-utils';
import { HUMAN_INTERACTION_RANGE, HUMAN_HUNGER_THRESHOLD_CRITICAL, VIEWPORT_FOLLOW_SPEED } from '../game/world-consts';
import { playSound, updateMasterVolume } from '../game/sound/sound-utils';
import { playSoundAt } from '../game/sound/sound-manager';
import { SoundType } from '../game/sound/sound-types';
import { vectorLerp } from '../game/utils/math-utils';
import { Vector2D } from '../game/utils/math-types';
import { PlayerActionHint, UIButtonActionType } from '../game/ui/ui-types';

const INITIAL_STATE = initGame();

export const GameScreen: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const gameStateRef = useRef<GameWorldState>(INITIAL_STATE);
  const lastUpdateTimeRef = useRef<number>();
  const keysPressed = useRef<Set<string>>(new Set());
  const isDebugOnRef = useRef<boolean>(false);
  const viewportCenterRef = useRef<Vector2D>(INITIAL_STATE.viewportCenter);
  const playerActionHintsRef = useRef<PlayerActionHint[]>([]);

  const { appState, setAppState } = useGameContext();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    ctxRef.current = canvas.getContext('2d');

    const handleResize = () => {
      if (canvas && ctxRef.current) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        // gameStateRef.current.mapDimensions is already set in initGame
        renderGame(
          ctxRef.current,
          gameStateRef.current,
          isDebugOnRef.current,
          viewportCenterRef.current,
          playerActionHintsRef.current,
        );
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

    if (!gameStateRef.current.isPaused) {
      gameStateRef.current = updateWorld(gameStateRef.current, deltaTime);
    }

    const player = findPlayerEntity(gameStateRef.current);

    if (player) {
      playerActionHintsRef.current = getAvailablePlayerActions(gameStateRef.current, player);
    } else {
      playerActionHintsRef.current = [];
    }

    // Bug fix for viewport wrapping. This is a workaround, as the core logic
    // is in updateWorld. This component now maintains its own viewport position
    // for rendering purposes to ensure smooth wrapping.
    if (player) {
      const { mapDimensions } = gameStateRef.current;
      const { width, height } = mapDimensions;
      // Create a target position for the lerp that may be outside the world bounds
      // to ensure the lerp takes the shortest path.
      let targetPosition = { ...player.position };

      const dx = targetPosition.x - viewportCenterRef.current.x;
      if (Math.abs(dx) > width / 2) {
        if (dx > 0) {
          targetPosition.x -= width;
        } else {
          targetPosition.x += width;
        }
      }

      const dy = targetPosition.y - viewportCenterRef.current.y;
      if (Math.abs(dy) > height / 2) {
        if (dy > 0) {
          targetPosition.y -= height;
        } else {
          targetPosition.y += height;
        }
      }

      // Lerp towards the adjusted target.
      let newViewportCenter = vectorLerp(viewportCenterRef.current, targetPosition, VIEWPORT_FOLLOW_SPEED * deltaTime);

      // Wrap the new viewport center to stay within the world bounds.
      newViewportCenter = {
        x: ((newViewportCenter.x % width) + width) % width,
        y: ((newViewportCenter.y % height) + height) % height,
      };

      viewportCenterRef.current = newViewportCenter;
    } else {
      // If there's no player, keep the viewport ref in sync with the game state
      viewportCenterRef.current = gameStateRef.current.viewportCenter;
    }

    renderGame(
      ctxRef.current,
      gameStateRef.current,
      isDebugOnRef.current,
      viewportCenterRef.current,
      playerActionHintsRef.current,
    );
    lastUpdateTimeRef.current = time;

    if (gameStateRef.current.gameOver && appState !== 'gameOver') {
      playSound(SoundType.GameOver, {
        masterVolume: gameStateRef.current.masterVolume,
        isMuted: gameStateRef.current.isMuted,
      });
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
    const handleMouseDown = (event: MouseEvent) => {
      if (!isActive() || gameStateRef.current.gameOver || !canvasRef.current) return;

      const rect = canvasRef.current.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;

      const updateContext = { gameState: gameStateRef.current, deltaTime: 0 };

      gameStateRef.current.uiButtons.forEach((button) => {
        if (
          mouseX >= button.rect.x &&
          mouseX <= button.rect.x + button.rect.width &&
          mouseY >= button.rect.y &&
          mouseY <= button.rect.y + button.rect.height
        ) {
          const player = findPlayerEntity(gameStateRef.current);
          if (player) {
            playSoundAt(updateContext, SoundType.ButtonClick, player.position);
          }

          switch (button.action) {
            case UIButtonActionType.ToggleAutopilot:
              gameStateRef.current.isPlayerOnAutopilot = !gameStateRef.current.isPlayerOnAutopilot;
              break;
            case UIButtonActionType.ToggleMute:
              gameStateRef.current.isMuted = !gameStateRef.current.isMuted;
              break;
          }
        }
      });
    };

    window.addEventListener('mousedown', handleMouseDown);
    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
    };
  }, [isActive]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isActive() || gameStateRef.current.gameOver) return;

      const key = event.key.toLowerCase();

      if (key === 'm') {
        gameStateRef.current.isMuted = !gameStateRef.current.isMuted;
        updateMasterVolume(gameStateRef.current.masterVolume, gameStateRef.current.isMuted);
        return;
      }

      if (key === '=' || key === '+') {
        const newVolume = Math.min(1, gameStateRef.current.masterVolume + 0.1);
        gameStateRef.current.masterVolume = parseFloat(newVolume.toFixed(1));
        updateMasterVolume(gameStateRef.current.masterVolume, gameStateRef.current.isMuted);
        return;
      }

      if (key === '-') {
        const newVolume = Math.max(0, gameStateRef.current.masterVolume - 0.1);
        gameStateRef.current.masterVolume = parseFloat(newVolume.toFixed(1));
        updateMasterVolume(gameStateRef.current.masterVolume, gameStateRef.current.isMuted);
        return;
      }

      if (key === ' ') {
        event.preventDefault();
        gameStateRef.current.isPaused = !gameStateRef.current.isPaused;
        return;
      }

      if (key === 'o') {
        gameStateRef.current.isPlayerOnAutopilot = !gameStateRef.current.isPlayerOnAutopilot;
        return;
      }

      if (gameStateRef.current.isPlayerOnAutopilot) {
        return;
      }

      if (key === 'p') {
        isDebugOnRef.current = !isDebugOnRef.current;
        return;
      }

      keysPressed.current.add(key);
      const playerEntity = findPlayerEntity(gameStateRef.current);

      if (!playerEntity) return;
      const updateContext = { gameState: gameStateRef.current, deltaTime: 0 };

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
          playSoundAt(updateContext, SoundType.Gather, playerEntity.position);
        }
      } else if (key === 'r') {
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
          playSoundAt(updateContext, SoundType.Procreate, playerEntity.position);
        }
      } else if (key === 'f') {
        playerEntity.activeAction = 'eating';
        playSoundAt(updateContext, SoundType.Eat, playerEntity.position);
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
          playSoundAt(updateContext, SoundType.Attack, playerEntity.position);
        }
      } else {
        return;
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (!isActive() || gameStateRef.current.gameOver) return;
      const key = event.key.toLowerCase();
      keysPressed.current.delete(key);

      const playerEntity = findPlayerEntity(gameStateRef.current);
      if (!playerEntity || gameStateRef.current.isPlayerOnAutopilot) return;

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

      if (!keysPressed.current.has('e') && playerEntity.activeAction === 'gathering') {
        playerEntity.activeAction = 'idle';
      }
      if (!keysPressed.current.has('f') && playerEntity.activeAction === 'eating') {
        playerEntity.activeAction = 'idle';
      }
      if (!keysPressed.current.has('r') && playerEntity.activeAction === 'procreating') {
        playerEntity.activeAction = 'idle';
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
