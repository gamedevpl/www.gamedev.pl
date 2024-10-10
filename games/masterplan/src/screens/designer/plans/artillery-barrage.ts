import { Unit } from '../designer-types';
import { countUnitTypes, analyzePositions, averageUnitSize, calculateSpreadScore } from '../utils/plan-utils';

const units: Unit[] = [
  // Main artillery line (reduced from 15 to 7)
  ...[...Array(7)].map(
    (_, i) =>
      ({
        id: i,
        type: 'artillery',
        col: i * 3 - 9,
        row: 2,
        sizeCol: 3,
        sizeRow: 2,
        command: 'advance',
      } as Unit),
  ),

  // Secondary artillery line (reduced from 10 to 4)
  ...[...Array(4)].map(
    (_, i) =>
      ({
        id: i + 7,
        type: 'artillery',
        col: i * 4 - 6,
        row: 0,
        sizeCol: 3,
        sizeRow: 2,
        command: 'advance',
      } as Unit),
  ),

  // Minimal tank defense (reduced from 5 to 3)
  ...[...Array(3)].map(
    (_, i) =>
      ({
        id: i + 11,
        type: 'tank',
        col: i * 6 - 6,
        row: -4,
        sizeCol: 4,
        sizeRow: 3,
        command: 'wait-advance',
      } as Unit),
  ),

  // Warrior frontline (reduced from 8 to 5)
  ...[...Array(5)].map(
    (_, i) =>
      ({
        id: i + 14,
        type: 'warrior',
        col: i * 4 - 8,
        row: -6,
        sizeCol: 3,
        sizeRow: 2,
        command: 'wait-advance',
      } as Unit),
  ),
];

export const name = 'Artillery Barrage';

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
  // 1. We have significantly more artillery than they do (our main strength)
  // 2. They have fewer fast units (tanks and warriors) that can close the distance quickly
  // 3. They have a more concentrated formation (easier for our artillery to hit)
  // 4. They have more units in the front (prime targets for our artillery)
  // 5. Their units are smaller on average (more vulnerable to artillery fire)

  let score = 0.5; // Base score

  score += (ourUnits.artillery - theirUnits.artillery) * 0.04;
  score -= (theirUnits.tank + theirUnits.warrior) * 0.02;
  score += (theirSpread - ourSpread) * 0.15;
  score += (theirPositions.front - ourPositions.front) * 0.1;
  score += (theirSize - ourSize) * 0.1;

  // Bonus if they have more archers (vulnerable to our artillery)
  score += Math.max(0, theirUnits.archer - ourUnits.archer) * 0.02;

  // Penalty if they have significantly more tanks (our weakness)
  score -= Math.max(0, theirUnits.tank - ourUnits.tank) * 0.03;

  // Normalize score between 0 and 1
  return Math.max(0, Math.min(1, score));
}
