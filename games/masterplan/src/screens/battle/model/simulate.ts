import { Unit } from '../../designer/designer-types';
import { MIN_TICK } from '../consts';
import { GameWorld } from '../game/game-world';
import { TerrainData } from '../game/terrain/terrain-generator';
import { initCurrentState } from '../states';
import { createMasterPlan } from '../states/state-game-battle';
import { calculateMD5, getCache } from './cache';

const { readCache, writeCache } = getCache<
  Record<string, { balance: number; result: 'plan' | 'counterPlan' | 'draw' }>
>('simulate.cache.json', {});

export function simulate(plan: Unit[], counterPlan: Unit[], terrainData: TerrainData): 'plan' | 'counterPlan' | 'draw' {
  const planHash = calculateMD5(plan);
  const counterPlanHash = calculateMD5(counterPlan);
  const terrainHash = calculateMD5(terrainData);
  const cacheKey = `${planHash}_${counterPlanHash}_${terrainHash}`;

  const cache = readCache();
  if (cache[cacheKey]) {
    return cache[cacheKey].result;
  }

  initCurrentState();

  const world = new GameWorld(terrainData);

  createMasterPlan(world, 1, '#ff0000', plan);
  createMasterPlan(world, -1, '#00ff00', counterPlan);

  for (let i = 0; i < 60 * 1000; i += 10) {
    world.update(MIN_TICK);
    if (i % 1000 === 0 && [0, 1].includes(world.getBalance())) {
      break;
    }
  }

  const balance = world.getBalance();
  const result = balance > 0.75 ? 'plan' : balance < 0.25 ? 'counterPlan' : 'draw';

  // Update cache
  cache[cacheKey] = { balance, result };
  writeCache(cache);

  return result;
}
