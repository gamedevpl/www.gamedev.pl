// shape-definitions.ts

import { UnitType } from '../../../../designer/designer-types';

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface Shape {
  points: Point3D[];
  zIndex: number;
}

export interface ShapeSet {
  [key: string]: Shape;
}

const baseShapes: ShapeSet = {
  head: {
    points: [
      { x: -5, y: -15, z: 5 },
      { x: 5, y: -15, z: 5 },
      { x: 5, y: -5, z: 5 },
      { x: -5, y: -5, z: 5 },
    ],
    zIndex: 3,
  },
  body: {
    points: [
      { x: -7, y: -5, z: 0 },
      { x: 7, y: -5, z: 0 },
      { x: 7, y: 10, z: 0 },
      { x: -7, y: 10, z: 0 },
    ],
    zIndex: 2,
  },
  legs: {
    points: [
      { x: -7, y: 10, z: -2 },
      { x: -3, y: 10, z: -2 },
      { x: -3, y: 15, z: -2 },
      { x: -7, y: 15, z: -2 },
      { x: 3, y: 10, z: -2 },
      { x: 7, y: 10, z: -2 },
      { x: 7, y: 15, z: -2 },
      { x: 3, y: 15, z: -2 },
    ],
    zIndex: 1,
  },
};

const baseFallenShapes: ShapeSet = {
  head: {
    points: [
      { x: -5, y: -2, z: 5 },
      { x: 5, y: -2, z: 5 },
      { x: 5, y: 8, z: 5 },
      { x: -5, y: 8, z: 5 },
    ],
    zIndex: 3,
  },
  body: {
    points: [
      { x: -7, y: -10, z: 0 },
      { x: 7, y: -10, z: 0 },
      { x: 7, y: 5, z: 0 },
      { x: -7, y: 5, z: 0 },
    ],
    zIndex: 2,
  },
  legs: {
    points: [
      { x: -7, y: -15, z: -2 },
      { x: -3, y: -15, z: -2 },
      { x: -3, y: -10, z: -2 },
      { x: -7, y: -10, z: -2 },
      { x: 3, y: -15, z: -2 },
      { x: 7, y: -15, z: -2 },
      { x: 7, y: -10, z: -2 },
      { x: 3, y: -10, z: -2 },
    ],
    zIndex: 1,
  },
};

export function defineShapes(unitType: UnitType): ShapeSet {
  switch (unitType) {
    case 'warrior':
      return {
        ...baseShapes,
        sword: {
          points: [
            { x: 8, y: -5, z: 3 },
            { x: 18, y: -10, z: 3 },
            { x: 20, y: -8, z: 3 },
            { x: 10, y: -3, z: 3 },
          ],
          zIndex: 4,
        },
      };
    case 'archer':
      return {
        ...baseShapes,
        bow: {
          points: [
            { x: 8, y: -10, z: 3 },
            { x: 12, y: -8, z: 3 },
            { x: 12, y: 8, z: 3 },
            { x: 8, y: 10, z: 3 },
          ],
          zIndex: 4,
        },
        arrow: {
          points: [
            { x: 12, y: 0, z: 4 },
            { x: 20, y: -2, z: 4 },
            { x: 20, y: 2, z: 4 },
          ],
          zIndex: 5,
        },
      };
    case 'tank':
      return {
        ...baseShapes,
        shield: {
          points: [
            { x: -12, y: -10, z: 5 },
            { x: -8, y: -12, z: 5 },
            { x: -8, y: 12, z: 5 },
            { x: -12, y: 10, z: 5 },
          ],
          zIndex: 4,
        },
      };
    case 'artillery':
      return {
        ...baseShapes,
        cannon: {
          points: [
            { x: 8, y: -3, z: 3 },
            { x: 20, y: -3, z: 3 },
            { x: 20, y: 3, z: 3 },
            { x: 8, y: 3, z: 3 },
          ],
          zIndex: 4,
        },
      };
    default:
      return baseShapes;
  }
}

export function defineFallenShapes(unitType: UnitType): ShapeSet {
  switch (unitType) {
    case 'warrior':
      return {
        ...baseFallenShapes,
        sword: {
          points: [
            { x: 5, y: -8, z: 1 },
            { x: 15, y: -5, z: 1 },
            { x: 15, y: -3, z: 1 },
            { x: 5, y: -6, z: 1 },
          ],
          zIndex: 4,
        },
      };
    case 'archer':
      return {
        ...baseFallenShapes,
        bow: {
          points: [
            { x: 5, y: -10, z: 1 },
            { x: 10, y: -8, z: 1 },
            { x: 10, y: 2, z: 1 },
            { x: 5, y: 4, z: 1 },
          ],
          zIndex: 4,
        },
        arrow: {
          points: [
            { x: 10, y: -2, z: 2 },
            { x: 18, y: -1, z: 2 },
            { x: 18, y: 1, z: 2 },
          ],
          zIndex: 5,
        },
      };
    case 'tank':
      return {
        ...baseFallenShapes,
        shield: {
          points: [
            { x: -10, y: -8, z: 4 },
            { x: -6, y: -9, z: 4 },
            { x: -6, y: 5, z: 4 },
            { x: -10, y: 4, z: 4 },
          ],
          zIndex: 4,
        },
      };
    case 'artillery':
      return {
        ...baseFallenShapes,
        cannon: {
          points: [
            { x: 6, y: -5, z: 2 },
            { x: 16, y: -4, z: 2 },
            { x: 16, y: 2, z: 2 },
            { x: 6, y: 1, z: 2 },
          ],
          zIndex: 4,
        },
      };
    default:
      return baseFallenShapes;
  }
}