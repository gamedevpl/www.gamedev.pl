import { Unit } from '../designer-types';
import { countUnitTypes, analyzePositions, averageUnitSize, calculateSpreadScore } from '../utils/plan-utils';

const createScatteredGroup = (startId: number, centerCol: number, centerRow: number): Unit[] => {
  return [
    {
      id: startId,
      type: 'warrior',
      col: centerCol - 1,
      row: centerRow - 1,
      sizeCol: 2,
      sizeRow: 2,
      command: 'attack',
    },
    {
      id: startId + 1,
      type: 'archer',
      col: centerCol,
      row: centerRow,
      sizeCol: 2,
      sizeRow: 2,
      command: 'attack',
    },
    {
      id: startId + 2,
      type: 'tank',
      col: centerCol + 1,
      row: centerRow + 1,
      sizeCol: 3,
      sizeRow: 3,
      command: 'attack',
    },
  ];
};

const units: Unit[] = [
  ...createScatteredGroup(0, -10, -5),
  ...createScatteredGroup(3, 0, -6),
  ...createScatteredGroup(6, 10, -5),
  ...createScatteredGroup(9, -8, 0),
  ...createScatteredGroup(12, 8, 0),
  ...createScatteredGroup(15, -5, 5),
  ...createScatteredGroup(18, 5, 5),
  // Add some artillery for long-range support
  ...[...Array(2)].map(
    (_, i) =>
      ({
        id: 21 + i,
        type: 'artillery',
        col: i * 10 - 5,
        row: 8,
        sizeCol: 3,
        sizeRow: 2,
        command: 'attack',
      } as Unit),
  ),
];

export const name = 'Guerrilla Tactics';

export { units };

export function probabilityScore(playerUnits: Unit[]): number {
  const ourUnits = countUnitTypes(units);
  const theirUnits = countUnitTypes(playerUnits);

  const theirPositions = analyzePositions(playerUnits);

  const ourSize = averageUnitSize(units);
  const theirSize = averageUnitSize(playerUnits);

  const ourSpread = calculateSpreadScore(units);
  const theirSpread = calculateSpreadScore(playerUnits);

  // Factors that favor this formation:
  // 1. We have a more spread out formation (harder to counter)
  // 2. They have a more concentrated formation (easier for us to surround and pick off)
  // 3. We have a good mix of unit types (versatility)
  // 4. They have larger units on average (our small groups can maneuver better)
  // 5. They have more units in a single area (front, center, etc.)

  let score = 0.5; // Base score

  score += (ourSpread - theirSpread) * 0.2;
  score += (Math.abs(theirPositions.front - 0.5) + Math.abs(theirPositions.center - 0.5)) * 0.15;
  score += (theirSize - ourSize) * 0.15;

  // Bonus for our unit type diversity
  const ourDiversity =
    Math.min(ourUnits.warrior, ourUnits.archer, ourUnits.tank, ourUnits.artillery) /
    Math.max(ourUnits.warrior, ourUnits.archer, ourUnits.tank, ourUnits.artillery);
  score += ourDiversity * 0.1;

  // Penalty if they have significantly more of any unit type
  const maxDiff = Math.max(
    theirUnits.warrior - ourUnits.warrior,
    theirUnits.archer - ourUnits.archer,
    theirUnits.tank - ourUnits.tank,
    theirUnits.artillery - ourUnits.artillery,
  );
  score -= Math.max(0, maxDiff) * 0.02;

  // Normalize score between 0 and 1
  return Math.max(0, Math.min(1, score));
}
