import { useCallback, useState } from 'react';
import { createWorldState } from '../world/world-state-create';
import { updateWorldState } from '../world/world-state-updates';
import { GameState, GameStateComponent } from './types';
import { City, Explosion, Missile, Sector, State, WorldState } from '../world/world-state-types';
import styled from 'styled-components';

const WorldComponent: GameStateComponent = ({ setGameState }) => {
  const [worldState, setWorldState] = useState(() => createWorldState());
  const updateWorld = useCallback(
    (worldState: WorldState, deltaTime: number) => setWorldState(updateWorldState(worldState, deltaTime)),
    [],
  );

  return (
    <StateContainer>
      <div className="meta-controls">
        <div>Timestamp: {worldState.timestamp}</div>
        <div>
          <button onClick={() => updateWorld(worldState, 1)}>+1 Second</button>
          <button onClick={() => updateWorld(worldState, 10)}>+10 Seconds</button>
          <button onClick={() => updateWorld(worldState, 60)}>+60 seconds</button>
        </div>
      </div>
      <WorldStateRender state={worldState} />
    </StateContainer>
  );
};

function WorldStateRender({ state }: { state: WorldState }) {
  return (
    <div className="world-render">
      {state.sectors.map((sector) => (
        <SectorRender key={sector.id} sector={sector} />
      ))}
      {state.states.map((state) => (
        <StateRender key={state.id} state={state} />
      ))}
      {state.cities.map((city) => (
        <CityRender key={city.id} city={city} />
      ))}
      {state.missiles.map((missile) => (
        <MissileRender key={missile.id} missile={missile} worldTimestamp={state.timestamp} />
      ))}
      {state.explosions.map((explosion) => (
        <ExplosionRender key={explosion.id} explosion={explosion} worldTimestamp={state.timestamp} />
      ))}
    </div>
  );
}

function StateRender({ state }: { state: State }) {
  return <div className="state-render"></div>;
}

function CityRender({ city }: { city: City }) {
  return <div className="city-render" style={{} as React.CSSProperties}></div>;
}

function MissileRender({ missile, worldTimestamp }: { missile: Missile; worldTimestamp: number }) {
  const progress = Math.min(
    Math.max(0, (worldTimestamp - missile.launchTimestamp) / (missile.targetTimestamp - missile.launchTimestamp)),
    1,
  );

  const x = missile.launch.x + (missile.target.x - missile.launch.x) * progress;
  const y = missile.launch.y + (missile.target.y - missile.launch.y) * progress;

  return (
    <div
      className="missile-render"
      style={
        {
          '--x': x,
          '--y': y,
        } as React.CSSProperties
      }
    ></div>
  );
}

function ExplosionRender({ explosion, worldTimestamp }: { explosion: Explosion; worldTimestamp: number }) {
  if (explosion.startTimestamp > worldTimestamp || explosion.endTimestamp < worldTimestamp) {
    return null;
  }

  const progress = Math.min(
    Math.max(0, (worldTimestamp - explosion.startTimestamp) / (explosion.endTimestamp - explosion.startTimestamp)),
    1,
  );

  return (
    <div
      className="explosion-render"
      style={
        {
          '--x': explosion.position.x,
          '--y': explosion.position.y,
          '--radius': explosion.radius * progress,
        } as React.CSSProperties
      }
    ></div>
  );
}

function SectorRender({ sector }: { sector: Sector }) {
  return (
    <div
      className="sector-render"
      data-sector-type={sector.type}
      style={
        {
          '--x': sector.rect.left,
          '--y': sector.rect.top,
          '--width': sector.rect.right - sector.rect.left,
          '--height': sector.rect.bottom - sector.rect.top,
        } as React.CSSProperties
      }
    ></div>
  );
}

const StateContainer = styled.div`
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;

  display: flex;
  flex-direction: column;

  background: black;

  .meta-controls {
    display: flex;
    flex-grow: 0;

    border: 1px solid rgb(0, 255, 0);
    padding: 5px 10px;

    text-align: left;
    color: white;
    z-index: 1;
  }

  .world-render {
    display: flex;
    flex-grow: 1;

    background: black;

    .state-render {
    }

    .sector-render {
      transform: translate(calc(var(--x) * 1px), calc(var(--y) * 1px));
      position: absolute;
      width: calc(var(--width) * 1px);
      height: calc(var(--height) * 1px);

      &[data-sector-type='GROUND'] {
        background: rgb(93, 42, 0);
      }

      &[data-sector-type='WATER'] {
        background: rgb(0, 34, 93);
      }
    }

    .missile-render {
      transform: translate(calc(var(--x) * 1px), calc(var(--y) * 1px));
      position: absolute;
      width: 1px;
      height: 1px;
      background: rgb(0, 255, 0);
    }

    .explosion-render {
      transform: translate(calc(var(--x) * 1px), calc(var(--y) * 1px)) translate(-50%, -50%);
      position: absolute;
      width: calc(var(--radius) * 1px);
      height: calc(var(--radius) * 1px);
      border-radius: 50%;
      background: rgb(255, 255, 255);
    }
  }
`;

export const GameStateTechWorld: GameState = {
  Component: WorldComponent,
  path: '/tech-world',
};
