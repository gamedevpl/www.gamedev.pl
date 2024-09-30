import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { GlobalStyles } from './global-styles';
import { IntroScreen } from './components/IntroScreen';
import { DesignerScreen, Unit } from './components/DesignerScreen';
import { OldApp } from './old-app';

import { saveBattleString } from './js/battle-string';

const App: React.FC = () => {
  const [currentScreen, setCurrentScreen] = useState<'intro' | 'designer' | 'battle'>('intro');

  const handlePlayClick = () => {
    setCurrentScreen('designer');
  };

  const handleStartBattle = (units: Unit[]) => {
    saveBattleString(units);
    setCurrentScreen('battle');
    // Here you would typically initialize the battle with the designed units
    console.log('Battle started!');
  };

  const handleBattleEnd = () => {
    setCurrentScreen('designer');
  };

  return (
    <React.StrictMode>
      <GlobalStyles />
      {currentScreen === 'intro' && <IntroScreen onPlayClick={handlePlayClick} />}
      {currentScreen === 'designer' && <DesignerScreen onStartBattle={handleStartBattle} />}
      {currentScreen === 'battle' && <OldApp onBattleEnd={handleBattleEnd} />}
    </React.StrictMode>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<App />);
