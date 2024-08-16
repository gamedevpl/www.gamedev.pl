import { IndexedWorldState } from '../world-state-index';
import { State, Sector, Unit, DefenceLine, Position } from '../world-state-types';

export function evaluateDefenceLineStatus(
  state: State,
  defenceLine: DefenceLine,
  worldState: IndexedWorldState,
): boolean {
  const totalSectors = defenceLine.sectors.length;
  const occupiedSectors = defenceLine.sectors.filter((sector) => {
    const unitsInSector = worldState.searchUnit.byRect(sector.rect);
    return (
      sector.stateId !== state.id ||
      unitsInSector.filter((unit) => unit.stateId !== sector.stateId).reduce((r, unit) => r + unit.quantity, 0) >
        unitsInSector.filter((unit) => unit.stateId === sector.stateId).reduce((r, unit) => r + unit.quantity, 0)
    );
  }).length;

  // Consider the defence line breached if more than 25% of its sectors are occupied by enemy units
  return occupiedSectors / totalSectors > 0.25;
}

export function relocateUnitsToNextDefenceLine(state: State, worldState: IndexedWorldState): void {
  const currentDefenceLine = state.defenceLines[state.currentDefenceLineIndex];
  const unitsToRelocate = worldState.units.filter(
    (unit) => unit.stateId === state.id && !isUnitInDefenceLine(unit, currentDefenceLine),
  );

  // Distribute units equally among defence line sectors
  const sectorsCount = currentDefenceLine.sectors.length;
  const unitsPerSector = Math.ceil(unitsToRelocate.length / sectorsCount);

  for (let i = 0; i < unitsToRelocate.length; i++) {
    const unit = unitsToRelocate[i];
    const sectorIndex = Math.floor(i / unitsPerSector);
    const targetSector = currentDefenceLine.sectors[sectorIndex % sectorsCount];

    unit.order = {
      type: 'move',
      isFallback: true,
      targetPosition: getSectorCenter(targetSector),
    };
  }
}

export function recoverPreviousDefenceLine(state: State, worldState: IndexedWorldState): void {
  if (state.currentDefenceLineIndex === 0) {
    return; // No previous defence line to recover
  }

  const currentDefenceLine = state.defenceLines[state.currentDefenceLineIndex];
  const previousDefenceLine = state.defenceLines[state.currentDefenceLineIndex - 1];

  // Check if units have reached the previous defence line
  const unitsInPreviousLine = worldState.units.filter(
    (unit) => unit.stateId === state.id && isUnitInDefenceLine(unit, previousDefenceLine),
  );

  if (unitsInPreviousLine.length > 0) {
    // Mark the previous defence line as non-breached
    previousDefenceLine.isBreach = false;

    // Move all units from current to previous defence line
    const unitsToRelocate = worldState.units.filter(
      (unit) => unit.stateId === state.id && isUnitInDefenceLine(unit, currentDefenceLine),
    );

    relocateUnitsToPreviousDefenceLine(unitsToRelocate, previousDefenceLine);

    // Update the current defence line index
    state.currentDefenceLineIndex--;
  } else {
    // Move units towards the previous defence line
    const unitsToMove = worldState.units.filter(
      (unit) => unit.stateId === state.id && isUnitInDefenceLine(unit, currentDefenceLine),
    );

    moveUnitsTowardsPreviousDefenceLine(unitsToMove, previousDefenceLine);
  }
}

function relocateUnitsToPreviousDefenceLine(units: Unit[], defenceLine: DefenceLine): void {
  const sectorsCount = defenceLine.sectors.length;
  const unitsPerSector = Math.ceil(units.length / sectorsCount);

  for (let i = 0; i < units.length; i++) {
    const unit = units[i];
    const sectorIndex = Math.floor(i / unitsPerSector);
    const targetSector = defenceLine.sectors[sectorIndex % sectorsCount];

    unit.order = {
      type: 'move',
      isFallback: false,
      targetPosition: getSectorCenter(targetSector),
    };
  }
}

function moveUnitsTowardsPreviousDefenceLine(units: Unit[], previousDefenceLine: DefenceLine): void {
  for (const unit of units) {
    const nearestSector = findNearestDefenceLineSector(unit, previousDefenceLine.sectors);
    if (nearestSector) {
      unit.order = {
        type: 'move',
        isFallback: false,
        targetPosition: getSectorCenter(nearestSector),
      };
    }
  }
}

export function updateDefenceLines(state: State, worldState: IndexedWorldState): void {
  // Evaluate current defence line status
  const currentDefenceLine = state.defenceLines[state.currentDefenceLineIndex];
  const isCurrentLineBreach = evaluateDefenceLineStatus(state, currentDefenceLine, worldState);

  if (isCurrentLineBreach) {
    currentDefenceLine.isBreach = true;
    if (state.currentDefenceLineIndex < state.defenceLines.length - 1) {
      state.currentDefenceLineIndex++;
      relocateUnitsToNextDefenceLine(state, worldState);
    }
  } else {
    recoverPreviousDefenceLine(state, worldState);
  }

  // Update last evaluation timestamp
  state.lastDefenceEvaluationTimestamp = worldState.timestamp;
}

function isUnitInDefenceLine(unit: Unit, defenceLine: DefenceLine): boolean {
  return defenceLine.sectors.some(
    (sector) =>
      unit.position.x >= sector.rect.left &&
      unit.position.x <= sector.rect.right &&
      unit.position.y >= sector.rect.top &&
      unit.position.y <= sector.rect.bottom,
  );
}

function findNearestDefenceLineSector(unit: Unit, defenceLineSectors: Sector[]): Sector | undefined {
  let nearestSector: Sector | undefined;
  let shortestDistance = Infinity;

  for (const sector of defenceLineSectors) {
    const sectorCenter = getSectorCenter(sector);
    const distance = getDistance(unit.position, sectorCenter);

    if (distance < shortestDistance) {
      shortestDistance = distance;
      nearestSector = sector;
    }
  }

  return nearestSector;
}

function getSectorCenter(sector: Sector): Position {
  return {
    x: (sector.rect.left + sector.rect.right) / 2,
    y: (sector.rect.top + sector.rect.bottom) / 2,
  };
}

function getDistance(pos1: Position, pos2: Position): number {
  return Math.sqrt(Math.pow(pos1.x - pos2.x, 2) + Math.pow(pos1.y - pos2.y, 2));
}
