// Creator reference images, mounted beside the kit.
import type { Store, SubmissionRecord } from '../platform/store.js';
import { referenceShotIds } from './inbox-reference-images.js';

const MAX_MOUNTED = 5;

export interface ReferenceArchive {
  name: string;
  type: string;
  bytes: Uint8Array;
}

export interface MountedReferences {
  archives: ReferenceArchive[];
  // Once mounted, the agent holds the file; get_reference_images adds nothing.
  markSeen: () => Promise<void>;
}

export type ReferenceStore = Pick<
  Store,
  'listBuildShots' | 'getBuildShot' | 'listPendingCreatorMessages' | 'markReferenceSeen'
>;

// First build: every image. Later rounds: those pending notes name.
export async function loadReferenceArchives(
  store: ReferenceStore,
  record: SubmissionRecord,
): Promise<MountedReferences> {
  const [pending, shots] = await Promise.all([
    store.listPendingCreatorMessages(record.jobId, { limit: Infinity }),
    store.listBuildShots(record.jobId, { label: 'creator-reference', limit: Infinity }),
  ]);
  const named = new Set(referenceShotIds(pending));
  const firstBuild = !record.deliveredVersion && !record.previewVersion;
  const wanted = shots.filter((shot) => firstBuild || named.has(shot.id)).slice(0, MAX_MOUNTED);
  const loaded = (await Promise.all(wanted.map((shot) => store.getBuildShot(record.jobId, shot.id)))).flatMap((shot) =>
    shot?.data ? [shot] : [],
  );
  const archives = loaded.map((shot, index) => {
    const jpeg = shot.mediaType === 'image/jpeg';
    return {
      name: `reference-${index + 1}.${jpeg ? 'jpg' : 'png'}`,
      type: jpeg ? 'image/jpeg' : 'image/png',
      bytes: Buffer.from(shot.data, 'base64'),
    };
  });
  return {
    archives,
    markSeen: async () => {
      await Promise.all(loaded.map((shot) => store.markReferenceSeen(record.jobId, shot.id)));
    },
  };
}

// Newest first, as get_reference_images orders them.
export function referenceKickoffLines(dir: string, names: readonly string[]): string[] {
  if (!names.length) return [];
  const paths = names.map((name) => `\`${dir}/${name}\``).join(', ');
  return [
    `The creator's reference images are mounted, newest first: ${paths}. \`read\` each before your first edit; they are the look to aim for, not a screenshot to copy. No \`get_reference_images\` call is needed for them.`,
  ];
}
