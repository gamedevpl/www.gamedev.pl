import { useLocation } from 'react-router-dom';
import { GameState, GameStateComponent } from '../types';

import { useWorldStore } from './world-store';
import { WorldCanvas } from './world-canvas';
import { GameOverController } from './game-over-controller';
import { GameStatePlayed } from '../state-played';
import { FullScreenMessages } from '../../messaging/full-screen-messages';
import { MessagingController } from '../../messaging/messaging-controller';
import { MessagesLog } from '../../messaging/messages-log';
import { AllianceProposals } from '../../messaging/alliance-proposal';
import { TimeControls } from './time-controls';
import { StateControl } from './state-control';

const PlayingComponent: GameStateComponent = ({ setGameState }) => {
  const {
    state: { stateName, numberOfOpponents, groundWarfare },
  } = useLocation();

  const { worldState, setWorldState, updateWorldState } = useWorldStore(stateName, numberOfOpponents, groundWarfare);

  return (
    <>
      {/* UI */}
      <WorldCanvas worldState={worldState} />
      <TimeControls
        updateWorldTime={(deltaTime) => updateWorldState(worldState, deltaTime)}
        currentWorldTime={worldState.timestamp ?? 0}
      />
      <FullScreenMessages worldState={worldState} />
      <StateControl worldState={worldState} />
      <MessagesLog worldState={worldState} />
      {/* Controllers */}
      <GameOverController worldState={worldState} onGameOver={(result) => setGameState(GameStatePlayed, { result })} />
      <MessagingController worldState={worldState} />
      <AllianceProposals worldState={worldState} setWorldState={setWorldState} />
    </>
  );
};

export const GameStatePlaying: GameState = {
  Component: PlayingComponent,
  path: 'playing',
};
