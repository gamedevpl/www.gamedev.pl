import { GameState, WarriorAction, GameInput, WarriorState } from './game-state-types';

export function initGameState(): GameState {
  return {
    warriors: [],
    time: 0,
  };
}

export function updateGameState(gameState: GameState, timeDelta: number, characterInput: GameInput): GameState {
  const updatedWarriors = gameState.warriors.map((warrior, index) => {
    return index === characterInput.playerIndex
      ? updateWarrior(warrior, characterInput.input.actionEnabled, index)
      : warrior;
  });

  return {
    warriors: updatedWarriors,
    time: gameState.time + timeDelta,
  };
}

function updateWarrior(
  warrior: WarriorState,
  _input: Partial<Record<WarriorAction, boolean | undefined>>,
  _index: number,
): WarriorState {
  return warrior;
}
