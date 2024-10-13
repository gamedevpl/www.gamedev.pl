import { Unit } from '../../designer/designer-types';

/**
 * Trims the units proportionally to ensure the total number of soldiers does not exceed maxSoldiers.
 * Maintains balanced formations by reducing sizeCol and sizeRow together where possible.
 * @param units - Array of Unit objects to be trimmed.
 * @param maxSoldiers - The maximum allowed number of soldiers.
 * @returns A new array of Unit objects trimmed to meet the maxSoldiers constraint.
 */
export function trimUnits(units: Unit[], maxSoldiers: number): Unit[] {
  if (maxSoldiers <= 0) {
    throw new Error('maxSoldiers must be a positive integer.');
  }

  // Deep copy to avoid mutating the original units
  const trimmedUnits = units.map((unit) => ({ ...unit }));

  const totalSoldiers = countSoldiers(trimmedUnits);

  if (totalSoldiers <= maxSoldiers) {
    return trimmedUnits; // No trimming needed
  }

  let delta = totalSoldiers - maxSoldiers;

  // Sort units by area descending to prioritize larger units
  trimmedUnits.sort((a, b) => b.sizeCol * b.sizeRow - a.sizeCol * a.sizeRow);

  while (delta > 0) {
    let trimmed = false;

    for (const unit of trimmedUnits) {
      // Only consider units that can be reduced proportionally
      if (unit.sizeCol > 1 && unit.sizeRow > 1) {
        // Calculate soldiers removed by reducing both dimensions by 1
        const soldiersRemoved = unit.sizeCol * unit.sizeRow - (unit.sizeCol - 1) * (unit.sizeRow - 1);

        if (soldiersRemoved <= 0) continue; // No soldiers removed, skip

        if (soldiersRemoved <= delta) {
          // Perform the reduction
          unit.sizeCol -= 1;
          unit.sizeRow -= 1;
          delta -= soldiersRemoved;
          trimmed = true;
          if (delta <= 0) break;
        }
      }
    }

    if (!trimmed) {
      // If no units can be trimmed proportionally, proceed to single-dimension trimming
      for (const unit of trimmedUnits) {
        // Prefer reducing the dimension that allows for balanced trimming
        if (unit.sizeCol > 1 && unit.sizeRow > 1) {
          // Decide which dimension to reduce based on aspect ratio
          const aspectRatio = unit.sizeCol / unit.sizeRow;
          if (aspectRatio >= 1) {
            // Reduce sizeCol
            unit.sizeCol -= 1;
            delta -= unit.sizeRow;
          } else {
            // Reduce sizeRow
            unit.sizeRow -= 1;
            delta -= unit.sizeCol;
          }
          if (delta <= 0) break;
        } else if (unit.sizeCol > 1 && unit.sizeRow === 1) {
          // Only reduce sizeCol
          unit.sizeCol -= 1;
          delta -= unit.sizeRow;
          if (delta <= 0) break;
        } else if (unit.sizeRow > 1 && unit.sizeCol === 1) {
          // Only reduce sizeRow
          unit.sizeRow -= 1;
          delta -= unit.sizeCol;
          if (delta <= 0) break;
        }
      }
      // If still no trimming was possible, break to prevent infinite loop
      break;
    }
  }

  // Final check: If delta is still >0, continue trimming single dimensions
  if (delta > 0) {
    // Sort units again by area descending
    trimmedUnits.sort((a, b) => b.sizeCol * b.sizeRow - a.sizeCol * a.sizeRow);

    for (const unit of trimmedUnits) {
      while (delta > 0) {
        if (unit.sizeCol > 1 && unit.sizeRow > 1) {
          // Prefer reducing both dimensions
          unit.sizeCol -= 1;
          unit.sizeRow -= 1;
          delta -= unit.sizeCol + unit.sizeRow + 1; // Approximate soldiers removed
        } else if (unit.sizeCol > 1) {
          unit.sizeCol -= 1;
          delta -= unit.sizeRow;
        } else if (unit.sizeRow > 1) {
          unit.sizeRow -= 1;
          delta -= unit.sizeCol;
        } else {
          break; // Cannot trim further
        }

        if (unit.sizeCol < 1 || unit.sizeRow < 1) {
          // Prevent dimensions from being less than 1
          unit.sizeCol = Math.max(unit.sizeCol, 1);
          unit.sizeRow = Math.max(unit.sizeRow, 1);
          break;
        }

        if (delta <= 0) break;
      }
      if (delta <= 0) break;
    }
  }

  return trimmedUnits;
}

/**
 * Counts the total number of soldiers across all units.
 * @param units - Array of Unit objects.
 * @returns The total number of soldiers.
 */
export function countSoldiers(units: Unit[]): number {
  return units.reduce((acc, unit) => acc + unit.sizeCol * unit.sizeRow, 0);
}
