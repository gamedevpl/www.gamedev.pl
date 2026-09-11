import type { ApiClient } from '../api.js';

export function activityForRequest(method: string, path: string): string {
  if (path === '/api/cli/chat') return 'Thinking about your request';
  if (path.endsWith('/improve')) return 'Opening an improvement round';
  if (path.endsWith('/handoff')) return 'Connecting your builder';
  if (path.endsWith('/turn')) return 'Preparing your changes';
  if (path.includes('/tree')) return 'Loading game files';
  if (method === 'POST' && path === '/api/submissions') return 'Creating your game';
  if (method === 'GET' && path.startsWith('/api/submissions/')) return 'Checking game status';
  return method === 'GET' ? 'Loading game information' : 'Working with gamedev.pl';
}

export function activityApi(api: ApiClient, update: (activity: string) => void | (() => void)): ApiClient {
  return {
    origin: api.origin,
    async request(method, path, body) {
      const restore = update(activityForRequest(method, path));
      try {
        return await api.request(method, path, body);
      } finally {
        restore?.();
      }
    },
    async requestBytes(path) {
      const restore = update('Downloading game files');
      try {
        return await api.requestBytes(path);
      } finally {
        restore?.();
      }
    },
  };
}
