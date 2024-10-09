import Flatbush from 'flatbush';
import { GameObject } from './objects/game-object';
import { GameWorld } from './game-world';
import { Vec } from '../util/vmath';
import { SoldierObject } from './objects/object-soldier';
import { ArrowObject } from './objects/object-arrow';

type Rect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

type IndexType<T> = {
  byRect: (rect: Rect) => T[];
  byRadius: (position: Vec, distance: number) => T[];

  byProperty: (propertyName: string, propertyValue: unknown) => T[];
  resetPropertyCache: () => void;
};

export type IndexedGameWorld = {
  searchSoldiers: IndexType<SoldierObject>;
  searchArrows: IndexType<ArrowObject>;
};

export function indexGameWorld(world: GameWorld): IndexedGameWorld {
  return {
    searchSoldiers: indexItems(world.queryObjects<SoldierObject>('Soldier')),
    searchArrows: indexItems(world.queryObjects<ArrowObject>('Arrow').filter((arrow) => arrow.isHit())),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const indexCache: Record<string, IndexType<any>> = {};
function indexItems<T extends GameObject>(items: T[], cacheKey?: string): IndexType<T> {
  if (cacheKey && indexCache[cacheKey]) {
    return indexCache[cacheKey];
  }

  items = [...items];

  const index = items.length === 0 ? undefined : new Flatbush(items.length);
  for (const item of items) {
    index?.add(item.vec[0], item.vec[1], item.vec[0], item.vec[1]);
  }
  index?.finish();

  const propertyCache = new Map();

  const result = {
    byRect: (rect: Rect) => index?.search(rect.left, rect.top, rect.right, rect.bottom).map((i) => items[i]) ?? [],
    byRadius: (position: Vec, distance: number) =>
      index?.neighbors(position[0], position[1], undefined, distance).map((i) => items[i]) ?? [],
    byProperty: (propertyName: string, propertyValue: unknown) => {
      if (!propertyCache.has(propertyName)) {
        const valueMap = propertyCache.set(propertyName, new Map()).get(propertyName);
        items.forEach((item) => {
          if (propertyName in item) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const value = (item as unknown as any)[propertyName];
            if (!valueMap.has(value)) {
              valueMap.set(value, []);
            }
            valueMap.get(value).push(item);
          }
        });
      }

      return propertyCache.get(propertyName).get(propertyValue) ?? [];
    },
    resetPropertyCache: () => {
      propertyCache.clear();
    },
  };

  if (cacheKey) {
    indexCache[cacheKey] = result;
  }

  return result;
}
