#!/usr/bin/env tsx
/**
 * Example AI Strategy Script
 * 
 * This script demonstrates how to create an automated strategy
 * for playing the Tribe2 game simulation.
 * 
 * Strategy Overview:
 * 1. Monitor player hunger and gather food when needed
 * 2. Plant berry bushes when carrying excess food
 * 3. Procreate with partner when well-fed
 * 4. Avoid starvation by prioritizing food gathering
 * 
 * Usage:
 *   NODE_OPTIONS="--loader ./scripts/mp3-loader.mjs --no-warnings" npx tsx scripts/strategy-example.ts
 */

import { spawn } from 'child_process';

interface Position {
  x: number;
  y: number;
}

interface PlayerState {
  id: number;
  position: Position;
  health: number;
  hunger: number;
  age: number;
  food: number;
  activeAction: string;
  tribeId?: number;
}

interface HumanState extends PlayerState {
  gender: 'male' | 'female';
  isPlayer: boolean;
}

interface GameStatus {
  type: 'status';
  time: number;
  gameHours: number;
  gameDays: number;
  isPaused: boolean;
  player: PlayerState | null;
  population: {
    humans: number;
    bushes: number;
    prey: number;
    predators: number;
  };
  humans: HumanState[];
  berryBushes: Array<{
    id: number;
    position: Position;
    foodCount: number;
  }>;
  preyAnimals: Array<{
    id: number;
    position: Position;
    health: number;
  }>;
  predatorAnimals: Array<{
    id: number;
    position: Position;
    health: number;
  }>;
}

// Start the simulation
console.error('Starting AI strategy...');
const simulation = spawn('bash', ['scripts/run-simulation.sh'], {
  cwd: process.cwd(),
  stdio: ['pipe', 'pipe', 'pipe'],
});

let gameState: GameStatus | null = null;
let lastStrategyTime = 0;
const STRATEGY_INTERVAL_MS = 2000; // Execute strategy every 2 seconds

// Send command to simulation
function sendCommand(command: any) {
  simulation.stdin.write(JSON.stringify(command) + '\n');
}

// Calculate distance between two points (simple Euclidean, not accounting for wrapping)
function distance(a: Position, b: Position): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// Find nearest entity of a specific type
function findNearestEntity(player: PlayerState, entities: HumanState[], filter: (e: HumanState) => boolean): HumanState | null {
  let nearest: HumanState | null = null;
  let minDist = Infinity;
  
  for (const entity of entities) {
    if (!filter(entity)) continue;
    const dist = distance(player.position, entity.position);
    if (dist < minDist) {
      minDist = dist;
      nearest = entity;
    }
  }
  
  return nearest;
}

