import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { GlobalStyles } from './global-styles';
import { IntroScreen } from './screens/intro/intro-screen';
import { PlayScreen } from './screens/play/play-screen';

type CurrentScreen =
  | {
      name: 'intro';
    }
  | { name: 'play' };

const App: React.FC = () => {
  const [currentScreen, setCurrentScreen] = useState<CurrentScreen>({ name: 'intro' });

  const handlePlayClick = () => {
    setCurrentScreen({ name: 'play' });
  };

  return (
    <React.StrictMode>
      <GlobalStyles />
      {currentScreen?.name === 'intro' && <IntroScreen onPlayClick={handlePlayClick} />}
      {currentScreen?.name === 'play' && <PlayScreen />}
    </React.StrictMode>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<App />);
