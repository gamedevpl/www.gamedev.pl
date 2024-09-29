import { useState } from 'react';

import { GameStateIntro } from './game-states/game-state-intro';
import { GameStateBattleInit } from './game-states/game-state-battle-init';
import { GameStateBattle } from './game-states/game-state-battle';

export function MasterPlanApp() {
  const [state, setState] = useState(() => (window.location.hash === '#battle' ? 'battle' : 'intro'));

  const renderState = () => {
    switch (state) {
      case 'intro':
        return <GameStateIntro onNext={() => setState('battleInit')} />;
      case 'battleInit':
        return <GameStateBattleInit onNext={() => setState('battle')} />;
      case 'battle':
        return <GameStateBattle onEnd={() => setState('intro')} />;
      default:
        return <GameStateIntro onNext={() => setState('battleInit')} />;
    }
  };

  return <div>{renderState()}</div>;
}
