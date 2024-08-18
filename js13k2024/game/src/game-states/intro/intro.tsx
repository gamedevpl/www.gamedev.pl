import { FunctionComponent, useEffect } from 'react';
import { GamePreview } from './game-preview';

interface IntroProps {
  onStart: () => void;
  onInstructions: () => void;
}

export const Intro: FunctionComponent<IntroProps> = ({ onStart, onInstructions }) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') {
        onStart();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onStart]);

  return (
    <div className="intro">
      <h1 className="game-title">Monster Steps</h1>
      <div className="game-intro-responsive">
        <div className="game-preview-container">
          <GamePreview />
        </div>
        <div className="game-intro-column">
          <div className="intro-buttons">
            <button onClick={onStart}>Start Game</button>
            <button onClick={onInstructions}>Instructions</button>
          </div>
          <p className="intro-tip">Press right arrow to start</p>
          <p className="author-name">Created by Grzegorz Tańczyk</p>
        </div>
      </div>
    </div>
  );
};
