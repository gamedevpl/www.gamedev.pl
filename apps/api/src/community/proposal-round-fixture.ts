import type { GamesStore, SourceFile, VersionManifest } from '../delivery/games-store.js';

// Test fixtures for accepted-proposal rounds: EditorKit files and a games store.

export function editorJson(dogScale: number, label = 'Dog size', tagline = 'go!'): string {
  return `${JSON.stringify(
    {
      version: 1,
      params: {
        dogScale: { type: 'number', min: 0.5, max: 3, default: dogScale, label: { en: label, pl: 'Pies' } },
        tagline: { type: 'text', max: 40, default: tagline, label: { en: 'Tagline', pl: 'Hasło' } },
      },
      content: {},
    },
    null,
    2,
  )}\n`;
}

export function gameFiles(overrides: Record<string, string> = {}): SourceFile[] {
  const files: Record<string, string> = {
    'SPEC.md': '---\ntitle: Dog\n---\nA dog.',
    'game.ts': 'export const grip = 0.5;\nexport const boost = 1;\n',
    'EDITOR.json': editorJson(1),
    'game/editor-content.ts': '// generated\n',
    ...overrides,
  };
  return Object.entries(files).map(([path, content]) => ({ path, content }));
}

// A games store that keeps whole versions in memory.
export function memoryGamesStore() {
  const versions = new Map<string, { manifest: VersionManifest; files: SourceFile[] }>();
  let counter = 0;
  const key = (slug: string, version: string) => `${slug}@${version}`;
  const put = (slug: string, version: string, files: SourceFile[], extra: Partial<VersionManifest> = {}) => {
    const manifest = {
      slug,
      version,
      createdAt: '2026-08-04T12:00:00.000Z',
      jobId: 0,
      deliveryMode: 'publish',
      sourceFiles: files.map((file) => file.path),
      ...extra,
    } as VersionManifest;
    versions.set(key(slug, version), { manifest, files });
    return manifest;
  };
  const store = {
    async putCandidateSources(input: {
      slug: string;
      jobId: number;
      files: SourceFile[];
      mode?: string;
      origin?: string;
      proposal?: { id: string; proposerUid: string };
    }) {
      const version = `v${++counter}`;
      const manifest = put(input.slug, version, input.files, {
        jobId: input.jobId,
        deliveryMode: (input.mode ?? 'publish') as VersionManifest['deliveryMode'],
        ...(input.origin ? { origin: input.origin } : {}),
        ...(input.proposal ? { proposal: input.proposal } : {}),
      } as Partial<VersionManifest>);
      return { version, manifest };
    },
    async getManifest(slug: string, version: string) {
      return versions.get(key(slug, version))?.manifest ?? null;
    },
    async getSourceFile(slug: string, version: string, path: string) {
      return versions.get(key(slug, version))?.files.find((file) => file.path === path)?.content ?? null;
    },
    put,
  };
  return store as unknown as GamesStore & { put: typeof put };
}
