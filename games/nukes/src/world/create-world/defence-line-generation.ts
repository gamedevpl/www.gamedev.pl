import { distance } from '../../math/position-utils';
import { CITY_RADIUS, SECTOR_SIZE } from '../world-state-constants';
import { IndexedWorldState } from '../world-state-index';
import { DefenceLine, Position, Sector, State } from '../world-state-types';
import { findBorderSectors } from '../world-state-utils';

export function createDefenceLines(state: State, worldState: IndexedWorldState): DefenceLine[] {
  const borderSectors = findBorderSectors(worldState.sectors, state);
  const borderOutline = sortOutline(borderSectors);

  const defenceLines: DefenceLine[] = [];

  // First defence line: border sectors
  defenceLines.push({
    id: `${state.id}_border`,
    sectors: borderOutline,
    isBreach: false,
  });

  // Second defence line: shrink towards cities and launch sites
  const innerSectors = shrinkTowardsStrategicPoints(worldState, state.id);
  defenceLines.push({
    id: `${state.id}_inner`,
    sectors: innerSectors,
    isBreach: false,
  });

  // Final defence line: sectors surrounding cities and launch sites
  const finalDefenceSectors = getSectorsAroundStrategicPoints(worldState, state.id);
  defenceLines.push({
    id: `${state.id}_final`,
    sectors: finalDefenceSectors,
    isBreach: false,
  });

  return defenceLines;
}

function shrinkTowardsStrategicPoints(worldState: IndexedWorldState, stateId: string): Sector[] {
  // This is a simplified implementation. A more sophisticated algorithm would be needed for actual shrinking.
  return [
    ...worldState.searchCity
      .byProperty('stateId', stateId)
      .map((city) => calculateOutline(worldState.searchSector.byRadius(city.position, CITY_RADIUS * 2)))
      .flat(),
    ...worldState.searchLaunchSite
      .byProperty('stateId', stateId)
      .map((launchSite) => calculateOutline(worldState.searchSector.byRadius(launchSite.position, SECTOR_SIZE * 6)))
      .flat(),
  ];
}

function getSectorsAroundStrategicPoints(worldState: IndexedWorldState, stateId: string): Sector[] {
  return [
    ...worldState.searchCity
      .byProperty('stateId', stateId)
      .map((city) => calculateOutline(worldState.searchSector.byProperty('cityId', city.id)))
      .flat(),
    ...worldState.searchLaunchSite
      .byProperty('stateId', stateId)
      .map((launchSite) => calculateOutline(worldState.searchSector.byRadius(launchSite.position, SECTOR_SIZE * 3)))
      .flat(),
  ];
}

function sortOutline(sectors: Sector[]): Sector[] {
  if (sectors.length < 3) return sectors;

  // Find the leftmost point
  const sortedSectors = [sectors.shift()!];

  while (sectors.length) {
    let closestPointIndex = 0;
    let minDistance = Infinity;

    // Find the closest point to the last point in sortedPoints
    for (let i = 0; i < sectors.length; i++) {
      const dist = distance(
        sortedSectors[sortedSectors.length - 1]!.position.x,
        sortedSectors[sortedSectors.length - 1]!.position.y,
        sectors[i].position.x,
        sectors[i].position.y,
      );
      if (dist < minDistance) {
        minDistance = dist;
        closestPointIndex = i;
      }
    }

    // Add the closest point to the sortedPoints and remove it from points
    sortedSectors.push(sectors.splice(closestPointIndex, 1)[0]!);
  }

  return sortedSectors;
}

function calculateOutline(sectors: Sector[]): Sector[] {
  if (sectors.length < 3) return sectors;

  // Find the leftmost point
  const leftmost = sectors.reduce((min, p) => (p.position.y < min.position.y ? p : min), sectors[0]);

  // Sort points by polar angle with respect to the leftmost point
  const sortedSectors = sectors.sort((a, b) => {
    const angleA = Math.atan2(a.position.y - leftmost.position.y, a.position.x - leftmost.position.x);
    const angleB = Math.atan2(b.position.y - leftmost.position.y, b.position.x - leftmost.position.x);
    return angleA - angleB;
  });

  // Graham scan algorithm to find convex hull
  const hull: Sector[] = [sortedSectors[0], sortedSectors[1]];

  for (let i = 2; i < sortedSectors.length; i++) {
    while (
      hull.length > 1 &&
      !isLeftTurn(hull[hull.length - 2].position, hull[hull.length - 1].position, sortedSectors[i].position)
    ) {
      hull.pop();
    }
    hull.push(sortedSectors[i]);
  }

  return hull;
}

function isLeftTurn(a: Position, b: Position, c: Position): boolean {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) > 0;
}
