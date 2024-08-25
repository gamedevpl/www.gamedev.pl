import { createElement, createDiv, addWindowEventHandler, removeWindowEventHandler } from '../../utils/dom';
import { generateLevel } from '../gameplay/level-generator';

export class LevelStory {
  private level: number;
  private onStoryComplete: () => void;
  private container: HTMLElement;
  private levelStory: string;

  constructor(level: number, onStoryComplete: () => void) {
    this.level = level;
    this.onStoryComplete = onStoryComplete;
    this.container = createDiv('level-story');
    [, , this.levelStory] = generateLevel(level);

    this.handleKeyPress = this.handleKeyPress.bind(this);
    setTimeout(() => {
      addWindowEventHandler('keydown', this.handleKeyPress);
    });
  }

  render(): HTMLElement {
    const title = createElement('h2');
    title.textContent = `Level ${this.level}`;

    const story = createElement('p');
    story.textContent = this.levelStory;

    const instruction = createElement('p');
    instruction.textContent = 'Press any key to start...';

    this.container.appendChild(title);
    this.container.appendChild(story);
    this.container.appendChild(instruction);

    return this.container;
  }

  private handleKeyPress(e: KeyboardEvent) {
    e.preventDefault();
    this.onStoryComplete();
    this.destroy();
  }

  destroy() {
    removeWindowEventHandler('keydown', this.handleKeyPress);
  }
}
