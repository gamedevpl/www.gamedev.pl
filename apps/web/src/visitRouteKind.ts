import type { VisitRouteKind } from '@gamedevpl/contract';

export function routeKind(view: string): VisitRouteKind {
  switch (view) {
    case 'play':
    case 'join':
    case 'invite':
    case 'legal':
    case 'studio':
    case 'notFound':
      return view;
    case 'studioWelcome':
    case 'studioConnect':
      return 'studio';
    case 'draft':
      return 'play';
    case 'game':
      return 'game';
    case 'create':
      return 'create';
    case 'party':
      return 'party';
    case 'cli':
      return 'cli';
    case 'admin':
      return 'health';
    case 'review':
      return 'health';
    case 'contact':
      return 'legal';
    case 'creator':
      return 'legal';
    default:
      return 'home';
  }
}
