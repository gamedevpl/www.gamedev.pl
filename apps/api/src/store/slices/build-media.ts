import type { Firestore } from '@google-cloud/firestore';
import { randomUUID } from 'node:crypto';
import type { BuildShot, BuildShotSummary, BuildPreview, BuildPreviewSummary } from '../records/build-log.js';
import { byNewestFirst } from './build-log.js';

export interface BuildShotCountOptions {
  // Platform-written captions to leave out of agent-facing counts.
  excludeLabels?: readonly string[];
  // Leaves out what the platform drew, whatever caption it carries.
  excludePlatformDrawn?: boolean;
}

export interface BuildShotListOptions extends BuildShotCountOptions {
  limit?: number;
}

// Narrows a count to one delivery's frames in one round.
export interface DeliveryShotQuery {
  label: string;
  deliveryVersion: string;
  roundGeneration: number;
}

function matchesDelivery(query: DeliveryShotQuery) {
  return (shot: { label?: string; deliveryVersion?: string; roundGeneration?: number; platformDrawn?: true }) =>
    !shot.platformDrawn &&
    shot.label === query.label &&
    shot.deliveryVersion === query.deliveryVersion &&
    shot.roundGeneration === query.roundGeneration;
}

function keeps(excludeLabels: readonly string[] | undefined) {
  return (shot: { label?: string }) => !excludeLabels?.includes(shot.label ?? '');
}

export interface BuildMediaStore {
  // Stores a screenshot the agent pushed straight to us, before any commit.
  appendBuildShot(
    jobId: number,
    shot: Omit<BuildShot, 'id' | 'createdAt'> & { createdAt?: string },
  ): Promise<BuildShot>;

  // A build's pushed screenshots, newest first; bytes omitted here.
  listBuildShots(jobId: number, opts?: BuildShotListOptions): Promise<BuildShotSummary[]>;

  // One pushed screenshot, bytes included -- the read behind serving it.
  getBuildShot(jobId: number, id: string): Promise<BuildShot | null>;

  // How many screenshots a build has pushed -- bounds a runaway agent.
  countBuildShots(jobId: number, opts?: BuildShotCountOptions): Promise<number>;

  // Frames a delivery already holds; their room is already spent.
  countDeliveryShots(jobId: number, query: DeliveryShotQuery): Promise<number>;

  appendBuildPreview(
    jobId: number,
    preview: Omit<BuildPreview, 'id' | 'createdAt'> & { createdAt?: string },
  ): Promise<BuildPreview>;

  listBuildPreviews(jobId: number, opts?: { limit?: number }): Promise<BuildPreviewSummary[]>;

  getBuildPreview(jobId: number, id: string): Promise<BuildPreview | null>;

  countBuildPreviews(jobId: number): Promise<number>;

  // Drops all but the newest `keep` previews, returning how many were removed.
  pruneBuildPreviews(jobId: number, keep: number): Promise<number>;
}

export class InMemoryBuildMediaStore implements BuildMediaStore {
  private buildShots = new Map<number, BuildShot[]>();
  private buildPreviews = new Map<number, BuildPreview[]>();

  async appendBuildShot(
    jobId: number,
    shot: Omit<BuildShot, 'id' | 'createdAt'> & { createdAt?: string },
  ): Promise<BuildShot> {
    const record: BuildShot = { ...shot, id: randomUUID(), createdAt: shot.createdAt ?? new Date().toISOString() };
    const existing = this.buildShots.get(jobId) ?? [];
    existing.push(record);
    this.buildShots.set(jobId, existing);
    return { ...record };
  }

  async listBuildShots(jobId: number, opts?: BuildShotListOptions): Promise<BuildShotSummary[]> {
    return [...(this.buildShots.get(jobId) ?? [])]
      .filter(keeps(opts?.excludeLabels))
      .sort(byNewestFirst)
      .slice(0, opts?.limit ?? 12)
      .map(({ data: _data, ...summary }) => ({ ...summary }));
  }

