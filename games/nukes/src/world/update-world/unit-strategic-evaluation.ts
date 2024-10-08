import { SECTOR_SIZE } from '../world-state-constants';
import { IndexedWorldState } from '../world-state-index';
import { Sector, Unit, LaunchSite, Position, Strategy, State } from '../world-state-types';

export const MAX_UNITS_PER_SECTOR = 2;

export function evaluateStrategicValue(
  sector: Sector,
  unit: Unit,
  allSectors: Sector[],
  worldState: IndexedWorldState,
): number {
  const unitState = worldState.states.find((state) => state.id === unit.stateId);
  if (!unitState || !sector.stateId) {
    return 0; // If we can't find the unit's state, return 0 value
  }

  const sectorStrategy = unitState.strategies[sector.stateId];

  // If the sector belongs to a non-hostile state, return a very low value
  if (sectorStrategy !== Strategy.HOSTILE && sector.stateId !== unit.stateId) {
    return -1000;
  }

  let value = 0;

  // Check if the sector contains a launch site
  const launchSite = findLaunchSiteInSector(sector, worldState);
  if (launchSite) {
    value += 100; // High priority for launch sites
  }

  // Check if the sector is a populated city sector
  if (sector.population > 0) {
    value += 50; // Priority for populated sectors
  }

  // Evaluate connectivity
  const connectedFriendlySectors = countConnectedFriendlySectors(
    sector,
    unit.stateId,
    allSectors,
    unitState.strategies,
  );
  value += connectedFriendlySectors * 10; // Encourage connecting to friendly sectors

  // Evaluate border strength
  const borderStrength = evaluateBorderStrength(sector, unit.stateId, allSectors, unitState.strategies);
  value += borderStrength * 5; // Encourage strengthening borders

  // Evaluate strategic position
  const strategicPosition = evaluateStrategicPosition(sector, unit.stateId, allSectors);
  value += strategicPosition * 20; // High priority for strategically important positions

  // Adjust value based on unit density (including units moving into the sector)
  const totalUnits = countUnitsInSector(sector, worldState) + countUnitsMovingIntoSector(sector, worldState);
  const unitDensity = totalUnits / MAX_UNITS_PER_SECTOR;
  value -= unitDensity * 30; // Discourage overcrowding

  // Adjust value based on the sector's strategy
  switch (sectorStrategy) {
    case Strategy.HOSTILE:
      value *= 1.5; // Increase value for hostile sectors
      break;
    case Strategy.FRIENDLY:
      value *= 0.5; // Decrease value for friendly sectors
      break;
    case Strategy.NEUTRAL:
      value *= 0.25; // Significantly decrease value for neutral sectors
      break;
  }

  // Consider defence lines
  const defenceLineValue = evaluateDefenceLineValue(sector, unitState);
  value += defenceLineValue;

  return value;
}

function countConnectedFriendlySectors(
  sector: Sector,
  stateId: string,
  allSectors: Sector[],
  strategies: Record<string, Strategy>,
): number {
  const adjacentSectors = allSectors.filter(
    (s) =>
      Math.abs(s.position.x - sector.position.x) <= SECTOR_SIZE &&
      Math.abs(s.position.y - sector.position.y) <= SECTOR_SIZE &&
      (s.stateId === stateId || (s.stateId && strategies[s.stateId] === Strategy.FRIENDLY)),
  );
  return adjacentSectors.length;
}

function evaluateBorderStrength(
  sector: Sector,
  stateId: string,
  allSectors: Sector[],
  strategies: Record<string, Strategy>,
): number {
  const adjacentSectors = allSectors.filter(
    (s) =>
      Math.abs(s.position.x - sector.position.x) <= SECTOR_SIZE &&
      Math.abs(s.position.y - sector.position.y) <= SECTOR_SIZE,
  );
  const friendlySectors = adjacentSectors.filter(
    (s) => s.stateId === stateId || (s.stateId && strategies[s.stateId] === Strategy.FRIENDLY),
  );
  return friendlySectors.length / adjacentSectors.length;
}

function evaluateStrategicPosition(sector: Sector, stateId: string, allSectors: Sector[]): number {
  const friendlySectors = allSectors.filter((s) => s.stateId === stateId);
  const centerX = friendlySectors.reduce((sum, s) => sum + s.position.x, 0) / friendlySectors.length;
  const centerY = friendlySectors.reduce((sum, s) => sum + s.position.y, 0) / friendlySectors.length;

  const distanceToCenter = Math.sqrt((sector.position.x - centerX) ** 2 + (sector.position.y - centerY) ** 2);

  // Normalize the distance (0 to 1, where 1 is the furthest from the center)
  const maxDistance = Math.sqrt(SECTOR_SIZE * SECTOR_SIZE * 2) * Math.sqrt(allSectors.length);
  const normalizedDistance = distanceToCenter / maxDistance;

  // Invert the value so that sectors closer to the center have higher value
  return 1 - normalizedDistance;
}

function findLaunchSiteInSector(sector: Sector, worldState: IndexedWorldState): LaunchSite | undefined {
  return worldState.searchLaunchSite.byRect(sector.rect).filter((site) => site.stateId !== sector.stateId)[0];
}

export function countUnitsInSector(sector: Sector, worldState: IndexedWorldState): number {
  return worldState.searchUnit.byRect(sector.rect).length;
}

export function countUnitsMovingIntoSector(sector: Sector, worldState: IndexedWorldState): number {
  return worldState.units.filter(
    (unit) => unit.order.type === 'move' && isPositionInSector(unit.order.targetPosition, sector),
  ).length;
}

function isPositionInSector(position: Position, sector: Sector): boolean {
  return (
    position.x >= sector.rect.left &&
    position.x <= sector.rect.right &&
    position.y >= sector.rect.top &&
    position.y <= sector.rect.bottom
  );
}

function evaluateDefenceLineValue(sector: Sector, state: State): number {
  const currentDefenceLine = state.defenceLines[state.currentDefenceLineIndex];
  if (currentDefenceLine.sectors.includes(sector)) {
    return 50; // High value for sectors in the current defence line
  }

  // Check if the sector is in any of the defence lines
  for (let i = 0; i < state.defenceLines.length; i++) {
    if (state.defenceLines[i].sectors.includes(sector)) {
      // Higher value for sectors in earlier defence lines
      return 30 * (state.defenceLines.length - i);
    }
  }

  return 0; // No additional value if not in any defence line
}
