import styled from 'styled-components';
import { StateId, WorldState, Strategy } from '../world/world-state-types';

/** A component that allows user to control the player controlled state */
export function StateControl({
  worldState,
  setWorldState,
}: {
  worldState: WorldState;
  setWorldState: (worldState: WorldState) => void;
}) {
  const playerState = worldState.states.find((state) => state.isPlayerControlled);

  if (!playerState) {
    return null;
  }

  const handleStrategyChange = (targetStateId: StateId, strategy: Strategy) => {
    const updatedStates = worldState.states.map((state) =>
      state.id === playerState.id
        ? { ...state, strategies: { ...state.strategies, [targetStateId]: strategy } }
        : state,
    );
    setWorldState({ ...worldState, states: updatedStates });
  };

  return (
    <StateControlContainer>
      {worldState.states.map((state) =>
        state.id !== playerState.id ? (
          <div key={state.id}>
            <span>{state.name}</span>
            <select
              value={playerState.strategies[state.id]}
              onChange={(e) => handleStrategyChange(state.id, e.target.value as Strategy)}
            >
              {Object.values(Strategy).map((strategy) => (
                <option key={strategy} value={strategy}>
                  {strategy}
                </option>
              ))}
            </select>
          </div>
        ) : null,
      )}
    </StateControlContainer>
  );
}

const StateControlContainer = styled.div`
  position: fixed;
  right: 280px;
  top: 0;
  z-index: 1;

  max-width: 25%;
  min-width: 200px;
  min-height: 200px;
  overflow-y: auto;

  padding: 10px;

  color: white;
  background: rgba(0, 0, 0, 0.9);
  border: 1px solid rgb(0, 255, 0);
`;
