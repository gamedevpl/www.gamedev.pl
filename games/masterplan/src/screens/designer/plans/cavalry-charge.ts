import { Unit } from '../designer-types';
import { countUnitTypes, analyzePositions, averageUnitSize, calculateSpreadScore } from '../utils/plan-utils';

const units: Unit[] = [
  // Wedge formation of tanks (reduced from 15 to 5)
  ...[...Array(5)].map(
    (_, i) =>
      ({
        id: i,
        type: 'tank',
        col: Math.floor(i / 2) - 1,
        row: -6 + (i % 2) + Math.floor(i / 2),
        sizeCol: 3,
        sizeRow: 3,
        command: 'advance',
      } as Unit),
  ),

  // Second wave of tanks (reduced from 10 to 3)
  ...[...Array(3)].map(
    (_, i) =>
      ({
        id: i + 5,
        type: 'tank',
        col: (i - 1) * 2,
        row: -2,
        sizeCol: 3,
        sizeRow: 3,
        command: 'advance',
      } as Unit),
  ),

  // Artillery support (reduced from 5 to 2)
  ...[...Array(2)].map(
    (_, i) =>
      ({
        id: i + 8,
        type: 'artillery',
        col: i * 4 - 2,
        row: 2,
        sizeCol: 3,
        sizeRow: 2,
        command: 'advance',
      } as Unit),
  ),

  // Flanking warriors for minimal infantry support (reduced from 6 to 4)
  ...[...Array(4)].map(
    (_, i) =>
      ({
        id: i + 10,
        type: 'warrior',
        col: i < 2 ? -6 : 6,
        row: -4 + (i % 2) * 2,
        sizeCol: 2,
        sizeRow: 2,
        command: 'advance',
      } as Unit),
  ),
];

export const name = 'Cavalry Charge';

export { units };

export function probabilityScore(playerUnits: Unit[]): number {
  const ourUnits = countUnitTypes(units);
  const theirUnits = countUnitTypes(playerUnits);

  const ourPositions = analyzePositions(units);
  const theirPositions = analyzePositions(playerUnits);

  const ourSize = averageUnitSize(units);
  const theirSize = averageUnitSize(playerUnits);

  const ourSpread = calculateSpreadScore(units);
  const theirSpread = calculateSpreadScore(playerUnits);

  // Factors that favor this formation:
  // 1. We have more tanks than they do (our main strength)
  // 2. They have fewer anti-tank units (warriors and artillery)
  // 3. We have a higher concentration in the front (for a quick assault)
  // 4. They have a more spread out formation (easier for us to break through)
  // 5. Their units are smaller on average (our tanks can overrun them)

  let score = 0.5; // Base score

  score += (ourUnits.tank - theirUnits.tank) * 0.03;
  score -= (theirUnits.warrior + theirUnits.artillery) * 0.02;
  score += (ourPositions.front - theirPositions.front) * 0.1;
  score += (theirSpread - ourSpread) * 0.1;
  score += (ourSize - theirSize) * 0.2;

  // Slight bonus if they have more archers (which our tanks can easily overrun)
  score += Math.max(0, theirUnits.archer - ourUnits.archer) * 0.01;

  // Normalize score between 0 and 1
  return Math.max(0, Math.min(1, score));
}