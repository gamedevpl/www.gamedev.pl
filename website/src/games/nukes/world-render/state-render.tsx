import React from 'react';
import styled from 'styled-components';
import { State, City, LaunchSite, Position } from '../world/world-state-types';
import { CITY_RADIUS } from '../world/world-state-constants';

interface StateRenderProps {
  state: State;
  cities: City[];
  launchSites: LaunchSite[];
}

const OUTLINE_PADDING = CITY_RADIUS;

export function StateRender({ state, cities, launchSites }: StateRenderProps) {
  const { boundingBox } = React.useMemo(() => {
    const statePoints = [
      ...cities.filter((city) => city.stateId === state.id && city.population > 0).map((city) => city.position),
      ...launchSites.filter((site) => site.stateId === state.id).map((site) => site.position),
    ]
      .map(({ x, y }) => [
        { x, y },
        { x: x + OUTLINE_PADDING, y },
        { x, y: y + OUTLINE_PADDING },
        { x: x - OUTLINE_PADDING, y },
        { x, y: y - OUTLINE_PADDING },
      ])
      .flat();
    const outlinePoints = calculateStateOutline(statePoints);
    const boundingBox = calculateBoundingBox(outlinePoints);
    const pathData: string =
      outlinePoints
        .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x - boundingBox.minX} ${point.y - boundingBox.minY}`)
        .join(' ') + 'Z';
    return { boundingBox, pathData };
  }, [state, cities, launchSites]);

  return (
    <>
      <StateTitle
        style={{
          transform: `translate(${(boundingBox.maxX + boundingBox.minX) / 2}px, ${boundingBox.minY}px) translateX(-50%) translateY(-150%)`,
          color: state.color,
        }}
      >
        {state.name}
      </StateTitle>
    </>
  );
}

const StateTitle = styled.div`
  position: absolute;
  color: white;
  text-shadow: 2px 2px 0px white;
  pointer-events: none;
  font-size: x-large;
`;

function calculateStateOutline(points: Position[]): Position[] {
  if (points.length < 3) return points;

  // Find the leftmost point
  const leftmost = points.reduce((min, p) => (p.y < min.y ? p : min), points[0]);

  // Sort points by polar angle with respect to the leftmost point
  const sortedPoints = points.sort((a, b) => {
    const angleA = Math.atan2(a.y - leftmost.y, a.x - leftmost.x);
    const angleB = Math.atan2(b.y - leftmost.y, b.x - leftmost.x);
    return angleA - angleB;
  });

  // Graham scan algorithm to find convex hull
  const hull: Position[] = [sortedPoints[0], sortedPoints[1]];

  for (let i = 2; i < sortedPoints.length; i++) {
    while (hull.length > 1 && !isLeftTurn(hull[hull.length - 2], hull[hull.length - 1], sortedPoints[i])) {
      hull.pop();
    }
    hull.push(sortedPoints[i]);
  }

  return hull;
}

function isLeftTurn(a: Position, b: Position, c: Position): boolean {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) > 0;
}

function calculateBoundingBox(points: Position[]): { minX: number; minY: number; maxX: number; maxY: number } {
  const bbox = points.reduce(
    (acc, point) => ({
      minX: Math.min(acc.minX, point.x),
      minY: Math.min(acc.minY, point.y),
      maxX: Math.max(acc.maxX, point.x),
      maxY: Math.max(acc.maxY, point.y),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
  return bbox;
}
