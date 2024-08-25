import { createElement, createDiv, createButton, addWindowEventHandler } from '../../utils/dom';

export class Instructions {
  private onBack: () => void;

  constructor(onBack: () => void) {
    this.onBack = onBack;
  }

  render(): HTMLElement {
    const container = createDiv('instructions');

    const title = createElement('h1');
    title.textContent = 'How to Play Monster Steps';

    const instructionsList = this.createInstructionsList();
    const bonusDetails = this.createBonusDetails();
    const tips = this.createTips();

    const backButton = createButton('Back to Menu', this.onBack);

    const escapeInstruction = createElement('p');
    escapeInstruction.className = 'instructions-tip';
    escapeInstruction.textContent = 'Press Escape to return to the main menu';

    container.appendChild(title);
    container.appendChild(instructionsList);
    container.appendChild(bonusDetails);
    container.appendChild(tips);
    container.appendChild(backButton);
    container.appendChild(escapeInstruction);

    this.addKeyboardListener();

    return container;
  }

  private createInstructionsList(): HTMLElement {
    const list = createElement('ul');
    const instructions = [
      'Use arrow keys, touch controls, or mouse clicks to move your character',
      'Avoid obstacles and monsters',
      'Reach the goal (green square) to complete the level',
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
  }

  private createBonusDetails(): HTMLElement {
    const container = createDiv();
    const title = createElement('h2');
    title.textContent = 'New Bonus Details';

    const bonusList = createElement('ul');
    const bonuses = [
      {
        name: 'Tsunami',
        details: [
          'Water gradually floods the grid over 13 steps',
          'Movement becomes slower for both you and monsters',
          'At the 13th step, everything not on an obstacle is eliminated',
          'Use the Climber bonus to survive on obstacles',
        ],
      },
      {
        name: 'Monster',
        details: [
          'You become a monster for 13 steps',
          'Monsters become vulnerable "players" during this time',
          'Eliminate all monster-players to win, but be careful not to let them reach the goal!',
        ],
      },
      {
        name: 'Slide',
        details: [
          'Your movement becomes a slide in the chosen direction',
          "You'll keep moving until you hit an obstacle or the edge of the grid",
          'Use this to quickly traverse the grid, but plan your moves carefully!',
        ],
      },
      {
        name: 'Sokoban',
        details: [
          'Gain the ability to push obstacles',
          'Use this to create new paths or crush monsters',
          'Strategic obstacle placement can help block monster paths',
        ],
      },
      {
        name: 'Blaster',
        details: [
          "Equip a blaster that shoots in the direction you're moving",
          'Eliminate monsters in your path',
          'Use carefully to clear your way to the goal',
        ],
      },
    ];

    bonuses.forEach((bonus) => {
      const item = createElement('li');
      const bonusName = createElement('strong');
      bonusName.textContent = bonus.name + ': ';
      item.appendChild(bonusName);

      const detailsList = createElement('ul');
      bonus.details.forEach((detail) => {
        const detailItem = createElement('li');
        detailItem.textContent = detail;
        detailsList.appendChild(detailItem);
      });

      item.appendChild(detailsList);
      bonusList.appendChild(item);
    });

    container.appendChild(title);
    container.appendChild(bonusList);
    return container;
  }

  private createTips(): HTMLElement {
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
  }

  private addKeyboardListener() {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        this.onBack();
      }
    };

    addWindowEventHandler('keydown', handleKeyDown);
  }
}
