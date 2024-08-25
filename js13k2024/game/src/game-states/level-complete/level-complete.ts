import { createElement, createDiv, createButton, appendChildren } from '../../utils/dom';

export class LevelComplete {
  private level: number;
  private onNextLevel: () => void;
  private onQuit: () => void;

  constructor(level: number, onNextLevel: () => void, onQuit: () => void) {
    this.level = level;
    this.onNextLevel = onNextLevel;
    this.onQuit = onQuit;
  }

  render(): HTMLElement {
    const container = createDiv('level-complete');

    const title = createElement('h1');
    title.textContent = `Level ${this.level} Complete!`;

    const message = createElement('p');
    message.textContent = "Congratulations! You've completed the level.";

    const nextLevelButton = createButton('Next Level', this.onNextLevel);
    const quitButton = createButton('Quit', this.onQuit);

    appendChildren(container, [
      title,
      message,
      nextLevelButton,
      quitButton
    ]);

    return container;
  }
}