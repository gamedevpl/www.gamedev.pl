/**
 * Performance profiling script for tribe2 game
 * Simulates a game with >100 humans to measure actual bottlenecks
 */

import { initGame } from '../src/game';
import { updateWorld } from '../src/game/world-update';
import { profiler } from '../src/game/performance-profiler';
import { createHuman } from '../src/game/entities/entities-update';
import { GameWorldState } from '../src/game/world-types';

// Mock performance.now if not available
if (typeof performance === 'undefined') {
  (global as any).performance = {
    now: () => Date.now(),
  };
}

function createManyHumans(gameState: GameWorldState, count: number): void {
  const mapWidth = gameState.mapDimensions.width;
  const mapHeight = gameState.mapDimensions.height;

  for (let i = 0; i < count; i++) {
    const position = {
      x: Math.random() * mapWidth,
      y: Math.random() * mapHeight,
    };
    const gender = Math.random() < 0.5 ? 'male' : 'female';
    
    createHuman(
      gameState.entities,
      position,
      gameState.time,
      gender as 'male' | 'female',
      false, // not player
      18, // adult age
      75, // some hunger
      undefined, // motherId
      undefined, // fatherId
      [], // ancestorIds
      undefined, // leaderId
      undefined, // tribeBadge
    );
  }
}

function runPerformanceTest(): void {
  console.log('=== Tribe2 Performance Profiling ===\n');
  
  // Initialize game
  console.log('Initializing game...');
  let gameState = initGame();
  
  // Create many humans to test performance
  const humanCount = 150;
  console.log(`Creating ${humanCount} humans...`);
  createManyHumans(gameState, humanCount);
  
  const totalEntities = Object.keys(gameState.entities.entities).length;
  console.log(`Total entities in world: ${totalEntities}\n`);
  
  // Enable profiler
  profiler.enable();
  profiler.reset();
  
  // Run simulation for several frames
  const framesToSimulate = 300; // ~5 seconds at 60 FPS
  const deltaTime = 1 / 60; // 60 FPS
  
  console.log(`Simulating ${framesToSimulate} frames...`);
  const startTime = performance.now();
  
  for (let frame = 0; frame < framesToSimulate; frame++) {
    gameState = updateWorld(gameState, deltaTime);
    
    if (frame % 60 === 0) {
      process.stdout.write(`.`);
    }
  }
  
  const totalTime = performance.now() - startTime;
  console.log(`\n\nSimulation completed in ${totalTime.toFixed(2)}ms`);
  console.log(`Average frame time: ${(totalTime / framesToSimulate).toFixed(2)}ms`);
  console.log(`Target frame time (60 FPS): 16.67ms`);
  console.log(`Performance: ${totalTime / framesToSimulate < 16.67 ? '✓ GOOD' : '✗ NEEDS OPTIMIZATION'}\n`);
  
  // Disable profiler and show results
  profiler.disable();
  console.log('\n=== Profiler Results (Top Operations) ===\n');
  profiler.printResults(5); // Show operations taking >5ms total
  
  const topEntries = profiler.getTopEntries(15);
  console.log('\n=== Top 15 Most Expensive Operations ===');
  console.log('Name | Total Time (ms) | Avg Time (ms) | Count | % of Total');
  console.log('-----------------------------------------------------------------------');
  
  const totalProfiledTime = topEntries.reduce((sum, [_, entry]) => sum + entry.duration, 0);
  
  for (const [name, entry] of topEntries) {
    const avgTime = entry.duration / entry.count;
    const percentage = ((entry.duration / totalProfiledTime) * 100).toFixed(1);
    console.log(
      `${name.padEnd(35)} | ${entry.duration.toFixed(2).padStart(12)} | ${avgTime.toFixed(4).padStart(12)} | ${entry.count.toString().padStart(5)} | ${percentage.padStart(5)}%`
    );
  }
  
  console.log('\n=== Recommendations ===');
  console.log('Based on profiling results, focus optimization efforts on:');
  for (let i = 0; i < Math.min(3, topEntries.length); i++) {
    const [name, entry] = topEntries[i];
    const percentage = ((entry.duration / totalProfiledTime) * 100).toFixed(1);
    console.log(`${i + 1}. ${name} (${percentage}% of update time)`);
  }
}

// Run the test
try {
  runPerformanceTest();
} catch (error) {
  console.error('Error running performance test:', error);
  process.exit(1);
}
