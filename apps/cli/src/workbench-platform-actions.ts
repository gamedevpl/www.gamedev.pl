import type { ApiClient } from './api.js';
import type { PickChoice } from './workshop.js';

export async function workbenchPlatformAction(input: {
  line: string;
  token: string | null;
  api: ApiClient;
  pick?: PickChoice;
  write: (line: string) => void;
}): Promise<boolean> {
  const path = { '/cancel-round': 'abandon', '/share-draft': 'share', '/unshare-draft': 'share' }[input.line];
  if (!path) return false;
  if (!input.token) throw Error('Open a game first');
  const explanation =
    input.line === '/cancel-round'
      ? 'Cancel this platform round? Used quota is not refunded.'
      : input.line === '/share-draft'
        ? 'Make the approved draft available to anyone with its link?'
        : 'Disable public draft sharing?';
  if (!input.pick || (await input.pick(['Confirm', 'Cancel'], explanation)) !== 'Confirm') return true;
  await input.api.request(
    'POST',
    `/api/submissions/${encodeURIComponent(input.token)}/${path}`,
    path === 'share' ? { shared: input.line === '/share-draft' } : undefined,
  );
  input.write(path === 'abandon' ? 'Platform round canceled. Local sources are preserved.' : 'Draft sharing updated.');
  return true;
}
