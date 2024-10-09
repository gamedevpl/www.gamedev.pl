import { Unit } from '../designer-types';
import { countUnitTypes, analyzePositions, averageUnitSize, calculateSpreadScore } from '../utils/plan-utils';

const units: Unit[] = [
  // Outer layer: Warriors forming a square (reduced from 16 to 12)
  ...[...Array(12)].map(
    (_, i) =>
      ({
        id: i,
        type: 'warrior',
        col: i < 3 ? -6 : i < 6 ? i - 7.5 : i < 9 ? 6 : 7.5 - i,
        row: i < 3 ? i - 7.5 : i < 6 ? -6 : i < 9 ? 7.5 - i : 6,
        sizeCol: 2,
        sizeRow: 2,
        command: 'defend',
      } as Unit),
  ),

  // Middle layer: Tanks at the corners (reduced from 4 to 3)
  ...[...Array(3)].map(
    (_, i) =>
      ({
        id: i + 12,
        type: 'tank',
        col: i === 0 ? -3 : i === 1 ? 3 : 0,
        row: i === 0 ? -3 : i === 1 ? 3 : -3,
        sizeCol: 3,
        sizeRow: 3,
        command: 'defend',
      } as Unit),
  ),

  // Inner layer: Archers (reduced from 8 to 6)
  ...[...Array(6)].map(
    (_, i) =>
      ({
        id: i + 15,
        type: 'archer',
        col: i < 3 ? -2 : 2,
        row: (i % 3) - 1,
        sizeCol: 2,
        sizeRow: 2,
        command: 'attack',
      } as Unit),
  ),

  // Core: Artillery (reduced from 4 to 2)
  ...[...Array(2)].map(
    (_, i) =>
      ({
        id: i + 21,
        type: 'artillery',
        col: i * 2 - 1,
        row: -1,
        sizeCol: 2,
        sizeRow: 2,
        command: 'attack',
      } as Unit),
  ),

  // Additional warriors for reinforcement (reduced from 6 to 3)
  ...[...Array(3)].map(
    (_, i) =>
      ({
        id: i + 23,
        type: 'warrior',
        col: (i - 1) * 2,
        row: -5,
        sizeCol: 2,
        sizeRow: 2,
        command: 'defend',
      } as Unit),
  ),
];

export const name = 'Fortress Defense';

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
  // 1. We have a more concentrated formation (our fortress is strong)
  // 2. They have a more spread out formation (harder to breach our fortress)
  // 3. We have more warriors and tanks (good for defense)
  // 4. They have fewer artillery units (less threat to our fortress)
  // 5. They have more units in the front (easier for our archers and artillery to target)

  let score = 0.5; // Base score

  score += (theirSpread - ourSpread) * 0.2;
  score += (ourUnits.warrior + ourUnits.tank - theirUnits.warrior - theirUnits.tank) * 0.02;
  score += (ourUnits.artillery - theirUnits.artillery) * 0.03;
  score += (theirPositions.front - ourPositions.front) * 0.15;

  // Bonus if we have more units in the center (our fortress is intact)
  score += (ourPositions.center - theirPositions.center) * 0.1;

  // Penalty if they have significantly more ranged units (archers + artillery)
  const ourRanged = ourUnits.archer + ourUnits.artillery;
  const theirRanged = theirUnits.archer + theirUnits.artillery;
  score -= Math.max(0, theirRanged - ourRanged) * 0.02;

  // Bonus if their average unit size is larger (our fortress can withstand better)
  score += (theirSize - ourSize) * 0.1;

  // Normalize score between 0 and 1
  return Math.max(0, Math.min(1, score));
}