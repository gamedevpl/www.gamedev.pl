import Flatbush from 'flatbush';
import { City, Interceptor, LaunchSite, Missile, Position, Rect, Sector, Unit, WorldState } from './world-state-types';

type IndexType<T> = {
  byRect: (rect: Rect) => T[];
  byRadius: (position: Position, distance: number) => T[];
};

export type IndexedWorldState = WorldState & {
  searchUnit: IndexType<Unit>;
  searchSector: IndexType<Sector>;
  searchCity: IndexType<City>;
  searchLaunchSite: IndexType<LaunchSite>;
  searchMissile: IndexType<Missile>;
  searchInterceptor: IndexType<Interceptor>;
};

export function indexWorldState(worldState: WorldState): IndexedWorldState {
  return {
    ...worldState,
    searchUnit: indexItems(worldState.units),
    searchSector: indexItems(worldState.sectors, 'sectors'),
    searchCity: indexItems(worldState.cities),
    searchLaunchSite: indexItems(worldState.launchSites),
    searchMissile: indexItems(worldState.missiles),
    searchInterceptor: indexItems(worldState.interceptors),
  };
}

const indexCache: Record<string, IndexType<any>> = {};
function indexItems<T extends { position: { x: number; y: number } } | { rect: Rect }>(
  items: T[],
  cacheKey?: string,
): IndexType<T> {
  if (cacheKey && indexCache[cacheKey]) {
    return indexCache[cacheKey];
  }

  const index = items.length === 0 ? undefined : new Flatbush(items.length);
  for (const item of items) {
    if ('rect' in item) {
      index?.add(item.rect.left, item.rect.top, item.rect.right, item.rect.bottom);
    } else if ('position' in item) {
      index?.add(item.position.x, item.position.y, item.position.x, item.position.y);
    }
  }
  index?.finish();

  const result = {
    byRect: (rect: Rect) => index?.search(rect.left, rect.top, rect.right, rect.bottom).map((i) => items[i]) ?? [],
    byRadius: (position: Position, distance: number) =>
      index?.neighbors(position.x, position.y, undefined, distance).map((i) => items[i]) ?? [],
  };

  if (cacheKey) {
    indexCache[cacheKey] = result;
  }

  return result;
}
