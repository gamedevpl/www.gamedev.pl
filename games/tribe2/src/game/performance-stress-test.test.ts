import { describe, it, expect } from 'vitest';
import { initGame } from './index';
import { updateWorld } from './world-update';
import { GameWorldState } from './world-types';
import { HumanEntity } from './entities/characters/human/human-types';
import { createHuman } from './entities/entities-update';
import { profiler } from './performance-profiler';

describe('Performance Stress Test - Many Humans in Small Space', () => {
  it('should profile game with 200 humans in confined area over extended simulation', () => {
    console.log('\n=== Tribe2 Stress Test: Crowded Scenario ===\n');
    
    // Initialize game
    console.log('Initializing game...');
    let gameState: GameWorldState = initGame();
    
    // Disable autosave to avoid browser API issues in Node.js
    gameState.autosaveIntervalSeconds = undefined;
    
    // Disable player control
    const playerEntity = Object.values(gameState.entities.entities).find(
      (e) => e.isPlayer && e.type === 'human',
    ) as HumanEntity;
    if (playerEntity) {
      playerEntity.isPlayer = false;
    }
    
    // Create many humans in a SMALL AREA (confined space)
    const humanCount = 200;
    const confinedAreaSize = 500; // Small 500x500 area instead of full 3000x3000 map
    const centerX = gameState.mapDimensions.width / 2;
    const centerY = gameState.mapDimensions.height / 2;
    
    console.log(`Creating ${humanCount} humans in confined ${confinedAreaSize}x${confinedAreaSize} area...`);
    
    for (let i = 0; i < humanCount; i++) {
      // Position all humans in a small area around the center
      const position = {
        x: centerX - confinedAreaSize/2 + Math.random() * confinedAreaSize,
        y: centerY - confinedAreaSize/2 + Math.random() * confinedAreaSize,
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
    console.log(`Total entities in world: ${totalEntities}`);
    console.log(`Density: ${(humanCount / (confinedAreaSize * confinedAreaSize) * 1000000).toFixed(2)} humans per 1000x1000 area\n`);
    
    // Enable profiler
    profiler.enable();
    profiler.reset();
    
    // Run LONGER simulation - 3 minutes of game time
    // At 60 FPS, 3 minutes = 10,800 frames
    const simulationMinutes = 3;
    const framesToSimulate = simulationMinutes * 60 * 60; // 10,800 frames
    const deltaTime = 1 / 60; // 60 FPS
    
    console.log(`Simulating ${simulationMinutes} minutes (${framesToSimulate} frames)...`);
    console.log('This will take a while...\n');
    
    const startTime = performance.now();
    let worstFrameTime = 0;
    let bestFrameTime = Infinity;
    const frameTimes: number[] = [];
    
    // Sample frame times every 60 frames (1 second)
    for (let frame = 0; frame < framesToSimulate; frame++) {
      const frameStart = performance.now();
      gameState = updateWorld(gameState, deltaTime);
      const frameTime = performance.now() - frameStart;
      
      if (frame % 60 === 0) {
        frameTimes.push(frameTime);
        if (frameTime > worstFrameTime) worstFrameTime = frameTime;
        if (frameTime < bestFrameTime) bestFrameTime = frameTime;
      }
      
      // Progress indicator every 1800 frames (30 seconds)
      if (frame % 1800 === 0 && frame > 0) {
        const progress = ((frame / framesToSimulate) * 100).toFixed(1);
        const avgRecent = frameTimes.slice(-30).reduce((a, b) => a + b, 0) / Math.min(30, frameTimes.length);
        console.log(`Progress: ${progress}% (avg frame time: ${avgRecent.toFixed(2)}ms)`);
      }
    }
    
    const totalTime = performance.now() - startTime;
    const avgFrameTime = totalTime / framesToSimulate;
    
    console.log(`\n=== Simulation Complete ===`);
    console.log(`Total real time: ${(totalTime / 1000).toFixed(2)} seconds`);
    console.log(`Simulated time: ${simulationMinutes} minutes`);
    console.log(`Total frames: ${framesToSimulate}`);
    console.log(`\nFrame Time Statistics:`);
    console.log(`- Average: ${avgFrameTime.toFixed(2)}ms`);
    console.log(`- Best: ${bestFrameTime.toFixed(2)}ms`);
    console.log(`- Worst: ${worstFrameTime.toFixed(2)}ms`);
    console.log(`- Target (60 FPS): 16.67ms`);
    console.log(`- Performance: ${avgFrameTime < 16.67 ? '✓ GOOD' : '✗ NEEDS OPTIMIZATION'}\n`);
    
    // Calculate percentiles
    const sortedFrameTimes = [...frameTimes].sort((a, b) => a - b);
    const p50 = sortedFrameTimes[Math.floor(sortedFrameTimes.length * 0.5)];
    const p95 = sortedFrameTimes[Math.floor(sortedFrameTimes.length * 0.95)];
    const p99 = sortedFrameTimes[Math.floor(sortedFrameTimes.length * 0.99)];
    
    console.log('Frame Time Percentiles:');
    console.log(`- 50th percentile (median): ${p50.toFixed(2)}ms`);
    console.log(`- 95th percentile: ${p95.toFixed(2)}ms`);
    console.log(`- 99th percentile: ${p99.toFixed(2)}ms\n`);
    
    // Count frames that missed 60 FPS target
    const slowFrames = frameTimes.filter(t => t > 16.67).length;
    const slowFramePercent = (slowFrames / frameTimes.length * 100).toFixed(2);
    console.log(`Frames exceeding 16.67ms: ${slowFrames}/${frameTimes.length} (${slowFramePercent}%)\n`);
    
    // Disable profiler and show results
    profiler.disable();
    console.log('\n=== Profiler Results ===\n');
    profiler.printResults(10); // Show operations taking >10ms total
    
    const topEntries = profiler.getTopEntries(15);
    console.log('\n=== Top 15 Most Expensive Operations ===');
    console.log('Name | Total Time (ms) | Avg Time (ms) | Count | % of Total');
    console.log('-----------------------------------------------------------------------');
    
    const totalProfiledTime = topEntries.reduce((sum, [_, entry]) => sum + entry.duration, 0);
    
    for (const [name, entry] of topEntries) {
      const avgTime = entry.duration / entry.count;
      const percentage = ((entry.duration / totalProfiledTime) * 100).toFixed(1);
      console.log(
        `${name.padEnd(35)} | ${entry.duration.toFixed(2).padStart(12)} | ${avgTime.toFixed(4).padStart(12)} | ${entry.count.toString().padStart(6)} | ${percentage.padStart(5)}%`
      );
    }
    
    console.log('\n=== Entity Count Evolution ===');
    const finalEntities = Object.keys(gameState.entities.entities).length;
    console.log(`Initial entities: ${totalEntities}`);
    console.log(`Final entities: ${finalEntities}`);
    console.log(`Change: ${finalEntities > totalEntities ? '+' : ''}${finalEntities - totalEntities}\n`);
    
    console.log('=== Crowded Scenario Analysis ===');
    console.log(`Density: ~${humanCount} humans in ${confinedAreaSize}x${confinedAreaSize} area`);
    console.log(`This represents a ${((gameState.mapDimensions.width / confinedAreaSize) ** 2).toFixed(0)}x density increase vs. normal spread`);
    
    if (avgFrameTime > 16.67) {
      console.log('\n⚠️ Performance degradation detected in crowded scenario');
      console.log('Recommendations:');
      console.log('1. Implement spatial partitioning for interaction checks');
      console.log('2. Reduce interaction radius in crowded areas');
      console.log('3. Implement LOD (Level of Detail) for distant entities');
    } else {
      console.log('\n✓ Performance remains good even in crowded scenario');
    }
    
    // Assertions
    expect(totalEntities).toBeGreaterThan(200);
    expect(gameState).toBeDefined();
    
    // Performance assertion - should stay under 20ms average even in crowded scenario
    expect(avgFrameTime).toBeLessThan(20);
  }, 180000); // 3 minute timeout for the test
});
