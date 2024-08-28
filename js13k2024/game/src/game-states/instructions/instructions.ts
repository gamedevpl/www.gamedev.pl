import { createElement, createDiv, addWindowEventHandler, removeWindowEventHandler } from '../../utils/dom';

interface InstructionsResult {
  html: string;
  setup: () => void;
  cleanup: () => void;
}

export function renderInstructions(onBack: () => void): InstructionsResult {
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      onBack();
    }
  };

  const createInstructionsList = (): HTMLElement => {
    const list = createElement('ul');
    const instructions = [
      'Use arrow keys, touch controls, or mouse clicks to move your character',
      'Avoid obstacles and monsters',
      'Reach the goal (black star on yellow square) to complete the level',
      'New monsters appear every 13 steps',
      'Collect bonuses for special abilities',
      'Complete all 13 levels to win',
    ];

    instructions.forEach((instruction) => {
      const item = createElement('li');
      item.textContent = instruction;
      list.appendChild(item);
    });

    return list;
  };

  const createTips = (): HTMLElement => {
    const container = createDiv();
    const title = createElement('h2');
    title.textContent = 'Tips';

    const tipsList = createElement('ul');
    const tips = [
      'Plan your route to avoid getting trapped',
      'Use obstacles and new bonuses strategically to outmaneuver monsters',
      'Combine bonuses for powerful effects (e.g., Climber during Tsunami)',
      'Think ahead when using Slide or Sokoban to avoid putting yourself in danger',
      'Keep track of your steps to anticipate new monster spawns',
    ];

    tips.forEach((tip) => {
      const item = createElement('li');
      item.textContent = tip;
      tipsList.appendChild(item);
    });

    container.appendChild(title);
    container.appendChild(tipsList);
    return container;
  };

  const html = `
    <div class="instructions">
      <h1>How to Play Monster Steps</h1>
      <div id="instructionsList"></div>
      <div id="tips"></div>
      <button id="backButton">Back to Menu</button>
      <p class="instructions-tip">Press Escape to return to the main menu</p>
    </div>
  `;

  const setup = () => {
    const container = document.querySelector('.instructions')!;
    const instructionsListContainer = container.querySelector('#instructionsList')!;
    const tipsContainer = container.querySelector('#tips')!;
    const backButton = container.querySelector('#backButton') as HTMLButtonElement;

    instructionsListContainer.appendChild(createInstructionsList());
    tipsContainer.appendChild(createTips());

    backButton.addEventListener('click', onBack);
    addWindowEventHandler('keydown', handleKeyDown);
  };

  const cleanup = () => {
    removeWindowEventHandler('keydown', handleKeyDown);
  };

  return { html, setup, cleanup };
}
