import styled from 'styled-components';
import { StateId, WorldState, City, Strategy } from '../../world/world-state-types';
import { getValueInTime } from '../../world/world-state-time-utils';

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

  const getRelationshipColor = (targetStateId: StateId) => {
    if (targetStateId === playerState.id) {
      return '#4CAF50';
    }

    const strategy = playerState.strategies[targetStateId];
    switch (strategy) {
      case Strategy.FRIENDLY:
        return '#4CAF50';
      case Strategy.NEUTRAL:
        return '#FFC107';
      case Strategy.HOSTILE:
        return '#F44336';
      default:
        return '#9E9E9E';
    }
  };

  const cityPopulation: Record<StateId, Array<[City, number]>> = Object.fromEntries(
    worldState.states.map((state) => [
      state.id,
      worldState.cities
        .filter((city) => city.stateId === state.id)
        .map((city) => [city, getValueInTime(city.populationHistogram, worldState.timestamp).population]),
    ]),
  );

  const statePopulation: Record<StateId, number> = Object.fromEntries(
    worldState.states.map((state) => [
      state.id,
      cityPopulation[state.id].reduce((r, [, population]) => r + population, 0),
    ]),
  );

  return (
    <StateControlContainer>
      {worldState.states.map((state) => (
        <StateInfo key={state.id} relationshipColor={getRelationshipColor(state.id)}>
          <StateFlag>{state.name.charAt(0)}</StateFlag>
          <StateDetails>
            <StateName>{state.name}</StateName>
            <StatePopulation>{statePopulation[state.id]?.toLocaleString() ?? 'N/A'}</StatePopulation>
            {state.id !== playerState.id ? (
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
            ) : (
              'This is you'
            )}
          </StateDetails>
        </StateInfo>
      ))}
    </StateControlContainer>
  );
}

const StateControlContainer = styled.div`
  position: fixed;
  left: 0;
  bottom: 0;
  z-index: 1;
  padding: 10px;
  color: white;
  background: rgba(0, 0, 0, 0.9);
  border-top: 1px solid rgb(0, 255, 0);
  display: flex;
  justify-content: space-around;
`;

const StateInfo = styled.div<{ relationshipColor: string }>`
  display: flex;
  align-items: center;
  margin: 5px;
  padding: 5px;
  background: ${(props) =>
    `rgba(${parseInt(props.relationshipColor.slice(1, 3), 16)}, ${parseInt(props.relationshipColor.slice(3, 5), 16)}, ${parseInt(props.relationshipColor.slice(5, 7), 16)}, 0.2)`};
  border-radius: 5px;
  transition: background 0.3s ease;
`;

const StateFlag = styled.div`
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  margin-right: 10px;
  font-weight: bold;
`;

const StateDetails = styled.div`
  display: flex;
  flex-direction: column;
`;

const StateName = styled.span`
  font-weight: bold;
  margin-bottom: 5px;
`;

const StatePopulation = styled.span`
  font-size: 0.9em;
  margin-bottom: 5px;
`;
