import { generateLevel } from '../gameplay/levels/level-generator';

interface LevelStoryResult {
  html: string;
  setup: () => void;
}

export function renderLevelStory(level: number, onStoryComplete: () => void): LevelStoryResult {
  const [, , levelStory] = generateLevel(level);

  const levelStoryHtml = `
    <div class="level-story">
      <h2>Level ${level}</h2>
      <p>${levelStory}</p>
      <p>Press any key to start...</p>
    </div>
  `;

  return {
    html: levelStoryHtml,
    setup: () => {
      const handleKeyPress = (e: KeyboardEvent) => {
        e.preventDefault();
        onStoryComplete();
        window.removeEventListener('keydown', handleKeyPress);
      };

      // Add the event listener after a short delay to prevent accidental skips
      setTimeout(() => {
        window.addEventListener('keydown', handleKeyPress);
      }, 100);
    },
  };
}
