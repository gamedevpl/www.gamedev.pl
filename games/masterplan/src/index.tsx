import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { GlobalStyles } from './global-styles';
import { OldApp } from './old-app';
import { IntroScreen } from './components/IntroScreen';

const App: React.FC = () => {
  const [showIntro, setShowIntro] = useState(true);

  const handlePlayClick = () => {
    setShowIntro(false);
  };

  return (
    <React.StrictMode>
      <GlobalStyles />
      {showIntro ? (
        <IntroScreen onPlayClick={handlePlayClick} />
      ) : (
        <OldApp />
      )}
    </React.StrictMode>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<App />);