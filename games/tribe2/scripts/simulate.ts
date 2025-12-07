#!/usr/bin/env -S node --loader=./scripts/mp3-loader.mjs --no-warnings --import=tsx
/**
 * Headless Game Simulation Script
 * 
 * This script runs the Tribe2 game simulation in a background process.
 * It accepts commands via stdin to control the player character and outputs
 * game state information to stdout.
 * 
 * Usage:
 *   tsx scripts/simulate.ts
 * 
 * Commands (JSON format on stdin):
 *   {"command": "move", "x": 100, "y": 200}
 *   {"command": "gather", "entityId": 123}
 *   {"command": "attack", "entityId": 456}
 *   {"command": "plant", "x": 100, "y": 200}
 *   {"command": "procreate", "entityId": 789}
 *   {"command": "pause"}
 *   {"command": "resume"}
 *   {"command": "status"}
 *   {"command": "quit"}
 */

import * as readline from 'readline';
import { initGame } from '../src/game/index';
import { updateWorld } from '../src/game/world-update';
import { GameWorldState } from '../src/game/world-types';
import { HumanEntity } from '../src/game/entities/characters/human/human-types';
import { PlayerActionType } from '../src/game/ui/ui-types';

// Simulation state
let gameState: GameWorldState;
let simulationRunning = true;
let lastUpdateTime = Date.now();
const TARGET_FPS = 60;
const FRAME_TIME_MS = 1000 / TARGET_FPS;

// Initialize the game
function initialize() {
  console.error('Initializing game simulation...');
  gameState = initGame();
  
  // Disable player control initially - they're now AI controlled
  const playerEntity = Object.values(gameState.entities.entities).find(
    (e) => e.type === 'human' && e.isPlayer
  ) as HumanEntity | undefined;
  
  if (playerEntity) {
    console.error(`Player entity found: ID ${playerEntity.id}`);
    // Keep isPlayer true so we can control them via autopilot
  }
  
  console.error('Game initialized successfully');
  outputStatus();
}

// Get the player entity
function getPlayerEntity(): HumanEntity | undefined {
  return Object.values(gameState.entities.entities).find(
    (e) => e.type === 'human' && e.isPlayer
  ) as HumanEntity | undefined;
}

// Output current game status
function outputStatus() {
  const player = getPlayerEntity();
  const humans = Object.values(gameState.entities.entities).filter(e => e.type === 'human') as HumanEntity[];
  const bushes = Object.values(gameState.entities.entities).filter(e => e.type === 'berryBush');
  const prey = Object.values(gameState.entities.entities).filter(e => e.type === 'prey');
  const predators = Object.values(gameState.entities.entities).filter(e => e.type === 'predator');
  
  const status = {
    type: 'status',
    time: gameState.time,
    gameHours: Math.floor(gameState.time),
    gameDays: Math.floor(gameState.time / 24),
    isPaused: gameState.isPaused,
    player: player ? {
      id: player.id,
      position: player.position,
      health: player.hitpoints,
      hunger: player.hunger,
      age: player.age,
      food: player.food.length,
      activeAction: player.activeAction,
      tribeId: player.leaderId,
    } : null,
    population: {
      humans: humans.length,
      bushes: bushes.length,
      prey: prey.length,
      predators: predators.length,
    },
    humans: humans.map(h => ({
      id: h.id,
      position: h.position,
      health: h.hitpoints,
      hunger: h.hunger,
      age: h.age,
      gender: h.gender,
      isPlayer: h.isPlayer,
      activeAction: h.activeAction,
      tribeId: h.leaderId,
    })),
  };
  
  console.log(JSON.stringify(status));
}

// Process command from stdin
function processCommand(commandStr: string) {
  try {
    const cmd = JSON.parse(commandStr);
    
    switch (cmd.command) {
      case 'move':
        handleMove(cmd.x, cmd.y);
        break;
      case 'gather':
        handleGather(cmd.entityId);
        break;
      case 'attack':
        handleAttack(cmd.entityId);
        break;
      case 'plant':
        handlePlant(cmd.x, cmd.y);
        break;
      case 'procreate':
        handleProcreate(cmd.entityId);
        break;
      case 'pause':
        gameState.isPaused = true;
        console.log(JSON.stringify({ type: 'response', success: true, message: 'Game paused' }));
        break;
      case 'resume':
        gameState.isPaused = false;
        console.log(JSON.stringify({ type: 'response', success: true, message: 'Game resumed' }));
        break;
      case 'status':
        outputStatus();
        break;
      case 'quit':
        console.log(JSON.stringify({ type: 'response', success: true, message: 'Shutting down...' }));
        process.exit(0);
        break;
      default:
        console.log(JSON.stringify({ type: 'error', message: `Unknown command: ${cmd.command}` }));
    }
  } catch (error) {
    console.log(JSON.stringify({ type: 'error', message: `Failed to parse command: ${error}` }));
  }
}

