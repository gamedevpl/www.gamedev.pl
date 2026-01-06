import { useEffect } from 'react';
import { AppState } from '../context/game-context';

export function usePersistState(appState: AppState, setAppState: (state: AppState) => void): void {
  useEffect(() => {
    // This effect runs once when the component mounts
    const handleHashChange = () => {
      const hash = document.location.hash;
      if (hash === '#game') {
        setAppState('game');
      } else if (hash === '#effects') {
        setAppState('effects');
      } else if (hash === '#buildings') {
        setAppState('buildings');
      } else if (hash === '#pathfinding') {
        setAppState('pathfinding');
      } else if (hash === '#gord') {
        setAppState('gord');
      } else {
        setAppState('intro');
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    handleHashChange(); // Call it once to set the initial state
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  useEffect(() => {
    // This effect runs whenever appState changes
    if (appState === 'game') {
      document.location.hash = '#game';
    } else if (appState === 'effects') {
      document.location.hash = '#effects';
    } else if (appState === 'pathfinding') {
      document.location.hash = '#pathfinding';
    } else if (appState === 'gord') {
      document.location.hash = '#gord';
    } else if (appState === 'intro') {
      document.location.hash = '';
    }
    // When appState is 'gameOver', we do nothing to the hash. This prevents
    // the hashchange event from firing and resetting the state to 'intro'.
  }, [appState]);
}
