export type CliSessionContext = {
  token?: string;
  checkoutSlug?: string;
  agents: string[];
};

export type CliAction = { name: 'play'; slug: string } | { name: 'status' } | { name: 'edit'; request: string };

export function isCliAction(value: unknown): value is CliAction {
  if (!value || typeof value !== 'object') return false;
  const action = value as Record<string, unknown>;
  if (action.name === 'play') {
    return (
      Object.keys(action).length === 2 &&
      typeof action.slug === 'string' &&
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(action.slug) &&
      action.slug.length <= 100
    );
  }
  if (action.name === 'edit')
    return (
      Object.keys(action).length === 2 &&
      typeof action.request === 'string' &&
      action.request.trim().length > 0 &&
      action.request.length <= 2000
    );
  return Object.keys(action).length === 1 && action.name === 'status';
}
