import { BattleState } from './battle-state-types';

export const ITERATION_DELTA_TIME = 1000 / 60;

export function updateBattleState(deltaTime: number, battleState: BattleState): BattleState {
  while (deltaTime > 0) {
    battleState = updateBattleStateIteration(Math.min(ITERATION_DELTA_TIME, deltaTime), battleState);
    deltaTime -= ITERATION_DELTA_TIME;
  }

  return battleState;
}

function updateBattleStateIteration(deltaTime: number, battleState: BattleState): BattleState {
  battleState.time += deltaTime;
  return battleState;
}
