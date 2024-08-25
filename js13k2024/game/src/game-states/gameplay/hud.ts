import { createElement, createDiv, updateText } from '../../utils/dom';

export class HUD {
  private level: number;
  private score: number;
  private steps: number;
  private container: HTMLElement;
  private levelElement: HTMLElement;
  private scoreElement: HTMLElement;
  private stepsElement: HTMLElement;

  constructor(level: number, score: number, steps: number) {
    this.level = level;
    this.score = score;
    this.steps = steps;
    this.container = createDiv('hud');
    this.levelElement = createElement('div');
    this.scoreElement = createElement('div');
    this.stepsElement = createElement('div');
  }

  render(): HTMLElement {
    this.levelElement.textContent = `Level: ${this.level}`;
    this.scoreElement.textContent = `Score: ${this.score}`;
    this.stepsElement.textContent = `Steps: ${this.steps}`;

    this.container.appendChild(this.levelElement);
    this.container.appendChild(this.scoreElement);
    this.container.appendChild(this.stepsElement);

    return this.container;
  }

  update(level: number, score: number, steps: number): void {
    this.level = level;
    this.score = score;
    this.steps = steps;

    updateText(this.levelElement, `Level: ${this.level}`);
    updateText(this.scoreElement, `Score: ${this.score}`);
    updateText(this.stepsElement, `Steps: ${this.steps}`);
  }
}