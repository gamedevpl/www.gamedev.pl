import { createElement, createDiv, createButton, appendChildren } from '../../utils/dom';

export class GameOver {
  private score: number;
  private steps: number;
  private onTryAgain: () => void;
  private onQuit: () => void;

  constructor(score: number, steps: number, onTryAgain: () => void, onQuit: () => void) {
    this.score = score;
    this.steps = steps;
    this.onTryAgain = onTryAgain;
    this.onQuit = onQuit;
  }

  render(): HTMLElement {
    const container = createDiv('game-over');

    const title = createElement('h1');
    title.textContent = 'Game Over';

    const scoreText = createElement('p');
    scoreText.textContent = `Your score: ${this.score}`;

    const stepsText = createElement('p');
    stepsText.textContent = `Steps taken: ${this.steps}`;

    const tryAgainButton = createButton('Try Again', this.onTryAgain);
    const quitButton = createButton('Quit', this.onQuit);

    appendChildren(container, [
      title,
      scoreText,
      stepsText,
      tryAgainButton,
      quitButton
    ]);

    return container;
  }
}