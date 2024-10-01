import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { GlobalStyles } from './global-styles';
import { IntroScreen } from './components/IntroScreen';
import { DesignerScreen, Unit } from './components/DesignerScreen';
import { OldApp } from './old-app';

type CurrentScreen =
  | {
      name: 'intro';
    }
  | { name: 'designer' }
  | {
      name: 'battle';
      units: Unit[];
    };

const App: React.FC = () => {
  const [currentScreen, setCurrentScreen] = useState<CurrentScreen>({ name: 'intro' });

  const handlePlayClick = () => {
    setCurrentScreen({ name: 'designer' });
  };

  const handleStartBattle = (units: Unit[]) => {
    setCurrentScreen({ name: 'battle', units });
    // Here you would typically initialize the battle with the designed units
    console.log('Battle started!');
  };

  const handleBattleEnd = () => {
    setCurrentScreen({ name: 'designer' });
  };

  return (
    <React.StrictMode>
      <GlobalStyles />
      {currentScreen?.name === 'intro' && <IntroScreen onPlayClick={handlePlayClick} />}
      {currentScreen?.name === 'designer' && <DesignerScreen onStartBattle={handleStartBattle} />}
      {currentScreen?.name === 'battle' && <OldApp onBattleEnd={handleBattleEnd} units={currentScreen.units} />}
    </React.StrictMode>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<App />);
