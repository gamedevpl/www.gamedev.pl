import React, { useRef, useEffect, useState } from 'react';
import { useRafLoop } from 'react-use';
import { updateWorld } from '../game/world-update';
import { GameWorldState, HoveredAutopilotAction } from '../game/world-types';
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
  screenToWorldCoords,
  findEntityAtPosition,
} from '../game/utils/world-utils';
import {
  HUMAN_INTERACTION_RANGE,
  HUMAN_HUNGER_THRESHOLD_CRITICAL,
  VIEWPORT_FOLLOW_SPEED,
  HUMAN_ATTACK_RANGE,
  BERRY_BUSH_SPREAD_RADIUS,
  PLAYER_CALL_TO_ATTACK_DURATION_HOURS,
  FAST_FORWARD_AMOUNT_SECONDS,
  BERRY_COST_FOR_PLANTING,
  BERRY_BUSH_PLANTING_CLEARANCE_RADIUS,
  HUMAN_FEMALE_MAX_PROCREATION_AGE,
  PLAYER_CALL_TO_FOLLOW_DURATION_HOURS,
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
import { FoodType } from '../game/food/food-types';

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
      if (!event.target || event.target !== canvasRef.current) return;

      const rect = canvasRef.current.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;

      const updateContext = { gameState: gameStateRef.current, deltaTime: 0 };
      let buttonClicked = false;

      gameStateRef.current.uiButtons.forEach((button) => {
        if (
          mouseX >= button.rect.x &&
          mouseX <= button.rect.x + button.rect.width &&
          mouseY >= button.rect.y &&
          mouseY <= button.rect.y + button.rect.height
        ) {
          buttonClicked = true;
          const player = findPlayerEntity(gameStateRef.current);
          if (player) {
            playSoundAt(updateContext, SoundType.ButtonClick, player.position);
          }

          switch (button.action) {
            case UIButtonActionType.ToggleMute:
              // The state is toggled first...
              gameStateRef.current.isMuted = !gameStateRef.current.isMuted;
              // ...then the sound system is updated with the new state.
              setMasterVolume(gameStateRef.current.masterVolume, gameStateRef.current.isMuted);
              break;
            case UIButtonActionType.TogglePause:
              gameStateRef.current.isPaused = !gameStateRef.current.isPaused;
              break;
            case UIButtonActionType.FastForward:
              gameStateRef.current = updateWorld(gameStateRef.current, FAST_FORWARD_AMOUNT_SECONDS);
              break;
            case UIButtonActionType.ToggleProcreationBehavior:
              gameStateRef.current.autopilotControls.behaviors.procreation =
                !gameStateRef.current.autopilotControls.behaviors.procreation;
              break;
            case UIButtonActionType.TogglePlantingBehavior:
              gameStateRef.current.autopilotControls.behaviors.planting =
                !gameStateRef.current.autopilotControls.behaviors.planting;
              break;
            case UIButtonActionType.ToggleGatheringBehavior:
              gameStateRef.current.autopilotControls.behaviors.gathering =
                !gameStateRef.current.autopilotControls.behaviors.gathering;
              break;
            case UIButtonActionType.ToggleAttackBehavior:
              gameStateRef.current.autopilotControls.behaviors.attack =
                !gameStateRef.current.autopilotControls.behaviors.attack;
              break;
            case UIButtonActionType.ToggleCallToAttackBehavior:
              gameStateRef.current.autopilotControls.behaviors.callToAttack =
                !gameStateRef.current.autopilotControls.behaviors.callToAttack;
              break;
            case UIButtonActionType.ToggleFollowMeBehavior:
              gameStateRef.current.autopilotControls.behaviors.followMe =
                !gameStateRef.current.autopilotControls.behaviors.followMe;
              break;
            case UIButtonActionType.ToggleFeedChildrenBehavior:
              gameStateRef.current.autopilotControls.behaviors.feedChildren =
                !gameStateRef.current.autopilotControls.behaviors.feedChildren;
              break;
          }
        }
      });

      if (buttonClicked) {
        return;
      }

      // Handle click-to-action
      if (!gameStateRef.current.isPaused) {
        const player = findPlayerEntity(gameStateRef.current);
        const hoveredAction = gameStateRef.current.autopilotControls.hoveredAutopilotAction;

        // Always clear the previous active command
        gameStateRef.current.autopilotControls.activeAutopilotAction = undefined;

        if (player && hoveredAction) {
          // Set the new active command based on the hovered action
          gameStateRef.current.autopilotControls.activeAutopilotAction = hoveredAction;
        } else if (player) {
          // Fallback to default click-to-move if no specific action is hovered
          const worldPos = screenToWorldCoords(
            { x: mouseX, y: mouseY },
            viewportCenterRef.current,
            { width: canvasRef.current.width, height: canvasRef.current.height },
            gameStateRef.current.mapDimensions,
          );
          gameStateRef.current.autopilotControls.activeAutopilotAction = {
            action: PlayerActionType.AutopilotMove,
            position: worldPos,
          };
        }
      }
    };

    window.addEventListener('mousedown', handleMouseDown);
    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
    };
  }, [isActive]);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!isActive() || !canvasRef.current) return;

      const rect = canvasRef.current.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;

      gameStateRef.current.mousePosition = { x: mouseX, y: mouseY };

      // Handle autopilot hover hints
      const player = findPlayerEntity(gameStateRef.current);
      if (player) {
        const worldPos = screenToWorldCoords(
          { x: mouseX, y: mouseY },
          viewportCenterRef.current,
          { width: canvasRef.current.width, height: canvasRef.current.height },
          gameStateRef.current.mapDimensions,
        );

        let determinedAction: HoveredAutopilotAction | undefined = undefined;
        let hoveredEntity = findEntityAtPosition(worldPos, gameStateRef.current);

        if (hoveredEntity) {
          // --- ENTITY-BASED ACTIONS ---\
          if (hoveredEntity.type === 'berryBush' && (hoveredEntity as BerryBushEntity).food.length > 0) {
            determinedAction = {
              action: PlayerActionType.AutopilotGather,
              targetEntityId: hoveredEntity.id,
            };
          } else if (hoveredEntity.type === 'human') {
            const targetHuman = hoveredEntity as HumanEntity;

            // Check for Attack
            if (targetHuman.id !== player.id && targetHuman.leaderId !== player.leaderId) {
              determinedAction = { action: PlayerActionType.AutopilotAttack, targetEntityId: targetHuman.id };
            }
            // Check for Procreate
            else if (
              targetHuman.id !== player.id &&
              targetHuman.gender !== player.gender &&
              targetHuman.isAdult &&
              player.isAdult &&
              (targetHuman.procreationCooldown || 0) <= 0 &&
              targetHuman.gender === 'female' &&
              targetHuman.age <= HUMAN_FEMALE_MAX_PROCREATION_AGE
            ) {
              determinedAction = { action: PlayerActionType.AutopilotProcreate, targetEntityId: targetHuman.id };
            }
            // Check for Feed Child
            else if (
              player.food.length > 0 &&
              !targetHuman.isAdult &&
              (targetHuman.motherId === player.id || targetHuman.fatherId === player.id)
            ) {
              determinedAction = { action: PlayerActionType.AutopilotFeedChildren, targetEntityId: targetHuman.id };
            }
            // Check for Follow Me
            else if (player.leaderId === targetHuman.id && targetHuman.id === targetHuman.leaderId) {
              determinedAction = { action: PlayerActionType.AutopilotFollowMe, targetEntityId: targetHuman.id };
            }
          }
        } else {
          // --- POSITION-BASED ACTIONS ---\
          if (
            gameStateRef.current.autopilotControls.behaviors.planting &&
            player.food.filter((f) => f.type === FoodType.Berry).length >= BERRY_COST_FOR_PLANTING &&
            findValidPlantingSpot(worldPos, gameStateRef.current, 1, BERRY_BUSH_PLANTING_CLEARANCE_RADIUS, player.id)
          ) {
            determinedAction = { action: PlayerActionType.AutopilotPlant, position: worldPos };
          } else {
            determinedAction = { action: PlayerActionType.AutopilotMove, position: worldPos };
          }
        }

        gameStateRef.current.autopilotControls.hoveredAutopilotAction = determinedAction;
      } else {
        gameStateRef.current.autopilotControls.hoveredAutopilotAction = undefined;
      }

      let hoveredButtonId: string | undefined = undefined;
      // Iterate in reverse to find the topmost button first
      for (let i = gameStateRef.current.uiButtons.length - 1; i >= 0; i--) {
        const button = gameStateRef.current.uiButtons[i];
        if (
          mouseX >= button.rect.x &&
          mouseX <= button.rect.x + button.rect.width &&
          mouseY >= button.rect.y &&
          mouseY <= button.rect.y + button.rect.height
        ) {
          hoveredButtonId = button.id;
          gameStateRef.current.autopilotControls.hoveredAutopilotAction = undefined;
          break;
        }
      }
      gameStateRef.current.hoveredButtonId = hoveredButtonId;
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [isActive]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isActive() || gameStateRef.current.gameOver) return;

      const key = event.key.toLowerCase();
      if (key === 'escape') {
        // Cancel active autopilot command
        gameStateRef.current.autopilotControls.activeAutopilotAction = undefined;
        return;
      }

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
        gameStateRef.current = updateWorld(gameStateRef.current, FAST_FORWARD_AMOUNT_SECONDS);
        return;
      }

      if (key === ' ' || key === 'p') {
        event.preventDefault();
        gameStateRef.current.isPaused = !gameStateRef.current.isPaused;
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

      const playerEntity = findPlayerEntity(gameStateRef.current);
      if (!playerEntity) return;
      const updateContext = { gameState: gameStateRef.current, deltaTime: 0 };

      keysPressed.current.add(key);

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
        playerEntity.target = undefined;
        gameStateRef.current.hasPlayerMovedEver = true;
        gameStateRef.current.autopilotControls.isManuallyMoving = true;
        gameStateRef.current.autopilotControls.activeAutopilotAction = undefined;
      } else if (key === 'arrowdown' || key === 's') {
        playerEntity.direction.y = 1;
        playerEntity.activeAction = 'moving';
        playerEntity.target = undefined;
        gameStateRef.current.hasPlayerMovedEver = true;
        gameStateRef.current.autopilotControls.isManuallyMoving = true;
        gameStateRef.current.autopilotControls.activeAutopilotAction = undefined;
      } else if (key === 'arrowleft' || key === 'a') {
        playerEntity.direction.x = -1;
        playerEntity.activeAction = 'moving';
        playerEntity.target = undefined;
        gameStateRef.current.hasPlayerMovedEver = true;
        gameStateRef.current.autopilotControls.isManuallyMoving = true;
        gameStateRef.current.autopilotControls.activeAutopilotAction = undefined;
      } else if (key === 'arrowright' || key === 'd') {
        playerEntity.direction.x = 1;
        playerEntity.activeAction = 'moving';
        playerEntity.target = undefined;
        gameStateRef.current.hasPlayerMovedEver = true;
        gameStateRef.current.autopilotControls.isManuallyMoving = true;
        gameStateRef.current.autopilotControls.activeAutopilotAction = undefined;
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
      } else if (key === 'c') {
        const callToFollowAction = playerActionHintsRef.current.find((a) => a.type === PlayerActionType.FollowMe);
        if (callToFollowAction) {
          playerEntity.isCallingToFollow = true;
          playerEntity.callToFollowEndTime = gameStateRef.current.time + PLAYER_CALL_TO_FOLLOW_DURATION_HOURS;
          addVisualEffect(
            gameStateRef.current,
            VisualEffectType.CallToFollow,
            playerEntity.position,
            PLAYER_CALL_TO_FOLLOW_DURATION_HOURS,
          );
          playSoundAt(updateContext, SoundType.CallToFollow, playerEntity.position);
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
        // Player is no longer manually moving
        gameStateRef.current.autopilotControls.isManuallyMoving = false;
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
