import { Unit } from '../designer-types';
import { countUnitTypes, analyzePositions, calculateSpreadScore } from '../utils/plan-utils';

const units: Unit[] = [
  // Dense center of warriors (2 rows)
  ...[...Array(10)].map(
    (_, i) =>
      ({
        id: i,
        type: 'warrior',
        col: -2 + (i % 5),
        row: -4 + Math.floor(i / 5),
        sizeCol: 2,
        sizeRow: 2,
        command: 'advance',
      } as Unit),
  ),

  // Archers behind the warriors (1 row)
  ...[...Array(5)].map(
    (_, i) =>
      ({
        id: i + 10,
        type: 'archer',
        col: -2 + i,
        row: -2,
        sizeCol: 2,
        sizeRow: 2,
        command: 'advance',
      } as Unit),
  ),

  // Artillery at the back (1 row)
  ...[...Array(3)].map(
    (_, i) =>
      ({
        id: i + 15,
        type: 'artillery',
        col: -3 + i * 3,
        row: 0,
        sizeCol: 3,
        sizeRow: 2,
        command: 'advance',
      } as Unit),
  ),

  // Flanking warriors (thinning out)
  ...[...Array(4)].map(
    (_, i) =>
      ({
        id: i + 18,
        type: 'warrior',
        col: i < 2 ? -4 : 4,
        row: -5 + (i % 2) * 2,
        sizeCol: 2,
        sizeRow: 2,
        command: 'advance',
      } as Unit),
  ),

  // Flanking archers (thinning out)
  ...[...Array(4)].map(
    (_, i) =>
      ({
        id: i + 22,
        type: 'archer',
        col: i < 2 ? -5 : 5,
        row: -4 + (i % 2) * 2,
        sizeCol: 2,
        sizeRow: 2,
        command: 'advance',
      } as Unit),
  ),
];

export const name = 'Phalanx Formation';

export { units };

export function probabilityScore(playerUnits: Unit[]): number {
  const ourUnits = countUnitTypes(units);
  const theirUnits = countUnitTypes(playerUnits);

  const ourPositions = analyzePositions(units);
  const theirPositions = analyzePositions(playerUnits);

  const ourSpread = calculateSpreadScore(units);
  const theirSpread = calculateSpreadScore(playerUnits);

  // Factors that favor this formation:
  // 1. We have more warriors than they do (strong center)
  // 2. They have more tanks (our dense formation is good against tanks)
  // 3. We have a higher concentration in the center
  // 4. They have a more spread out formation (easier for us to break through)

  let score = 0.5; // Base score

  score += (ourUnits.warrior - theirUnits.warrior) * 0.02;
  score += (theirUnits.tank - ourUnits.tank) * 0.03;
  score += (ourPositions.center - theirPositions.center) * 0.1;
  score += (theirSpread - ourSpread) * 0.1;

  // Slight penalty if they have significantly more archers or artillery
  score -= Math.max(0, theirUnits.archer - ourUnits.archer) * 0.01;
  score -= Math.max(0, theirUnits.artillery - ourUnits.artillery) * 0.01;

  // Normalize score between 0 and 1
  return Math.max(0, Math.min(1, score));
}