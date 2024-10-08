import { Unit } from '../../designer/designer-types';
import { GameWorld } from '../game/game-world';
import { initCurrentState } from '../states';
import { createMasterPlan } from '../states/state-game-battle';
import { calculateMD5, readCache, writeCache } from './cache';

export function simulate(plan: Unit[], counterPlan: Unit[]): 'plan' | 'counterPlan' | 'draw' {
  const planHash = calculateMD5(plan);
  const counterPlanHash = calculateMD5(counterPlan);
  const cacheKey = `${planHash}_${counterPlanHash}`;

  const cache = readCache();
  if (cache[cacheKey]) {
    return cache[cacheKey].result;
  }

  initCurrentState();

  const world = new GameWorld();

  createMasterPlan(world, 1, '#ff0000', plan);
  createMasterPlan(world, -1, '#00ff00', rotateUnits(counterPlan));

  for (let i = 0; i < 60 * 1000; i += 10) {
    world.update(10);
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

function rotateUnits(units: Unit[]): Unit[] {
  return units.map((unit) => ({
    ...unit,
    col: -unit.col,
    row: -unit.row,
  }));
}
