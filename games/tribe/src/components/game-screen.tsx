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
  CHILD_HUNGER_THRESHOLD_FOR_SEEKING_PARENT,
} from '../game/world-types';
import { useGameContext } from '../context/game-context';
import { renderGame } from '../game/render';

const INITIAL_STATE = initGame();

export const GameScreen: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const gameStateRef = useRef<GameWorldState>(INITIAL_STATE);
  const lastUpdateTimeRef = useRef<number>();
  const pressedKeysRef = useRef(new Set<string>());

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
    const updatePlayerVelocity = () => {
      if (!isActive() || gameStateRef.current.gameOver) return;
      const player = gameStateRef.current.characters.find((c) => c.id === gameStateRef.current.currentPlayerId);
      if (!player || !player.isAlive) return;

      let playerSpeed = BASE_SPEED_PIXELS_PER_SECOND;
      if (player.hunger > HUNGER_MOVEMENT_THRESHOLD) {
        playerSpeed *= HUNGER_SPEED_MULTIPLIER;
      }

      let targetVelocityX = 0;
      let targetVelocityY = 0;

      pressedKeysRef.current.forEach((key) => {
        switch (key) {
          case 'w':
          case 'arrowup':
            targetVelocityY -= playerSpeed;
            break;
          case 's':
          case 'arrowdown':
            targetVelocityY += playerSpeed;
            break;
          case 'a':
          case 'arrowleft':
            targetVelocityX -= playerSpeed;
            break;
          case 'd':
          case 'arrowright':
            targetVelocityX += playerSpeed;
            break;
        }
      });
      player.velocity = { x: targetVelocityX, y: targetVelocityY };
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isActive() || gameStateRef.current.gameOver) return;
      const player = gameStateRef.current.characters.find((c) => c.id === gameStateRef.current.currentPlayerId);
      if (!player || !player.isAlive) return;

      const key = event.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        pressedKeysRef.current.add(key);
        updatePlayerVelocity();
      }

      switch (key) {
        case 'e': {
          // Interact
          let interacted = false;

          // Berry Bush Interaction
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

          // Procreation Interaction
          for (const partner of gameStateRef.current.characters) {
            if (
              partner.id !== player.id &&
              partner.isAlive &&
              partner.type !== 'child' &&
              player.type !== 'child' &&
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
                if (female.id === player.id) {
                  female.fatherId = partner.id;
                } else {
                  female.fatherId = player.id;
                }
                console.log(
                  `Procreation initiated between ${player.id} and ${partner.id}. Gestation ends at ${female.gestationEndsAtGameTime}`,
                );
                interacted = true;
                break;
              }
            }
          }
          if (interacted) break;

          // Child Feeding Interaction
          for (const character of gameStateRef.current.characters) {
            if (
              character.id !== player.id &&
              character.isAlive &&
              character.type === 'child' &&
              player.inventory > 0 &&
              character.hunger >= CHILD_HUNGER_THRESHOLD_FOR_SEEKING_PARENT
            ) {
              const distance = Math.sqrt(
                (player.position.x - character.position.x) ** 2 + (player.position.y - character.position.y) ** 2,
              );
              if (distance < INTERACTION_RANGE) {
                player.inventory--;
                character.hunger = Math.max(0, character.hunger - BERRY_NUTRITION);
                character.velocity = { x: 0, y: 0 }; // Make child pause briefly
                character.currentAction = 'idle';
                interacted = true;
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
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (!isActive() || gameStateRef.current.gameOver) return;
      const key = event.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        pressedKeysRef.current.delete(key);
        updatePlayerVelocity();
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
