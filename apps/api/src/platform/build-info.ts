import { readFileSync } from 'node:fs';

export function readBuildSha(file: string | URL = new URL('../build-sha.txt', import.meta.url)): string | null {
  try {
    const sha = readFileSync(file, 'utf8').trim();
    return /^[0-9a-f]{40}$/i.test(sha) ? sha.toLowerCase() : null;
  } catch {
    return null;
  }
}

export const BUILD_SHA = readBuildSha();
