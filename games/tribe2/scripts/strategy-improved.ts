#!/usr/bin/env tsx
/**
 * Improved AI Strategy - Based on 30-minute simulation discoveries
 * 
 * Key improvements over the basic strategy:
 * 1. Smart bush tracking (avoid depleted bushes)
 * 2. Lower planting threshold (plant at food >5, not >8)
 * 3. Proximity-based gathering (minimize travel)
 * 4. Stockpiling behavior (build reserves before procreation)
 * 5. Staying in berry-rich zones
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

interface BushState {
  id: number;
  position: Position;
  foodCount: number;
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
  berryBushes: BushState[];
  preyAnimals: Array<{ id: number; position: Position; health: number }>;
  predatorAnimals: Array<{ id: number; position: Position; health: number }>;
}

// Enhanced state tracking
const bushMemory = new Map<number, { lastChecked: number; hadFood: boolean }>();
let homePosition: Position | null = null;
let statsLog: any[] = [];

const simulation = spawn('bash', ['scripts/run-simulation.sh'], {
  cwd: process.cwd(),
  stdio: ['pipe', 'pipe', 'pipe'],
});

let gameState: GameStatus | null = null;
let lastStrategyTime = 0;
const STRATEGY_INTERVAL_MS = 2000;

function sendCommand(command: any) {
  simulation.stdin.write(JSON.stringify(command) + '\n');
}

function distance(a: Position, b: Position): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// Smart bush selection: prefer nearby bushes with food
function findBestBush(player: PlayerState, bushes: BushState[]): BushState | null {
  const now = Date.now();
  
  // Filter bushes with food, and not recently checked as empty
  const viableBushes = bushes.filter(b => {
    if (b.foodCount === 0) {
      bushMemory.set(b.id, { lastChecked: now, hadFood: false });
      return false;
    }
    
    const memory = bushMemory.get(b.id);
    // Skip bushes we recently found empty (unless it's been a while)
    if (memory && !memory.hadFood && now - memory.lastChecked < 60000) {
      return false;
    }
    
    return true;
  });
  
  if (viableBushes.length === 0) return null;
  
  // Find nearest viable bush
  const nearest = viableBushes.reduce((closest, bush) => {
    const distCurrent = distance(player.position, bush.position);
    const distClosest = distance(player.position, closest.position);
    return distCurrent < distClosest ? bush : closest;
  });
  
  bushMemory.set(nearest.id, { lastChecked: now, hadFood: true });
  return nearest;
}

// Establish home base in berry-rich area
function findHomeBase(player: PlayerState, bushes: BushState[]): Position {
  // Find cluster with most bushes
  const CLUSTER_RADIUS = 500;
  let bestPosition = player.position;
  let maxBushes = 0;
  
  // Sample positions around current area
  for (let i = 0; i < 20; i++) {
    const samplePos = {
      x: player.position.x + (Math.random() - 0.5) * 1000,
      y: player.position.y + (Math.random() - 0.5) * 1000,
    };
    
    const nearbyBushes = bushes.filter(b => distance(b.position, samplePos) < CLUSTER_RADIUS);
    if (nearbyBushes.length > maxBushes) {
      maxBushes = nearbyBushes.length;
      bestPosition = samplePos;
    }
  }
  
  return bestPosition;
}

function executeImprovedStrategy() {
  if (!gameState || !gameState.player) return;
  
  const player = gameState.player;
  const berryBushes = gameState.berryBushes || [];
  const humans = gameState.humans;
  
  // Establish home base on first run
  if (!homePosition) {
    homePosition = findHomeBase(player, berryBushes);
    console.error(`[Strategy] Established home base at (${Math.floor(homePosition.x)}, ${Math.floor(homePosition.y)})`);
  }
  
  // Log stats every 10 days
  if (gameState.gameDays % 10 === 0 && gameState.gameHours % 24 < 2) {
    statsLog.push({
      day: gameState.gameDays,
      hunger: player.hunger,
      food: player.food,
      bushes: gameState.population.bushes,
    });
    console.error(`[Day ${gameState.gameDays}] Hunger: ${player.hunger.toFixed(1)}, Food: ${player.food}, Bushes: ${gameState.population.bushes}`);
  }
  
  // PRIORITY 1: Critical hunger (>80) - emergency gathering
  if (player.hunger > 80) {
    const bestBush = findBestBush(player, berryBushes);
    if (bestBush) {
      console.error(`[Emergency] Gathering from bush ${bestBush.id} (distance: ${distance(player.position, bestBush.position).toFixed(0)})`);
      sendCommand({ command: 'gather', entityId: bestBush.id });
      return;
    } else {
      console.error(`[Critical] No bushes with food available!`);
    }
  }
  
  // PRIORITY 2: Build food reserves (hunger <70, food <8)
  if (player.hunger < 70 && player.food < 8) {
    const bestBush = findBestBush(player, berryBushes);
    if (bestBush) {
      const dist = distance(player.position, bestBush.position);
      console.error(`[Stockpile] Gathering from bush ${bestBush.id} (distance: ${dist.toFixed(0)})`);
      sendCommand({ command: 'gather', entityId: bestBush.id });
      return;
    }
  }
  
  // PRIORITY 3: Ecosystem investment - plant bushes (lowered threshold from 8 to 5)
  if (player.food > 5 && gameState.population.bushes < 40) {
    // Plant near home base
    const plantX = homePosition.x + (Math.random() - 0.5) * 300;
    const plantY = homePosition.y + (Math.random() - 0.5) * 300;
    console.error(`[Planting] Creating new bush at (${Math.floor(plantX)}, ${Math.floor(plantY)})`);
    sendCommand({ command: 'plant', x: plantX, y: plantY });
    return;
  }
  
  // PRIORITY 4: Procreation (when well-stocked)
  if (player.hunger < 35 && player.food > 8 && player.age > 18 && player.age < 40) {
    const playerGender = humans.find(h => h.isPlayer)?.gender || 'male';
    const partners = humans.filter(h => 
      !h.isPlayer && 
      h.gender !== playerGender &&
      h.age > 18 && h.age < 40 &&
      h.hunger < 60 // Partner must also not be too hungry
    );
    
    if (partners.length > 0) {
      const nearest = partners.reduce((closest, p) => {
        const distCurrent = distance(player.position, p.position);
        const distClosest = distance(player.position, closest.position);
        return distCurrent < distClosest ? p : closest;
      });
      console.error(`[Procreation] Attempting with human ${nearest.id}`);
      sendCommand({ command: 'procreate', entityId: nearest.id });
      return;
    }
  }
  
  // PRIORITY 5: Maintain reserves (preventive gathering)
  if (player.activeAction === 'idle' && player.hunger < 55 && player.food < 6) {
    const bestBush = findBestBush(player, berryBushes);
    if (bestBush) {
      console.error(`[Preventive] Gathering from bush ${bestBush.id}`);
      sendCommand({ command: 'gather', entityId: bestBush.id });
      return;
    }
  }
  
  // PRIORITY 6: Return to home base if too far
  if (player.activeAction === 'idle' && homePosition) {
    const distFromHome = distance(player.position, homePosition);
    if (distFromHome > 600) {
      console.error(`[Return] Moving back to home base (${distFromHome.toFixed(0)} away)`);
      sendCommand({ command: 'move', x: homePosition.x, y: homePosition.y });
      return;
    }
  }
  
  // PRIORITY 7: Rest at home (idle is OK when well-fed)
  if (player.hunger < 50 && player.food > 3) {
    // Just rest and let hunger drop naturally
    return;
  }
}

simulation.stdout.on('data', (data) => {
  const lines = data.toString().split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    
    try {
      const message = JSON.parse(line);
      
      if (message.type === 'status') {
        gameState = message as GameStatus;
        
        const now = Date.now();
        if (now - lastStrategyTime >= STRATEGY_INTERVAL_MS) {
          lastStrategyTime = now;
          executeImprovedStrategy();
        }
      } else if (message.type === 'response') {
        // Suppress responses to reduce noise
      } else if (message.type === 'gameOver') {
        console.error(`\n[Game Over] ${message.reason}`);
        console.error(`Survived ${message.time} hours (${Math.floor(message.time / 24)} days)`);
        console.error('\nStats log:', JSON.stringify(statsLog, null, 2));
        process.exit(0);
      }
    } catch (e) {
      // Ignore parse errors
    }
  }
});

simulation.stderr.on('data', (data) => {
  // Suppress stderr
});

simulation.on('close', (code) => {
  console.error(`Simulation exited with code ${code}`);
  process.exit(code || 0);
});

setInterval(() => sendCommand({ command: 'status' }), 1000);

process.on('SIGINT', () => {
  console.error('\nShutting down...');
  sendCommand({ command: 'quit' });
  setTimeout(() => process.exit(0), 1000);
});

console.error('=== Improved Strategy Initialized ===');
console.error('Enhancements:');
console.error('  ✓ Smart bush tracking');
console.error('  ✓ Home base establishment');
console.error('  ✓ Lower planting threshold (>5 instead of >8)');
console.error('  ✓ Stockpiling behavior');
console.error('  ✓ Preventive gathering');
console.error('');
