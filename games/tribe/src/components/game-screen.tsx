import React, { useRef, useEffect } from 'react';
import { useRafLoop } from 'react-use';
import { initGame } from '../game';
import { updateWorld } from '../game/world-update';
import {
  GameWorldState,
  MAP_WIDTH,
  MAP_HEIGHT,
  INTERACTION_RANGE,
  BASE_SPEED_PIXELS_PER_SECOND,
  HUNGER_SPEED_MULTIPLIER,
  HUNGER_MOVEMENT_THRESHOLD,
  BERRY_NUTRITION,
  PROCREATION_COOLDOWN_DAYS,
  GESTATION_DAYS,
  HOURS_PER_GAME_DAY,
  PLAYER_MAX_INVENTORY,
  CHILD_TO_ADULT_AGE_YEARS,
  HUNGER_PROCREATION_THRESHOLD,
} from '../game/world-types';
import { useGameContext } from '../context/game-context';
import { renderGame } from '../game/render';

const INITIAL_STATE = initGame();

export const GameScreen: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const gameStateRef = useRef<GameWorldState>(INITIAL_STATE);
  const lastUpdateTimeRef = useRef<number>();
  const deltaTimeRef = useRef<number>(1 / 60); // Store deltaTime from game loop

  const { appState, setAppState } = useGameContext();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    ctxRef.current = canvas.getContext('2d');

    const handleResize = () => {
      if (canvas && ctxRef.current) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        // Adjust MAP_WIDTH and MAP_HEIGHT if they should be dynamic
        // For now, assuming fixed map size and canvas adapts to window
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
    deltaTimeRef.current = deltaTime; // Update ref with current deltaTime
    gameStateRef.current = updateWorld(gameStateRef.current, deltaTime);
    renderGame(ctxRef.current, gameStateRef.current);
    lastUpdateTimeRef.current = time;

    if (gameStateRef.current.gameOver && appState !== 'gameOver') {
      // Pass details to gameOver state if context is set up for it
      const currentPlayer = gameStateRef.current.characters.find((c) => c.id === gameStateRef.current.currentPlayerId);
      const cause = currentPlayer?.causeOfDeath
        ? gameStateRef.current.causeOfGameOver || `Player died of ${currentPlayer.causeOfDeath}`
        : gameStateRef.current.causeOfGameOver || 'Unknown reasons';
      setAppState('gameOver', {
        generations: gameStateRef.current.generationCount,
        cause: cause,
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

      const player = gameStateRef.current.characters.find((c) => c.id === gameStateRef.current.currentPlayerId);

      if (!player || !player.isAlive) return;

      let playerSpeed = BASE_SPEED_PIXELS_PER_SECOND;
      if (player.hunger > HUNGER_MOVEMENT_THRESHOLD) {
        playerSpeed *= HUNGER_SPEED_MULTIPLIER;
      }
      // Use deltaTime from the game loop for consistent movement speed
      const moveAmount = playerSpeed * deltaTimeRef.current;

      let dx = 0;
      let dy = 0;

      switch (event.key.toLowerCase()) {
        case 'w':
        case 'arrowup':
          dy = -moveAmount;
          break;
        case 's':
        case 'arrowdown':
          dy = moveAmount;
          break;
        case 'a':
        case 'arrowleft':
          dx = -moveAmount;
          break;
        case 'd':
        case 'arrowright':
          dx = moveAmount;
          break;
        case 'e': { // Interact
          // Try to interact with a berry bush first
          let interacted = false;
          for (const bush of gameStateRef.current.berryBushes) {
            const distance = Math.sqrt(
              (player.position.x - bush.position.x) ** 2 + (player.position.y - bush.position.y) ** 2,
            );
            if (distance < INTERACTION_RANGE && bush.berriesAvailable > 0 && player.inventory < PLAYER_MAX_INVENTORY) {
              bush.berriesAvailable--;
              player.inventory++;
              interacted = true;
              break;
            }
          }
          if (interacted) break;

          // Try to interact with a partner for procreation
          for (const partner of gameStateRef.current.characters) {
            if (
              partner.id !== player.id &&
              partner.isAlive &&
              partner.type !== 'child' && // Must be adult
              player.type !== 'child' && // Player must be adult
              partner.gender !== player.gender &&
              player.age >= CHILD_TO_ADULT_AGE_YEARS &&
              partner.age >= CHILD_TO_ADULT_AGE_YEARS &&
              (!player.procreationCooldownEndsAtGameTime ||
                gameStateRef.current.time >= player.procreationCooldownEndsAtGameTime) &&
              (!partner.procreationCooldownEndsAtGameTime ||
                gameStateRef.current.time >= partner.procreationCooldownEndsAtGameTime) &&
              player.hunger < HUNGER_PROCREATION_THRESHOLD &&
              partner.hunger < HUNGER_PROCREATION_THRESHOLD
            ) {
              const distance = Math.sqrt(
                (player.position.x - partner.position.x) ** 2 + (player.position.y - partner.position.y) ** 2,
              );
              if (distance < INTERACTION_RANGE) {
                const cooldownEndTime = gameStateRef.current.time + PROCREATION_COOLDOWN_DAYS * HOURS_PER_GAME_DAY;
                player.procreationCooldownEndsAtGameTime = cooldownEndTime;
                partner.procreationCooldownEndsAtGameTime = cooldownEndTime;

                const female = player.gender === 'female' ? player : partner;
                female.gestationEndsAtGameTime = gameStateRef.current.time + GESTATION_DAYS * HOURS_PER_GAME_DAY;
                // Store fatherId for lineage tracking
                // Simplified: assuming player is male, partner is female as per initial setup for first procreation
                if (female.id === player.id) { // player is female
                  female.fatherId = partner.id;
                } else { // partner is female
                  female.fatherId = player.id;
                }

                console.log(
                  `Procreation initiated between ${player.id} and ${partner.id}. Gestation ends at ${female.gestationEndsAtGameTime}`,
                );
                break;
              }
            }
          }
          break;
        }
        case 'f': // Eat
          if (player.inventory > 0) {
            player.inventory--;
            player.hunger = Math.max(0, player.hunger - BERRY_NUTRITION);
          }
          break;
        default:
          return; // Exit if not a handled key
      }

      if (dx !== 0 || dy !== 0) {
        player.position.x = (player.position.x + dx + MAP_WIDTH) % MAP_WIDTH;
        player.position.y = (player.position.y + dy + MAP_HEIGHT) % MAP_HEIGHT;
        // Ensure positive result for modulo with negative numbers if necessary, though % in JS for positive divisor usually works as expected for wrapping.
        if (player.position.x < 0) player.position.x += MAP_WIDTH;
        if (player.position.y < 0) player.position.y += MAP_HEIGHT;
      }
      // No explicit re-render call here, relying on the next rAF tick
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, appState, setAppState, startLoop, stopLoop]); // Dependencies for input handler

  return <canvas ref={canvasRef} style={{ display: 'block', background: '#2c5234' }} />;
};