  async getBuildShot(jobId: number, id: string): Promise<BuildShot | null> {
    const found = this.buildShots.get(jobId)?.find((shot) => shot.id === id);
    return found ? { ...found } : null;
  }

  async countBuildShots(jobId: number, opts?: BuildShotCountOptions): Promise<number> {
    return (this.buildShots.get(jobId) ?? [])
      .filter(keeps(opts?.excludeLabels))
      .filter((shot) => !(opts?.excludePlatformDrawn && shot.platformDrawn)).length;
  }

  async countDeliveryShots(jobId: number, query: DeliveryShotQuery): Promise<number> {
    return (this.buildShots.get(jobId) ?? []).filter(matchesDelivery(query)).length;
  }

  async appendBuildPreview(
    jobId: number,
    preview: Omit<BuildPreview, 'id' | 'createdAt'> & { createdAt?: string },
  ): Promise<BuildPreview> {
    const existing = this.buildPreviews.get(jobId) ?? [];
    // Same-millisecond pushes get bumped, so "newest" matches append order.
    const nowIso = new Date().toISOString();
    // Newest by value, not position -- a pruned array ends oldest.
    const newestCreatedAt = existing.reduce<string | undefined>(
      (newest, entry) => (newest === undefined || entry.createdAt > newest ? entry.createdAt : newest),
      undefined,
    );
    const createdAt =
      preview.createdAt ??
      (newestCreatedAt && newestCreatedAt >= nowIso ? new Date(Date.parse(newestCreatedAt) + 1).toISOString() : nowIso);
    const record: BuildPreview = {
      ...preview,
      id: randomUUID(),
      createdAt,
    };
    existing.push(record);
    this.buildPreviews.set(jobId, existing);
    return { ...record };
  }

  async listBuildPreviews(jobId: number, opts?: { limit?: number }): Promise<BuildPreviewSummary[]> {
    return [...(this.buildPreviews.get(jobId) ?? [])]
      .sort(byNewestFirst)
      .slice(0, opts?.limit ?? 4)
      .map(({ data: _data, ...summary }) => ({ ...summary }));
  }

  async getBuildPreview(jobId: number, id: string): Promise<BuildPreview | null> {
    const found = this.buildPreviews.get(jobId)?.find((preview) => preview.id === id);
    return found ? { ...found } : null;
  }

  async countBuildPreviews(jobId: number): Promise<number> {
    return this.buildPreviews.get(jobId)?.length ?? 0;
  }

  async pruneBuildPreviews(jobId: number, keep: number): Promise<number> {
    const existing = this.buildPreviews.get(jobId) ?? [];
    if (existing.length <= keep) return 0;
    const kept = [...existing].sort(byNewestFirst).slice(0, keep);
    this.buildPreviews.set(jobId, kept);
    return existing.length - kept.length;
  }
}

export class FirestoreBuildMediaStore implements BuildMediaStore {
  constructor(private db: Firestore) {}

  private shotsCollection(jobId: number) {
    return this.db.collection('submissions').doc(String(jobId)).collection('shots');
  }

  private previewsCollection(jobId: number) {
    return this.db.collection('submissions').doc(String(jobId)).collection('previews');
  }

  async appendBuildShot(
    jobId: number,
    shot: Omit<BuildShot, 'id' | 'createdAt'> & { createdAt?: string },
  ): Promise<BuildShot> {
    const record: BuildShot = { ...shot, id: randomUUID(), createdAt: shot.createdAt ?? new Date().toISOString() };
    const document = Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
    await this.shotsCollection(jobId).doc(record.id).set(document);
    return record;
  }

  async listBuildShots(jobId: number, opts?: BuildShotListOptions): Promise<BuildShotSummary[]> {
    const limit = opts?.limit ?? 12;
    // Over-fetch by the excluded count; the window keeps `limit` shots.
    const excluded = await this.countLabeled(jobId, opts?.excludeLabels);
    // `select()` keeps bytes off the polled status response.
    const snap = await this.shotsCollection(jobId)
      .select('id', 'label', 'labelLocalized', 'locale', 'mediaType', 'createdAt')
      .orderBy('createdAt', 'desc')
      .limit(limit + excluded)
      .get();
    return snap.docs
      .map((doc) => doc.data() as BuildShotSummary)
      .filter(keeps(opts?.excludeLabels))
      .sort(byNewestFirst)
      .slice(0, limit);
  }

