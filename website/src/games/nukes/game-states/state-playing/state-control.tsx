import styled from 'styled-components';
import { StateId, WorldState, Strategy, State } from '../../world/world-state-types';
import { dispatchTranslateEvent } from './viewport';
import { calculateAllStatePopulations, formatPopulation } from '../../world/world-state-utils';

/** A component that allows user to control the player controlled state */
export function StateControl({ worldState }: { worldState: WorldState }) {
  const playerState = worldState.states.find((state) => state.isPlayerControlled);

  if (!playerState) {
    return null;
  }

  const handleStrategyChange = (targetState: State, newStrategy: Strategy, mutual = false) => {
    playerState.strategies[targetState.id] = newStrategy;
    if (mutual) {
      targetState.strategies[playerState.id] = newStrategy;
    }
  };

  const getRelationshipColor = (targetState: State) => {
    if (targetState.id === playerState.id) {
      return '#4CAF50';
    }

    const strategy = playerState.strategies[targetState.id];
    const otherStateStrategy = targetState.strategies[playerState.id];

    if (strategy === Strategy.FRIENDLY && otherStateStrategy === Strategy.FRIENDLY) {
      return '#4CAF50';
    } else if (strategy === Strategy.HOSTILE || otherStateStrategy === Strategy.HOSTILE) {
      return '#F44336';
    } else {
      return '#9E9E9E';
    }
  };

  const statePopulation: Record<StateId, number> = calculateAllStatePopulations(worldState);

  const handleStateClick = (stateId: StateId) => {
    const stateCities = worldState.cities.filter((city) => city.stateId === stateId);
    const stateLaunchSites = worldState.launchSites.filter((site) => site.stateId === stateId);

    if (stateCities.length === 0 && stateLaunchSites.length === 0) {
      console.warn('No position information available for this state');
      return;
    }

    const positions = [...stateCities.map((city) => city.position), ...stateLaunchSites.map((site) => site.position)];

    const averagePosition = positions.reduce((acc, pos) => ({ x: acc.x + pos.x, y: acc.y + pos.y }), { x: 0, y: 0 });

    const statePosition = {
      x: averagePosition.x / positions.length,
      y: averagePosition.y / positions.length,
    };

    dispatchTranslateEvent(statePosition);
  };

  const renderRelationshipButtons = (state: State) => {
    const currentStrategy = playerState.strategies[state.id];
    const otherStateStrategy = state.strategies[playerState.id];

    return (
      <RelationshipButtons>
        {((currentStrategy === Strategy.NEUTRAL && otherStateStrategy !== Strategy.HOSTILE) ||
          (currentStrategy === Strategy.FRIENDLY && otherStateStrategy !== Strategy.FRIENDLY)) && (
          <RelationshipButton
            color="#4CAF50"
            onClick={(e) => {
              e.stopPropagation();
              handleStrategyChange(state, Strategy.FRIENDLY);
            }}
            disabled={currentStrategy === Strategy.FRIENDLY && otherStateStrategy !== Strategy.FRIENDLY}
          >
            Alliance
          </RelationshipButton>
        )}
        {(currentStrategy === Strategy.HOSTILE || otherStateStrategy === Strategy.HOSTILE) && (
          <RelationshipButton
            color="#9E9E9E"
            onClick={(e) => {
              e.stopPropagation();
              handleStrategyChange(state, Strategy.NEUTRAL);
            }}
            disabled={currentStrategy === Strategy.NEUTRAL && otherStateStrategy !== Strategy.NEUTRAL}
          >
            Peace
          </RelationshipButton>
        )}
        {currentStrategy === Strategy.FRIENDLY && otherStateStrategy === Strategy.FRIENDLY && (
          <RelationshipButton
            color="#9E9E9E"
            onClick={(e) => {
              e.stopPropagation();
              handleStrategyChange(state, Strategy.NEUTRAL, true);
            }}
          >
            Neutral
          </RelationshipButton>
        )}
        {currentStrategy === Strategy.NEUTRAL && otherStateStrategy !== Strategy.HOSTILE && (
          <RelationshipButton
            color="#F44336"
            onClick={(e) => {
              e.stopPropagation();
              handleStrategyChange(state, Strategy.HOSTILE, true);
            }}
          >
            Attack
          </RelationshipButton>
        )}
      </RelationshipButtons>
    );
  };

  return (
    <StateControlContainer>
      {worldState.states.map((state) => (
        <StateInfo
          key={state.id}
          relationshipColor={getRelationshipColor(state)}
          onClick={() => handleStateClick(state.id)}
        >
          <StateFlag style={{ color: state.color }}>{state.name.charAt(0)}</StateFlag>
          <StateDetails>
            <StateName>{state.name}</StateName>
            <StatePopulation>{formatPopulation(statePopulation[state.id])}</StatePopulation>
            {state.id !== playerState.id ? (
              renderRelationshipButtons(state)
            ) : (
              <SelfIndicator>This is you</SelfIndicator>
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
  flex-wrap: wrap;
`;

const StateInfo = styled.div<{ relationshipColor: string }>`
  display: flex;
  align-items: center;
  margin: 5px;
  padding: 10px;
  background: ${(props) =>
    `rgba(${parseInt(props.relationshipColor.slice(1, 3), 16)}, ${parseInt(props.relationshipColor.slice(3, 5), 16)}, ${parseInt(props.relationshipColor.slice(5, 7), 16)}, 0.2)`};
  border: 2px solid ${(props) => props.relationshipColor};
  border-radius: 5px;
  transition: background 0.3s ease;
  cursor: pointer;
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

const RelationshipButtons = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
`;

const RelationshipButton = styled.button<{ color: string; disabled?: boolean }>`
  background-color: ${(props) => props.color};
  color: white;
  border: none;
  padding: 5px 10px;
  border-radius: 3px;
  cursor: pointer;
  font-size: 0.8em;
  transition: opacity 0.3s ease;
  ${(props) => (props.disabled ? `pointer-events: none; opacity: 0.5;` : '')}

  &:hover {
    opacity: 0.8;
  }
`;

const SelfIndicator = styled.span`
  font-style: italic;
  color: #4caf50;
`;
