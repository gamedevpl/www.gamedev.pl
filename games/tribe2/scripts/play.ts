#!/usr/bin/env tsx
/**
 * Interactive Game Player
 * 
 * This script demonstrates how to play the game by sending commands
 * to the simulation process and implementing a simple strategy.
 */

import { spawn } from 'child_process';
import * as readline from 'readline';

// Start the simulation process
const simulation = spawn('bash', ['scripts/run-simulation.sh'], {
  cwd: process.cwd(),
  stdio: ['pipe', 'pipe', 'pipe'],
});

let gameState: any = null;
let isRunning = true;

// Listen to simulation output
simulation.stdout.on('data', (data) => {
  const lines = data.toString().split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    
    try {
      const message = JSON.parse(line);
      
      if (message.type === 'status') {
        gameState = message;
        console.log(`[Game State] Day ${message.gameDays}, Time: ${message.gameHours}h`);
        if (message.player) {
          console.log(`  Player: Pos(${Math.floor(message.player.position.x)}, ${Math.floor(message.player.position.y)}) Health:${message.player.health} Hunger:${message.player.hunger.toFixed(1)} Food:${message.player.food} Action:${message.player.activeAction}`);
        }
        console.log(`  Population: Humans:${message.population.humans} Bushes:${message.population.bushes} Prey:${message.population.prey} Predators:${message.population.predators}`);
      } else if (message.type === 'response') {
        console.log(`[Response] ${message.message}`);
      } else if (message.type === 'error') {
        console.error(`[Error] ${message.message}`);
      } else if (message.type === 'gameOver') {
        console.log(`[Game Over] ${message.reason}`);
        isRunning = false;
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
  console.log(`Simulation process exited with code ${code}`);
  isRunning = false;
  process.exit(code || 0);
});

// Send command to simulation
function sendCommand(command: any) {
  simulation.stdin.write(JSON.stringify(command) + '\n');
}

// Wait for simulation to be ready
setTimeout(() => {
  console.log('\n=== Interactive Game Player ===');
  console.log('Available commands:');
  console.log('  status - Get current game state');
  console.log('  move <x> <y> - Move player to position');
  console.log('  gather <entityId> - Gather from berry bush');
  console.log('  attack <entityId> - Attack an entity');
  console.log('  plant <x> <y> - Plant a berry bush');
  console.log('  procreate <entityId> - Procreate with another human');
  console.log('  pause - Pause simulation');
  console.log('  resume - Resume simulation');
  console.log('  strategy - Run an automated strategy');
  console.log('  quit - Exit');
  console.log('');
  
  // Set up interactive input
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> ',
  });
  
  rl.prompt();
  
  rl.on('line', (line) => {
    const parts = line.trim().split(/\s+/);
    const cmd = parts[0];
    
    if (!cmd) {
      rl.prompt();
      return;
    }
    
    switch (cmd) {
      case 'status':
        sendCommand({ command: 'status' });
        break;
      case 'move':
        if (parts.length >= 3) {
          sendCommand({ command: 'move', x: parseFloat(parts[1]), y: parseFloat(parts[2]) });
        } else {
          console.log('Usage: move <x> <y>');
        }
        break;
      case 'gather':
        if (parts.length >= 2) {
          sendCommand({ command: 'gather', entityId: parseInt(parts[1]) });
        } else {
          console.log('Usage: gather <entityId>');
        }
        break;
      case 'attack':
        if (parts.length >= 2) {
          sendCommand({ command: 'attack', entityId: parseInt(parts[1]) });
        } else {
          console.log('Usage: attack <entityId>');
        }
        break;
      case 'plant':
        if (parts.length >= 3) {
          sendCommand({ command: 'plant', x: parseFloat(parts[1]), y: parseFloat(parts[2]) });
        } else {
          console.log('Usage: plant <x> <y>');
        }
        break;
      case 'procreate':
        if (parts.length >= 2) {
          sendCommand({ command: 'procreate', entityId: parseInt(parts[1]) });
        } else {
          console.log('Usage: procreate <entityId>');
        }
        break;
      case 'pause':
        sendCommand({ command: 'pause' });
        break;
      case 'resume':
        sendCommand({ command: 'resume' });
        break;
      case 'strategy':
        runStrategy();
        break;
      case 'quit':
        sendCommand({ command: 'quit' });
        rl.close();
        break;
      default:
        console.log(`Unknown command: ${cmd}`);
    }
    
    if (isRunning) {
      rl.prompt();
    }
  });
  
  rl.on('close', () => {
    if (isRunning) {
      sendCommand({ command: 'quit' });
    }
  });
}, 1000);

// Automated strategy implementation
let strategyRunning = false;

function runStrategy() {
  if (strategyRunning) {
    console.log('Strategy already running');
    return;
  }
  
  console.log('Starting automated strategy...');
  strategyRunning = true;
  
  // Strategy: Periodically check game state and make decisions
  const strategyInterval = setInterval(() => {
    if (!isRunning || !strategyRunning) {
      clearInterval(strategyInterval);
      return;
    }
    
    // Request status update
    sendCommand({ command: 'status' });
    
    // Wait a bit for the response, then make decisions
    setTimeout(() => {
      if (!gameState || !gameState.player) return;
      
      const player = gameState.player;
      
      // Strategy 1: If hungry and low on food, find and gather from nearest bush
      if (player.hunger > 50 && player.food < 3) {
        const bushes = gameState.humans
          .map((h: any) => ({ ...h, type: 'human' }))
          .concat(
            Object.values(gameState.population || {})
              .filter((e: any) => e !== undefined)
          );
        
        // For simplicity, just request status - in real implementation
        // we'd calculate distances and pick the nearest bush
        console.log('[Strategy] Player is hungry, should gather food');
      }
      
      // Strategy 2: If well-fed and young, consider procreation
      if (player.hunger < 30 && player.age > 18 && player.age < 40 && player.food > 5) {
        console.log('[Strategy] Player is well-fed and of breeding age, should consider procreation');
      }
      
      // Strategy 3: If have enough food, plant bushes for sustainability
      if (player.food > 8) {
        console.log('[Strategy] Player has excess food, should plant bushes');
      }
      
    }, 100);
    
  }, 5000); // Check every 5 seconds
}