  // `in` matches only labelled documents; unlabelled shots stay out.
  private async countLabeled(jobId: number, labels: readonly string[] | undefined): Promise<number> {
    if (!labels || labels.length === 0) return 0;
    const snap = await this.shotsCollection(jobId)
      .where('label', 'in', [...labels])
      .count()
      .get();
    return snap.data().count;
  }

  async getBuildShot(jobId: number, id: string): Promise<BuildShot | null> {
    const doc = await this.shotsCollection(jobId).doc(id).get();
    return doc.exists ? (doc.data() as BuildShot) : null;
  }

  private async countPlatformDrawn(jobId: number): Promise<number> {
    const snap = await this.shotsCollection(jobId).where('platformDrawn', '==', true).count().get();
    return snap.data().count;
  }

  async countBuildShots(jobId: number, opts?: BuildShotCountOptions): Promise<number> {
    const snap = await this.shotsCollection(jobId).count().get();
    const drawn = opts?.excludePlatformDrawn ? await this.countPlatformDrawn(jobId) : 0;
    return snap.data().count - (await this.countLabeled(jobId, opts?.excludeLabels)) - drawn;
  }

  async countDeliveryShots(jobId: number, query: DeliveryShotQuery): Promise<number> {
    // One equality field, so no composite index is needed.
    const snap = await this.shotsCollection(jobId)
      .where('deliveryVersion', '==', query.deliveryVersion)
      // Every field the predicate reads: an unselected one comes back undefined.
      .select('deliveryVersion', 'label', 'roundGeneration', 'platformDrawn')
      .get();
    return snap.docs.map((doc) => doc.data() as BuildShotSummary).filter(matchesDelivery(query)).length;
  }

  async appendBuildPreview(
    jobId: number,
    preview: Omit<BuildPreview, 'id' | 'createdAt'> & { createdAt?: string },
  ): Promise<BuildPreview> {
    const record: BuildPreview = {
      ...preview,
      id: randomUUID(),
      createdAt: preview.createdAt ?? new Date().toISOString(),
    };
    const document = Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
    await this.previewsCollection(jobId).doc(record.id).set(document);
    return record;
  }

  async listBuildPreviews(jobId: number, opts?: { limit?: number }): Promise<BuildPreviewSummary[]> {
    // `select()` matters more here -- a preview doc runs a few hundred KB.
    const snap = await this.previewsCollection(jobId)
      .select('id', 'slug', 'label', 'labelLocalized', 'locale', 'origin', 'createdAt')
      .orderBy('createdAt', 'desc')
      .limit(opts?.limit ?? 4)
      .get();
    return snap.docs.map((doc) => doc.data() as BuildPreviewSummary).sort(byNewestFirst);
  }

  async getBuildPreview(jobId: number, id: string): Promise<BuildPreview | null> {
    const doc = await this.previewsCollection(jobId).doc(id).get();
    return doc.exists ? (doc.data() as BuildPreview) : null;
  }

  async countBuildPreviews(jobId: number): Promise<number> {
    const snap = await this.previewsCollection(jobId).count().get();
    return snap.data().count;
  }

  async pruneBuildPreviews(jobId: number, keep: number): Promise<number> {
    // Trimmed on write, not by a retention job; ids only, skips bytes.
    const snap = await this.previewsCollection(jobId).select('createdAt').orderBy('createdAt', 'desc').get();
    const stale = snap.docs.slice(keep);
    if (!stale.length) return 0;
    // Chunked -- a Firestore batch caps at 500 ops.
    const BATCH_LIMIT = 500;
    for (let start = 0; start < stale.length; start += BATCH_LIMIT) {
      const batch = this.db.batch();
      for (const doc of stale.slice(start, start + BATCH_LIMIT)) batch.delete(doc.ref);
      await batch.commit();
    }
    return stale.length;
  }
}
