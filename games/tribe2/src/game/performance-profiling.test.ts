import { describe, it, expect } from 'vitest';
import { initGame } from './index';
import { updateWorld } from './world-update';
import { GameWorldState } from './world-types';
import { HumanEntity } from './entities/characters/human/human-types';
import { createHuman } from './entities/entities-update';
import { profiler } from './performance-profiler';

describe('Performance Profiling with >100 Humans', () => {
  it('should profile game performance with 150 humans and identify bottlenecks', () => {
    console.log('\n=== Tribe2 Performance Profiling ===\n');
    
    // Initialize game
    console.log('Initializing game...');
    let gameState: GameWorldState = initGame();
    
    // Disable player control
    const playerEntity = Object.values(gameState.entities.entities).find(
      (e) => e.isPlayer && e.type === 'human',
    ) as HumanEntity;
    if (playerEntity) {
      playerEntity.isPlayer = false;
    }
    
    // Create many humans to test performance
    const humanCount = 150;
    console.log(`Creating ${humanCount} additional humans...`);
    
    const mapWidth = gameState.mapDimensions.width;
    const mapHeight = gameState.mapDimensions.height;
    
    for (let i = 0; i < humanCount; i++) {
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
    const avgFrameTime = totalTime / framesToSimulate;
    
    console.log(`\n\nSimulation completed in ${totalTime.toFixed(2)}ms`);
    console.log(`Average frame time: ${avgFrameTime.toFixed(2)}ms`);
    console.log(`Target frame time (60 FPS): 16.67ms`);
    console.log(`Performance: ${avgFrameTime < 16.67 ? '✓ GOOD' : '✗ NEEDS OPTIMIZATION'}\n`);
    
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
    
    // Assertions
    expect(totalEntities).toBeGreaterThan(150);
    expect(gameState).toBeDefined();
    
    // Log profiling data for analysis
    console.log('\n=== PROFILING DATA FOR OPTIMIZATION ===');
    const topBottlenecks = topEntries.slice(0, 3);
    topBottlenecks.forEach(([name, entry], idx) => {
      const pct = ((entry.duration / totalProfiledTime) * 100).toFixed(1);
      console.log(`Bottleneck ${idx + 1}: ${name} - ${pct}% (${entry.duration.toFixed(2)}ms total, ${(entry.duration / entry.count).toFixed(4)}ms avg)`);
    });
  });
});
