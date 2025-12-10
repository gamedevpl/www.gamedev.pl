import { describe, it, expect, beforeAll } from 'vitest';
import { initGame } from './index';
import { updateWorld } from './world-update';
import { renderGame } from './render';
import { GameWorldState } from './world-types';
import { HumanEntity } from './entities/characters/human/human-types';
import { createHuman } from './entities/entities-update';
import { profiler } from './performance-profiler';
import { VisualEffectType } from './visual-effects/visual-effect-types';
import { addVisualEffect } from './utils/visual-effects-utils';

// Mock canvas for rendering tests
class MockCanvasRenderingContext2D {
  canvas = { width: 1920, height: 1080 };
  
  // Canvas state
  fillStyle: string | CanvasGradient | CanvasPattern = '#000';
  strokeStyle: string | CanvasGradient | CanvasPattern = '#000';
  lineWidth = 1;
  font = '10px sans-serif';
  textAlign: CanvasTextAlign = 'start';
  globalAlpha = 1;
  shadowColor = 'transparent';
  shadowBlur = 0;
  
  // Methods
  save() {}
  restore() {}
  clearRect(x: number, y: number, w: number, h: number) {}
  fillRect(x: number, y: number, w: number, h: number) {}
  strokeRect(x: number, y: number, w: number, h: number) {}
  beginPath() {}
  closePath() {}
  moveTo(x: number, y: number) {}
  lineTo(x: number, y: number) {}
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number) {}
  fill() {}
  stroke() {}
  fillText(text: string, x: number, y: number) {}
  strokeText(text: string, x: number, y: number) {}
  translate(x: number, y: number) {}
  rotate(angle: number) {}
  scale(x: number, y: number) {}
  measureText(text: string) {
    return { width: text.length * 6 };
  }
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number) {}
  ellipse(x: number, y: number, radiusX: number, radiusY: number, rotation: number, startAngle: number, endAngle: number) {}
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number) {}
  bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number) {}
  roundRect(x: number, y: number, w: number, h: number, radii?: number | number[]) {}
  rect(x: number, y: number, w: number, h: number) {}
  clip() {}
  isPointInPath(x: number, y: number) { return false; }
}