// Main strategy logic
function executeStrategy() {
  if (!gameState || !gameState.player) {
    console.error('[Strategy] No game state or player available');
    return;
  }
  
  const player = gameState.player;
  const humans = gameState.humans;
  const berryBushes = gameState.berryBushes || [];
  
  console.error(`[Strategy] Day ${gameState.gameDays}, Hour ${gameState.gameHours}`);
  console.error(`[Strategy] Player - Hunger: ${player.hunger.toFixed(1)}, Food: ${player.food}, Action: ${player.activeAction}`);
  console.error(`[Strategy] Population - Humans: ${gameState.population.humans}, Bushes: ${gameState.population.bushes}`);
  
  // Priority 1: If starving (hunger > 80), find food urgently
  if (player.hunger > 80 && player.food === 0) {
    console.error('[Strategy] CRITICAL: Starving! Finding nearest bush');
    const bushesWithFood = berryBushes.filter(b => b.foodCount > 0);
    if (bushesWithFood.length > 0) {
      const nearest = bushesWithFood.reduce((closest, bush) => {
        const distCurrent = distance(player.position, bush.position);
        const distClosest = distance(player.position, closest.position);
        return distCurrent < distClosest ? bush : closest;
      });
      console.error(`[Strategy] Gathering from bush ${nearest.id} with ${nearest.foodCount} berries`);
      sendCommand({ command: 'gather', entityId: nearest.id });
      return;
    }
    console.error('[Strategy] No bushes with food available!');
    return;
  }
  
  // Priority 2: If hungry (hunger > 60) and low on food (< 3), gather more
  if (player.hunger > 60 && player.food < 3) {
    const bushesWithFood = berryBushes.filter(b => b.foodCount > 0);
    if (bushesWithFood.length > 0) {
      const nearest = bushesWithFood.reduce((closest, bush) => {
        const distCurrent = distance(player.position, bush.position);
        const distClosest = distance(player.position, closest.position);
        return distCurrent < distClosest ? bush : closest;
      });
      console.error(`[Strategy] Gathering from bush ${nearest.id} at distance ${distance(player.position, nearest.position).toFixed(0)}`);
      sendCommand({ command: 'gather', entityId: nearest.id });
      return;
    }
  }
  
  // Priority 3: If have excess food (> 8), plant a bush for sustainability
  if (player.food > 8) {
    // Plant near current position with some randomness
    const plantX = player.position.x + (Math.random() - 0.5) * 200;
    const plantY = player.position.y + (Math.random() - 0.5) * 200;
    console.error(`[Strategy] Planting bush at (${Math.floor(plantX)}, ${Math.floor(plantY)})`);
    sendCommand({ command: 'plant', x: plantX, y: plantY });
    return;
  }
  
  // Priority 4: If well-fed and young adult, consider procreation
  if (player.hunger < 40 && player.age > 18 && player.age < 40 && player.food > 5) {
    // Find a suitable partner (opposite gender, not player, similar age)
    const playerGender = humans.find(h => h.isPlayer)?.gender || 'male';
    const partner = findNearestEntity(player, humans, (h) => 
      !h.isPlayer && 
      h.gender !== playerGender &&
      h.age > 18 && h.age < 40
    );
    
    if (partner) {
      console.error(`[Strategy] Initiating procreation with human ${partner.id}`);
      sendCommand({ command: 'procreate', entityId: partner.id });
      return;
    }
  }
  
  // Priority 5: If doing nothing and moderately hungry, gather preventively
  if (player.activeAction === 'idle' && player.hunger > 45 && player.food < 5) {
    const bushesWithFood = berryBushes.filter(b => b.foodCount > 0);
    if (bushesWithFood.length > 0) {
      const nearest = bushesWithFood.reduce((closest, bush) => {
        const distCurrent = distance(player.position, bush.position);
        const distClosest = distance(player.position, closest.position);
        return distCurrent < distClosest ? bush : closest;
      });
      console.error(`[Strategy] Preventive gathering from bush ${nearest.id}`);
      sendCommand({ command: 'gather', entityId: nearest.id });
      return;
    }
  }
  
  // Priority 6: Explore the map if nothing else to do
  if (player.activeAction === 'idle') {
    const moveX = player.position.x + (Math.random() - 0.5) * 400;
    const moveY = player.position.y + (Math.random() - 0.5) * 400;
    console.error(`[Strategy] Exploring - moving to (${Math.floor(moveX)}, ${Math.floor(moveY)})`);
    sendCommand({ command: 'move', x: moveX, y: moveY });
    return;
  }
}

// Listen to simulation output
simulation.stdout.on('data', (data) => {
  const lines = data.toString().split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    
    try {
      const message = JSON.parse(line);
      
      if (message.type === 'status') {
        gameState = message as GameStatus;
        
        // Execute strategy at intervals
        const now = Date.now();
        if (now - lastStrategyTime >= STRATEGY_INTERVAL_MS) {
          lastStrategyTime = now;
          executeStrategy();
        }
      } else if (message.type === 'response') {
        console.error(`[Response] ${message.message}`);
      } else if (message.type === 'error') {
        console.error(`[Error] ${message.message}`);
      } else if (message.type === 'gameOver') {
        console.error(`[Game Over] ${message.reason}`);
        console.error(`Game lasted ${message.time} hours (${Math.floor(message.time / 24)} days)`);
        process.exit(0);
      }
    } catch (e) {
      // Ignore parse errors
    }
  }
});

simulation.stderr.on('data', (data) => {
  console.error(`[Sim] ${data.toString().trim()}`);
});

simulation.on('close', (code) => {
  console.error(`Simulation exited with code ${code}`);
  process.exit(code || 0);
});

// Request status updates periodically
setInterval(() => {
  sendCommand({ command: 'status' });
}, 1000);

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.error('\nShutting down...');
  sendCommand({ command: 'quit' });
  setTimeout(() => process.exit(0), 1000);
});

console.error('AI strategy initialized. Press Ctrl+C to stop.');
