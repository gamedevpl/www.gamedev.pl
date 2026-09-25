import type { SharePlatform, ShareRequest, ShareResult } from '../types.js';

// Extracted from ShareGameButton: OS share sheet first, clipboard as the honest fallback.
async function shareOrCopy({ url, title }: ShareRequest): Promise<ShareResult> {
  const canShare =
    typeof navigator.share === 'function' && (!navigator.canShare || navigator.canShare({ url, title, text: title }));

  if (canShare) {
    try {
      await navigator.share({ title, text: title, url });
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
}

export const webShare: SharePlatform = { shareOrCopy };