describe('Rendering Performance with Visual Effects', () => {
  let mockCtx: MockCanvasRenderingContext2D;

  beforeAll(() => {
    mockCtx = new MockCanvasRenderingContext2D();
  });

  it('should profile rendering performance with many entities and visual effects', () => {
    console.log('\n=== Tribe2 Rendering Performance Test ===\n');
    
    // Initialize game
    console.log('Initializing game...');
    let gameState: GameWorldState = initGame();
    
    // Disable autosave
    gameState.autosaveIntervalSeconds = undefined;
    
    // Disable player control
    const playerEntity = Object.values(gameState.entities.entities).find(
      (e) => e.isPlayer && e.type === 'human',
    ) as HumanEntity;
    if (playerEntity) {
      playerEntity.isPlayer = false;
    }
    
    // Create many humans spread across map
    const humanCount = 150;
    const mapWidth = gameState.mapDimensions.width;
    const mapHeight = gameState.mapDimensions.height;
    
    console.log(`Creating ${humanCount} humans with visual effects...`);
    
    for (let i = 0; i < humanCount; i++) {
      const position = {
        x: Math.random() * mapWidth,
        y: Math.random() * mapHeight,
      };
      const gender = Math.random() < 0.5 ? 'male' : 'female';
      
      const entityId = gameState.entities.nextEntityId;
      
      createHuman(
        gameState.entities,
        position,
        gameState.time,
        gender as 'male' | 'female',
        false, // not player
        18 + Math.random() * 30, // varied ages
        50 + Math.random() * 50, // varied hunger
        undefined, // motherId
        undefined, // fatherId
        [], // ancestorIds
        undefined, // leaderId
        undefined, // tribeBadge
      );
      
      // Add various visual effects to simulate active gameplay
      if (i % 5 === 0) {
        addVisualEffect(gameState, VisualEffectType.Hunger, position, 5);
      }
      if (i % 7 === 0) {
        addVisualEffect(gameState, VisualEffectType.Eating, position, 3, entityId);
      }
      if (i % 10 === 0) {
        addVisualEffect(gameState, VisualEffectType.Attack, position, 2);
      }
      if (i % 15 === 0) {
        addVisualEffect(gameState, VisualEffectType.Procreation, position, 4);
      }
      if (i % 20 === 0) {
        addVisualEffect(gameState, VisualEffectType.Hit, position, 1);
      }
    }
    
    // Add more visual effects around the map
    console.log('Adding additional visual effects...');
    for (let i = 0; i < 50; i++) {
      const position = {
        x: Math.random() * mapWidth,
        y: Math.random() * mapHeight,
      };
      const effectTypes = [
        VisualEffectType.BushClaimed,
        VisualEffectType.TargetAcquired,
        VisualEffectType.Partnered,
        VisualEffectType.CallToAttack,
        VisualEffectType.CallToFollow,
        VisualEffectType.AutopilotMoveTarget,
      ];
      const effectType = effectTypes[Math.floor(Math.random() * effectTypes.length)];
      addVisualEffect(gameState, effectType, position, 2 + Math.random() * 3);
    }
    
    const totalEntities = Object.keys(gameState.entities.entities).length;
    const totalEffects = gameState.visualEffects.length;
    console.log(`Total entities: ${totalEntities}`);
    console.log(`Total visual effects: ${totalEffects}\n`);
    
    // Enable profiler
    profiler.enable();
    profiler.reset();
    
    // Test rendering performance over multiple frames
    const framesToRender = 300; // 5 seconds at 60 FPS
    const deltaTime = 1 / 60;
    
    console.log(`Running ${framesToRender} frames with rendering...`);
    const startTime = performance.now();
    
    let totalRenderTime = 0;
    let totalUpdateTime = 0;
    const renderTimes: number[] = [];
    
    for (let frame = 0; frame < framesToRender; frame++) {
      // Update world
      const updateStart = performance.now();
      gameState = updateWorld(gameState, deltaTime);
      const updateTime = performance.now() - updateStart;
      totalUpdateTime += updateTime;
      
      // Render frame
      const renderStart = performance.now();
      renderGame(
        mockCtx as any,
        gameState,
        gameState.viewportCenter,
        [],
        { width: 1920, height: 1080 },
        false
      );
      const renderTime = performance.now() - renderStart;
      totalRenderTime += renderTime;
      
      if (frame % 60 === 0) {
        renderTimes.push(renderTime);
      }
      
      // Progress indicator
      if (frame % 60 === 0 && frame > 0) {
        process.stdout.write(`.`);
      }
    }
    
    const totalTime = performance.now() - startTime;
    const avgRenderTime = totalRenderTime / framesToRender;
    const avgUpdateTime = totalUpdateTime / framesToRender;
    const avgTotalTime = totalTime / framesToRender;
    
    console.log(`\n\n=== Rendering Performance Results ===`);
    console.log(`Total time: ${totalTime.toFixed(2)}ms`);
    console.log(`Total frames: ${framesToRender}`);
    console.log(`\nAverage times per frame:`);
    console.log(`- Render: ${avgRenderTime.toFixed(2)}ms`);
    console.log(`- Update: ${avgUpdateTime.toFixed(2)}ms`);
    console.log(`- Total: ${avgTotalTime.toFixed(2)}ms`);
    console.log(`- Target (60 FPS): 16.67ms`);
    console.log(`\nPerformance breakdown:`);
    console.log(`- Render: ${((avgRenderTime / avgTotalTime) * 100).toFixed(1)}% of frame time`);
    console.log(`- Update: ${((avgUpdateTime / avgTotalTime) * 100).toFixed(1)}% of frame time`);
    console.log(`- Status: ${avgTotalTime < 16.67 ? '✓ GOOD' : '✗ NEEDS OPTIMIZATION'}\n`);
    
    // Calculate render time percentiles
    const sortedRenderTimes = [...renderTimes].sort((a, b) => a - b);
    const p50 = sortedRenderTimes[Math.floor(sortedRenderTimes.length * 0.5)];
    const p95 = sortedRenderTimes[Math.floor(sortedRenderTimes.length * 0.95)];
    const p99 = sortedRenderTimes[Math.floor(sortedRenderTimes.length * 0.99)];
    
    console.log('Render Time Percentiles (sampled):');
    console.log(`- 50th percentile: ${p50.toFixed(2)}ms`);
    console.log(`- 95th percentile: ${p95.toFixed(2)}ms`);
    console.log(`- 99th percentile: ${p99.toFixed(2)}ms\n`);
    
    // Disable profiler and show results
    profiler.disable();
    console.log('\n=== Detailed Profiler Results ===\n');
    profiler.printResults(5);
    
    const topEntries = profiler.getTopEntries(20);
    console.log('\n=== Top 20 Operations (Update + Render) ===');
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
    
    // Separate rendering operations
    const renderingOps = topEntries.filter(([name]) => 
      name.includes('render') || 
      name.includes('sort') || 
      name.includes('filter') ||
      name.includes('Entity') ||
      name.includes('Effect') ||
      name.includes('Highlight')
    );
    
    const totalRenderingTime = renderingOps.reduce((sum, [_, entry]) => sum + entry.duration, 0);
    
    console.log('\n=== Rendering-Specific Operations ===');
    console.log('Name | Total Time (ms) | Avg Time (ms) | % of Rendering');
    console.log('-----------------------------------------------------------');
    
    for (const [name, entry] of renderingOps.slice(0, 10)) {
      const avgTime = entry.duration / entry.count;
      const percentage = ((entry.duration / totalRenderingTime) * 100).toFixed(1);
      console.log(
        `${name.padEnd(35)} | ${entry.duration.toFixed(2).padStart(12)} | ${avgTime.toFixed(4).padStart(12)} | ${percentage.padStart(5)}%`
      );
    }
    
    console.log('\n=== Visual Effects Analysis ===');
    const finalEffects = gameState.visualEffects.length;
    console.log(`Initial visual effects: ${totalEffects}`);
    console.log(`Final visual effects: ${finalEffects}`);
    console.log(`Change: ${finalEffects - totalEffects}`);
    
    // Assertions
    expect(totalEntities).toBeGreaterThan(150);
    expect(gameState).toBeDefined();
    expect(avgTotalTime).toBeLessThan(25); // Allow some overhead for rendering
    
    // Log summary
    console.log('\n=== Summary ===');
    console.log(`Entities: ${totalEntities}`);
    console.log(`Visual Effects: ${finalEffects}`);
    console.log(`Avg Frame Time: ${avgTotalTime.toFixed(2)}ms (${avgRenderTime.toFixed(2)}ms render + ${avgUpdateTime.toFixed(2)}ms update)`);
    console.log(`Render Overhead: ${avgRenderTime.toFixed(2)}ms per frame`);
    console.log(`Performance: ${avgTotalTime < 16.67 ? '✓ Excellent' : avgTotalTime < 25 ? '✓ Good' : '⚠️ Needs optimization'}`);
  }, 120000); // 2 minute timeout
});
