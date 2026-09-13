import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { findCheckout } from './checkout.js';
import { MissingStudioGame, studioToken } from './studio.js';
import { recoverCheckout } from './recover.js';
import type { ApiClient } from './api.js';
import type { PickChoice } from './workshop.js';
import type { CliTelemetry } from './telemetry.js';

export function matchingCheckout(cwd: string, slug: string) {
  const here = findCheckout(resolve(cwd));
  if (here?.slug === slug) return here;
  const child = findCheckout(join(resolve(cwd), slug));
  return child?.slug === slug ? child : null;
}

async function localStudioToken(api: ApiClient, slug: string): Promise<string> {
  const token = await studioToken(api, slug);
  const recovery = await api.request<{ kind: string }>(
    'GET',
    `/api/me/studio/games/${encodeURIComponent(slug)}/recovery`,
  );
  if (['missing', 'canceled', 'archived'].includes(recovery.kind)) throw new MissingStudioGame(slug, recovery.kind);
  return token;
}

export async function resolveLocalGame(input: {
  api: ApiClient;
  slug: string;
  root: string;
  pick?: PickChoice;
  write: (line: string) => void;
  telemetry?: CliTelemetry;
}): Promise<{ token: string; recovered: boolean } | null> {
  const pending = existsSync(join(input.root, '.gamedev-recovery.json'));
  if (!pending) {
    try {
      return { token: await localStudioToken(input.api, input.slug), recovered: false };
    } catch (error) {
      if (
        !(error instanceof MissingStudioGame) ||
        !['missing', 'canceled', 'archived'].includes(error.recoveryKind ?? '')
      )
        throw error;
      if (!input.pick) throw error;
    }
  }
  input.write(`Found your local game: ${input.slug}\nCheckout: ${input.root}`);
  const result = await recoverCheckout({ ...input, cwd: input.root, continueAfter: true });
  return result ? { token: result.token, recovered: true } : null;
}

export async function openCheckoutGame(api: ApiClient, cwd: string) {
  const found = findCheckout(cwd);
  if (!found || existsSync(join(found.root, '.gamedev-recovery.json'))) return null;
  try {
    return { token: await localStudioToken(api, found.slug), ...found };
  } catch {
    return null;
  }
}

export async function replStart(api: ApiClient, cwd: string, slug?: string, explicitToken?: string) {
  if (explicitToken) return { token: explicitToken, slug };
  const local = slug ? matchingCheckout(cwd, slug) : findCheckout(cwd);
  if (local) {
    const opened = await openCheckoutGame(api, local.root);
    return {
      token: opened?.token ?? null,
      checkout: local,
      slug: local.slug,
      initialLine: opened ? undefined : `/checkout ${local.slug}`,
    };
  }
  return {
    token: slug ? await studioToken(api, slug) : null,
    slug,
    initialLine: slug ? `/connect ${slug}` : undefined,
  };
}
