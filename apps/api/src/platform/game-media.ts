// Reads a capture harness `media/metadata.json` into catalog media shape.

// One allowlist answers "which filenames are public" everywhere.

import type { CatalogMedia } from '@gamedevpl/contract';

export function parseGameMedia(metadataJson: string | null): CatalogMedia | null {
  if (!metadataJson) {
    return null;
  }

  try {
    const metadata = JSON.parse(metadataJson) as {
      captures?: Record<string, { file?: unknown }>;
      video?: { file?: unknown };
    };
    const screenshots = Object.entries(metadata.captures ?? {})
      .filter(
        (entry): entry is [string, { file: string }] =>
          /^[a-z0-9][a-z0-9-]*$/.test(entry[0]) &&
          typeof entry[1]?.file === 'string' &&
          /^[a-z0-9][a-z0-9-]*\.png$/.test(entry[1].file),
      )
      .slice(0, 8)
      .map(([name, capture]) => ({ name, file: capture.file }));
    const video =
      typeof metadata.video?.file === 'string' && /^[a-z0-9][a-z0-9-]*\.mp4$/.test(metadata.video.file)
        ? metadata.video.file
        : null;

    return screenshots.length > 0 || video ? { screenshots, video } : null;
  } catch {
    return null;
  }
}