// Handle move command
function handleMove(x: number, y: number) {
  const player = getPlayerEntity();
  if (!player) {
    console.log(JSON.stringify({ type: 'error', message: 'Player not found' }));
    return;
  }
  
  gameState.autopilotControls.activeAutopilotAction = {
    action: PlayerActionType.AutopilotMove,
    position: { x, y },
  };
  
  console.log(JSON.stringify({ type: 'response', success: true, message: `Moving to (${x}, ${y})` }));
}

// Handle gather command
function handleGather(entityId: number) {
  const player = getPlayerEntity();
  if (!player) {
    console.log(JSON.stringify({ type: 'error', message: 'Player not found' }));
    return;
  }
  
  const target = gameState.entities.entities[entityId];
  if (!target || target.type !== 'berryBush') {
    console.log(JSON.stringify({ type: 'error', message: 'Invalid gather target' }));
    return;
  }
  
  gameState.autopilotControls.activeAutopilotAction = {
    action: PlayerActionType.AutopilotGather,
    targetEntityId: entityId,
  };
  
  console.log(JSON.stringify({ type: 'response', success: true, message: `Gathering from entity ${entityId}` }));
}

// Handle attack command
function handleAttack(entityId: number) {
  const player = getPlayerEntity();
  if (!player) {
    console.log(JSON.stringify({ type: 'error', message: 'Player not found' }));
    return;
  }
  
  const target = gameState.entities.entities[entityId];
  if (!target) {
    console.log(JSON.stringify({ type: 'error', message: 'Invalid attack target' }));
    return;
  }
  
  gameState.autopilotControls.activeAutopilotAction = {
    action: PlayerActionType.AutopilotAttack,
    targetEntityId: entityId,
  };
  
  console.log(JSON.stringify({ type: 'response', success: true, message: `Attacking entity ${entityId}` }));
}

// Handle plant command
function handlePlant(x: number, y: number) {
  const player = getPlayerEntity();
  if (!player) {
    console.log(JSON.stringify({ type: 'error', message: 'Player not found' }));
    return;
  }
  
  gameState.autopilotControls.activeAutopilotAction = {
    action: PlayerActionType.AutopilotPlant,
    position: { x, y },
  };
  
  console.log(JSON.stringify({ type: 'response', success: true, message: `Planting at (${x}, ${y})` }));
}

// Handle procreate command
function handleProcreate(entityId: number) {
  const player = getPlayerEntity();
  if (!player) {
    console.log(JSON.stringify({ type: 'error', message: 'Player not found' }));
    return;
  }
  
  const target = gameState.entities.entities[entityId];
  if (!target || target.type !== 'human') {
    console.log(JSON.stringify({ type: 'error', message: 'Invalid procreation target' }));
    return;
  }
  
  gameState.autopilotControls.activeAutopilotAction = {
    action: PlayerActionType.AutopilotProcreate,
    targetEntityId: entityId,
  };
  
  console.log(JSON.stringify({ type: 'response', success: true, message: `Procreating with entity ${entityId}` }));
}

// Main simulation loop
function simulationLoop() {
  if (!simulationRunning) {
    return;
  }
  
  const now = Date.now();
  const realDeltaTime = (now - lastUpdateTime) / 1000; // Convert to seconds
  lastUpdateTime = now;
  
  // Update game state
  try {
    gameState = updateWorld(gameState, realDeltaTime);
    
    // Check for game over
    if (gameState.gameOver) {
      console.log(JSON.stringify({
        type: 'gameOver',
        reason: gameState.causeOfGameOver,
        time: gameState.time,
      }));
      simulationRunning = false;
      process.exit(0);
    }
  } catch (error) {
    console.log(JSON.stringify({
      type: 'error',
      message: `Simulation error: ${error}`,
    }));
    simulationRunning = false;
    process.exit(1);
  }
  
  // Schedule next update
  setTimeout(simulationLoop, FRAME_TIME_MS);
}

// Set up stdin reading
function setupStdin() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });
  
  rl.on('line', (line) => {
    processCommand(line.trim());
  });
  
  rl.on('close', () => {
    console.error('stdin closed, shutting down...');
    simulationRunning = false;
    process.exit(0);
  });
}

// Main entry point
function main() {
  console.error('Starting headless game simulation...');
  console.error('Send commands as JSON on stdin');
  console.error('Example: {"command": "status"}');
  console.error('');
  
  initialize();
  setupStdin();
  simulationLoop();
}

// Start the simulation
main();
