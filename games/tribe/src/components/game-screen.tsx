import React, { useRef, useEffect, useState } from 'react';
import { useRafLoop } from 'react-use';
import { updateWorld } from '../game/world-update';
import { GameWorldState } from '../game/world-types';
import { useGameContext } from '../context/game-context';
import { renderGame } from '../game/render';
import {} from '../game/entities/entities-types';
import { HumanEntity } from '../game/entities/characters/human/human-types';
import { BerryBushEntity } from '../game/entities/plants/berry-bush/berry-bush-types';
import {
  findClosestEntity,
  findPlayerEntity,
  getAvailablePlayerActions,
  findValidPlantingSpot,
  performTribeSplit,
  findAllHumans,
} from '../game/utils/world-utils';
import {
  HUMAN_INTERACTION_RANGE,
  HUMAN_HUNGER_THRESHOLD_CRITICAL,
  VIEWPORT_FOLLOW_SPEED,
  HUMAN_ATTACK_RANGE,
  BERRY_BUSH_SPREAD_RADIUS,
  PLAYER_CALL_TO_ATTACK_DURATION_HOURS,
} from '../game/world-consts';
import { playSound } from '../game/sound/sound-utils';
import { playSoundAt } from '../game/sound/sound-manager';
import { SoundType } from '../game/sound/sound-types';
import { vectorLerp, calculateWrappedDistance } from '../game/utils/math-utils';
import { Vector2D } from '../game/utils/math-types';
import { PlayerActionHint, PlayerActionType, UIButtonActionType } from '../game/ui/ui-types';
import { setMasterVolume } from '../game/sound/sound-loader';
import { HumanCorpseEntity } from '../game/entities/characters/human/human-corpse-types';
import { addVisualEffect } from '../game/utils/visual-effects-utils';
import { VisualEffectType } from '../game/visual-effects/visual-effect-types';
import { initGame } from '../game';

export const GameScreen: React.FC = () => {
  const [initialState] = useState(() => initGame());

  return <GameScreenInitialised initialState={initialState} />;
};

