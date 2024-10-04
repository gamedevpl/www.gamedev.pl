import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { GlobalStyles } from './global-styles';
import { IntroScreen } from './screens/intro/intro-screen';
import { DesignerScreen, Unit } from './screens/designer/designer-screen';
import { BattleScreen } from './screens/battle/battle-screen';

type CurrentScreen =
  | {
      name: 'intro';
    }
  | { name: 'designer'; playerUnits?: Unit[] }
  | {
      name: 'battle';
      playerUnits: Unit[];
      oppositionUnits: Unit[];
    };

const App: React.FC = () => {
  const [currentScreen, setCurrentScreen] = useState<CurrentScreen>({ name: 'intro' });

  const handlePlayClick = () => {
    setCurrentScreen({ name: 'designer' });
  };

  const handleStartBattle = (playerUnits: Unit[], oppositionUnits: Unit[]) => {
    setCurrentScreen({ name: 'battle', playerUnits, oppositionUnits });
    // Here you would typically initialize the battle with the designed units
    console.log('Battle started!');
  };

  const handleBattleEnd = () => {
    setCurrentScreen({
      name: 'designer',
      playerUnits: currentScreen.name === 'battle' ? currentScreen.playerUnits : undefined,
    });
  };

  return (
    <React.StrictMode>
      <GlobalStyles />
      {currentScreen?.name === 'intro' && <IntroScreen onPlayClick={handlePlayClick} />}
      {currentScreen?.name === 'designer' && (
        <DesignerScreen onStartBattle={handleStartBattle} initialPlayerUnits={currentScreen.playerUnits} />
      )}
      {currentScreen?.name === 'battle' && (
        <BattleScreen
          onBattleEnd={handleBattleEnd}
          playerUnits={currentScreen.playerUnits}
          oppositionUnits={currentScreen.oppositionUnits}
        />
      )}
    </React.StrictMode>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<App />);
