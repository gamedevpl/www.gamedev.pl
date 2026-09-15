import type { GamesStore } from '../delivery/games-store.js';
import type { Store } from '../platform/store.js';

export async function loadJobPreview(
  store: Store,
  gamesStore: GamesStore,
  jobIdParam: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const jobId = Number(jobIdParam);
  if (!Number.isInteger(jobId)) return { status: 400, body: { error: 'invalid_job' } };

  const record = await store.getSubmission(jobId);
  if (!record) return { status: 404, body: { error: 'not_found' } };
  const { slug } = record;
  const playableVersion = record.previewVersion ?? record.deliveredVersion;
  if (!slug || !playableVersion) {
    return { status: 409, body: { error: 'no_preview_available' } };
  }

  let bundle = await gamesStore.getDerivedArtifact(slug, playableVersion, 'bundle.html');
  bundle ??= await gamesStore.getDerivedArtifact(slug, playableVersion, 'preview.html');
  if (!bundle) return { status: 404, body: { error: 'bundle_not_found' } };

  return {
    status: 200,
    body: { slug, title: record.title || slug, version: playableVersion, html: bundle.toString('utf8') },
  };
}
