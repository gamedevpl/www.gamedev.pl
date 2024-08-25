import { GamePreview } from './game-preview';
import { createElement, createDiv, createButton, appendChildren } from '../../utils/dom';

export class Intro {
  private onStart: () => void;
  private onInstructions: () => void;

  constructor(onStart: () => void, onInstructions: () => void) {
    this.onStart = onStart;
    this.onInstructions = onInstructions;
  }

  render(): HTMLElement {
    const container = createDiv('intro');

    const title = createElement('h1');
    title.className = 'game-title';
    title.textContent = 'Monster Steps';

    const introResponsive = createDiv('game-intro-responsive');

    const previewContainer = createDiv('game-preview-container');
    const gamePreview = new GamePreview();
    previewContainer.appendChild(gamePreview.render());

    const introColumn = createDiv('game-intro-column');

    const buttonContainer = createDiv('intro-buttons');
    const startButton = createButton('Start Game', this.onStart);
    const instructionsButton = createButton('Instructions', this.onInstructions);
    appendChildren(buttonContainer, [startButton, instructionsButton]);

    const tip = createElement('p');
    tip.className = 'intro-tip';
    tip.textContent = 'Press right arrow to start';

    appendChildren(introColumn, [buttonContainer, tip]);
    appendChildren(introResponsive, [previewContainer, introColumn]);

    const authorInfo = createElement('p');
    authorInfo.className = 'author-name';
    authorInfo.innerHTML = 'Created by <a href="https://x.com/gtanczyk">Grzegorz Tańczyk</a> | <a href="https://github.com/gamedevpl/www.gamedev.pl/tree/master/js13k2024">Source code (GitHub)</a>';

    appendChildren(container, [title, introResponsive, authorInfo]);

    return container;
  }
}