const GameScreenInitialised: React.FC<{ initialState: GameWorldState }> = ({ initialState }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const gameStateRef = useRef<GameWorldState>(initialState);
  const lastUpdateTimeRef = useRef<number>();
  const keysPressed = useRef<Set<string>>(new Set());
  const isDebugOnRef = useRef<boolean>(false);
  const viewportCenterRef = useRef<Vector2D>(initialState.viewportCenter);
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
          false, // isIntro
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
    const deltaTime = Math.min(time - lastUpdateTimeRef.current, 1000) / 1000; // Seconds (clamped to 1 second max)

    gameStateRef.current = updateWorld(gameStateRef.current, deltaTime);

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
      if (gameStateRef.current.debugCharacterId) {
        const debugEntity = gameStateRef.current.entities.entities.get(gameStateRef.current.debugCharacterId);
        if (debugEntity) {
          targetPosition = { ...debugEntity.position };
        }
      }

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
      false, // isIntro
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
            case UIButtonActionType.TogglePause:
              gameStateRef.current.isPaused = !gameStateRef.current.isPaused;
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
        setMasterVolume(gameStateRef.current.masterVolume, gameStateRef.current.isMuted);
        return;
      }

      if (key === '=' || key === '+') {
        const newVolume = Math.min(1, gameStateRef.current.masterVolume + 0.1);
        gameStateRef.current.masterVolume = parseFloat(newVolume.toFixed(1));
        setMasterVolume(gameStateRef.current.masterVolume, gameStateRef.current.isMuted);
        return;
      }

      if (key === '-') {
        const newVolume = Math.max(0, gameStateRef.current.masterVolume - 0.1);
        gameStateRef.current.masterVolume = parseFloat(newVolume.toFixed(1));
        setMasterVolume(gameStateRef.current.masterVolume, gameStateRef.current.isMuted);
        return;
      }

      if (key === 't') {
        gameStateRef.current = updateWorld(gameStateRef.current, 10);
        return;
      }

      if (key === ' ' || key === 'p') {
        event.preventDefault();
        gameStateRef.current.isPaused = !gameStateRef.current.isPaused;
        return;
      }

      if (key === 'o') {
        gameStateRef.current.isPlayerOnAutopilot = !gameStateRef.current.isPlayerOnAutopilot;
        return;
      }

      if (key === '§' || key === '`') {
        isDebugOnRef.current = !isDebugOnRef.current;
        if (!isDebugOnRef.current) {
          gameStateRef.current.debugCharacterId = undefined;
        } else {
          gameStateRef.current.debugCharacterId =
            findPlayerEntity(gameStateRef.current)?.id ?? findAllHumans(gameStateRef.current)?.[0]?.id;
        }
        return;
      }

      if (key === 'tab') {
        event.preventDefault();
        isDebugOnRef.current = true; // Always turn on debug if cycling

        const humans = Array.from(gameStateRef.current.entities.entities.values()).filter(
          (e) => e.type === 'human',
        ) as HumanEntity[];

        if (humans.length > 0) {
          const sortedHumans = humans.sort((a, b) => (a.isPlayer ? -1 : a.id - b.id));
          const currentDebugId = gameStateRef.current.debugCharacterId;
          const currentIndex = currentDebugId ? sortedHumans.findIndex((h) => h.id === currentDebugId) : -1;

          const nextIndex = (currentIndex + 1) % sortedHumans.length;
          gameStateRef.current.debugCharacterId = sortedHumans[nextIndex].id;
        } else {
          gameStateRef.current.debugCharacterId = undefined;
        }
        return;
      }

      if (gameStateRef.current.isPlayerOnAutopilot) {
        return;
      }

      keysPressed.current.add(key);
      const playerEntity = findPlayerEntity(gameStateRef.current);

      if (!playerEntity) return;
      const updateContext = { gameState: gameStateRef.current, deltaTime: 0 };

      if (key === 'e') {
        const gatherBushTarget = findClosestEntity<BerryBushEntity>(
          playerEntity,
          gameStateRef.current,
          'berryBush',
          HUMAN_INTERACTION_RANGE,
          (b) => b.food.length > 0 && playerEntity.food.length < playerEntity.maxFood,
        );

        const gatherCorpseTarget = findClosestEntity<HumanCorpseEntity>(
          playerEntity,
          gameStateRef.current,
          'humanCorpse',
          HUMAN_INTERACTION_RANGE,
          (c) => c.food.length > 0 && playerEntity.food.length < playerEntity.maxFood,
        );

        let target: BerryBushEntity | HumanCorpseEntity | null = null;
        if (gatherBushTarget && gatherCorpseTarget) {
          target =
            calculateWrappedDistance(
              playerEntity.position,
              gatherBushTarget.position,
              gameStateRef.current.mapDimensions.width,
              gameStateRef.current.mapDimensions.height,
            ) <=
            calculateWrappedDistance(
              playerEntity.position,
              gatherCorpseTarget.position,
              gameStateRef.current.mapDimensions.width,
              gameStateRef.current.mapDimensions.height,
            )
              ? gatherBushTarget
              : gatherCorpseTarget;
        } else {
          target = gatherBushTarget || gatherCorpseTarget;
        }

        if (target) {
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
        gameStateRef.current.hasPlayerMovedEver = true;
      } else if (key === 'arrowdown' || key === 's') {
        playerEntity.direction.y = 1;
        playerEntity.activeAction = 'moving';
        gameStateRef.current.hasPlayerMovedEver = true;
      } else if (key === 'arrowleft' || key === 'a') {
        playerEntity.direction.x = -1;
        playerEntity.activeAction = 'moving';
        gameStateRef.current.hasPlayerMovedEver = true;
      } else if (key === 'arrowright' || key === 'd') {
        playerEntity.direction.x = 1;
        playerEntity.activeAction = 'moving';
        gameStateRef.current.hasPlayerMovedEver = true;
      } else if (key === 'q') {
        const humanTarget = findClosestEntity<HumanEntity>(
          playerEntity,
          gameStateRef.current,
          'human',
          HUMAN_ATTACK_RANGE,
          (h) => (h as HumanEntity).id !== playerEntity.id && (h as HumanEntity).leaderId !== playerEntity.leaderId,
        );

        if (humanTarget) {
          playerEntity.activeAction = 'attacking';
          playerEntity.attackTargetId = humanTarget.id;
        }
      } else if (key === 'b') {
        const plantAction = playerActionHintsRef.current.find((a) => a.type === PlayerActionType.PlantBush);
        if (plantAction) {
          const plantingSpot = findValidPlantingSpot(
            playerEntity.position,
            gameStateRef.current,
            50,
            BERRY_BUSH_SPREAD_RADIUS,
          );
          if (plantingSpot) {
            playerEntity.activeAction = 'planting';
            playerEntity.target = plantingSpot;
            gameStateRef.current.hasPlayerPlantedBush = true;
          }
        }
      } else if (key === 'v') {
        const callToAttackAction = playerActionHintsRef.current.find((a) => a.type === PlayerActionType.CallToAttack);
        if (callToAttackAction) {
          playerEntity.isCallingToAttack = true;
          playerEntity.callToAttackEndTime = gameStateRef.current.time + PLAYER_CALL_TO_ATTACK_DURATION_HOURS;
          addVisualEffect(
            gameStateRef.current,
            VisualEffectType.CallToAttack,
            playerEntity.position,
            PLAYER_CALL_TO_ATTACK_DURATION_HOURS,
          );
          playSoundAt(updateContext, SoundType.CallToAttack, playerEntity.position);
        }
      } else if (key === 'k') {
        const tribeSplitAction = playerActionHintsRef.current.find((a) => a.type === PlayerActionType.TribeSplit);
        if (tribeSplitAction) {
          performTribeSplit(playerEntity, gameStateRef.current);
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
