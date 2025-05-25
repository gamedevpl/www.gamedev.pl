import { useEffect } from 'react';
import { AppState } from '../context/game-context';

export function usePersistState(appState: string, setAppState: (state: AppState) => void): void {
  useEffect(() => {
    // This effect runs once when the component mounts
    const handleHashChange = () => {
      const newState = document.location.hash === '#game' ? 'game' : 'intro';
      setAppState(newState);
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
    } else {
      document.location.hash = '';
    }
  }, [appState]);
}
