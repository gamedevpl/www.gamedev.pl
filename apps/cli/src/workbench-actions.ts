import { z } from 'zod';

// Actions enter the shared session queue through fixed, typed domain verbs.
export const WORKBENCH_ACTIONS = {
  play: '/play',
  checkout: '/checkout',
  connect: '/connect',
  share: '/share',
  handle: '/handle',
  update: '/update',
  publish: '/push --publish',
  takeover: '/push --takeover',
  'cancel-round': '/cancel-round',
  'share-draft': '/share-draft',
  'unshare-draft': '/unshare-draft',
  status: '/status',
  diff: '/diff',
  pull: '/pull',
  submit: '/submit',
  push: '/push',
  logs: '/logs',
  agents: '/agents',
  model: '/model',
  kit: '/kit',
  'kit-update': '/kit update',
  'builder-local': '/builder self',
  'builder-platform': '/builder platform',
  retry: '/retry',
  games: '/games',
  quota: '/quota',
  notifications: '/notifications',
  profile: '/profile',
  recover: '/recover',
  verify: '/verify',
  checkpoint: '/checkpoint',
  'restore-checkpoint': '/restore-checkpoint',
  login: '/login',
  'end-session': '/quit',
} as const;
export type WorkbenchAction = keyof typeof WORKBENCH_ACTIONS;
export const workbenchActionSchema = z.enum(Object.keys(WORKBENCH_ACTIONS) as [WorkbenchAction, ...WorkbenchAction[]]);

export function actionLine(action: WorkbenchAction, argument?: string): string {
  const needs = ['checkout', 'connect', 'share', 'handle'].includes(action);
  if (needs && (!argument || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(argument)))
    throw Error('Provide a valid game slug or handle');
  if (!needs && argument) throw Error('This action takes no argument');
  return WORKBENCH_ACTIONS[action] + (argument ? ` ${argument}` : '');
}
