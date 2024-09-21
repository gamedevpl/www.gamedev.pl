import { useState } from 'react';

import IntroState from './states/intro-state';
import BattleInitState from './states/battle-init-state';
import BattleState from './states/battle-state';

export function MasterPlanApp() {
  const [state, setState] = useState('intro');

  const renderState = () => {
    switch (state) {
      case 'intro':
        return <IntroState onNext={() => setState('battleInit')} />;
      case 'battleInit':
        return <BattleInitState onNext={() => setState('battle')} />;
      case 'battle':
        return <BattleState onEnd={() => setState('intro')} />;
      default:
        return <IntroState onNext={() => setState('battleInit')} />;
    }
  };

  return <div>{renderState()}</div>;
}
