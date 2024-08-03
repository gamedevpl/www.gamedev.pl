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

const PlayingComponent: GameStateComponent = ({ setGameState }) => {
  const {
    state: { stateName },
  } = useLocation();

  const { worldState, setWorldState, updateWorldState } = useWorldStore(stateName);

  return (
    <>
      {/* UI */}
      <WorldCanvas worldState={worldState} updateWorldState={updateWorldState} setWorldState={setWorldState} />
      <FullScreenMessages worldState={worldState} />
      <MessagesLog />
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
