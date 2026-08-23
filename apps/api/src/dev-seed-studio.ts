import { deflateSync } from 'node:zlib';
import type { InMemoryStore } from './store.js';

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function demoShotPng(paint: (x: number, y: number, w: number, h: number) => [number, number, number]): string {
  const w = 96;
  const h = 60;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const [r, g, b] = paint(x, y, w, h);
      const i = y * (w * 3 + 1) + 1 + x * 3;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]).toString('base64');
}

export async function seedStudioDemo(store: InMemoryStore): Promise<void> {
  const uid = 'dev:studio-demo';
  await store.upsertUser({ uid, name: 'Studio Demo', email: 'studio-demo@example.com' });
  // Canceled draft demo: should not appear in active shelf.
  await store.createSubmission(100, uid, 'Can we make a game like Grand Theft Auto');
  await store.setSubmissionSlug(100, 'street-heist');
  await store.recordJobTransition(100, {
    to: 'canceled',
    at: new Date(Date.now() - 20 * 3600_000).toISOString(),
    by: 'operator',
    reason: 'operator_canceled',
  });
  // Pre-fix shape with state === 'canceled'.
  await store.createSubmission(101, uid, 'Global Thermonuclear Strategy');
  await store.setSubmissionSlug(101, 'global-thermonuclear-strategy');
  await store.recordJobTransition(101, {
    to: 'building',
    at: new Date(Date.now() - 6 * 60_000).toISOString(),
    by: 'operator',
  });
  await store.setSubmissionLastStatus(101, 'building');
  await store.setSubmissionNotifiedStatus(101, 'building');
  await store.touchLastAgentSignalAt(101, new Date(Date.now() - 3 * 60_000).toISOString());
  await store.createSubmission(102, uid, 'A game tycoon like where I run a studio');
  await store.setSubmissionSlug(102, 'studio-tycoon');
  await store.setSubmissionLastStatus(102, 'building');
  await store.setSubmissionNotifiedStatus(102, 'building');
  // Extra shelf rows for local QA testing.
  const extras: Array<{
    issue: number;
    title: string;
    slug?: string;
    status: 'published' | 'building' | 'queued' | 'in_review' | 'needs_changes';
    daysAgo: number;
  }> = [
    { issue: 103, title: 'Sky Dodge', slug: 'sky-dodge', status: 'published', daysAgo: 3 },
    { issue: 104, title: 'Neon Drift', slug: 'neon-drift', status: 'published', daysAgo: 8 },
    { issue: 105, title: 'Puzzle Dock', slug: 'puzzle-dock', status: 'published', daysAgo: 12 },
    { issue: 106, title: 'Bolt Rush', status: 'queued', daysAgo: 0 },
    { issue: 107, title: 'Castle Siege', slug: 'castle-siege', status: 'published', daysAgo: 20 },
    { issue: 108, title: 'Orbit Hop', status: 'in_review', daysAgo: 1 },
    { issue: 109, title: 'Tide Pool', slug: 'tide-pool', status: 'published', daysAgo: 30 },
    { issue: 110, title: 'Ghost Circuit', status: 'needs_changes', daysAgo: 5 },
    { issue: 111, title: 'Forest Dash', slug: 'forest-dash', status: 'published', daysAgo: 55 },
    { issue: 112, title: 'Sumo Mini', slug: 'sumo-mini', status: 'published', daysAgo: 60 },
  ];
  for (const extra of extras) {
    await store.createSubmission(extra.issue, uid, extra.title);
    if (extra.slug) await store.setSubmissionSlug(extra.issue, extra.slug);
    const created = new Date(Date.now() - extra.daysAgo * 86400_000).toISOString();
    if (extra.status === 'published' && extra.slug) {
      await store.setSubmissionPublishedAt(extra.issue, created);
    }
    await store.setSubmissionLastStatus(extra.issue, extra.status);
    await store.setSubmissionNotifiedStatus(extra.issue, extra.status);
  }
  // Local demo shots for Creator Studio.
  await store.appendBuildShot(103, {
    data: demoShotPng((x, y, w, h) => [12, 40 + Math.floor((x / w) * 160), 90 + Math.floor((y / h) * 80)]),
    label: 'First sky pass',
  });
  await store.appendBuildShot(103, {
    data: demoShotPng((x, y, w, h) => {
      const d = Math.hypot(x - w / 2, y - h / 2) / (w / 2);
      return [40 + Math.floor(d * 180), 24, 48];
    }),
    label: 'Near the rings',
  });
  await store.appendBuildShot(103, {
    data: demoShotPng((x) => (Math.floor(x / 12) % 2 ? [0, 200, 160] : [18, 28, 36])),
    label: 'Crash moment',
  });
  const today = new Date().toISOString().slice(0, 10);
  await store.appendTelemetryEvents(today, [
    {
      slug: 'sky-dodge',
      sessionId: 'demo-s1',
      type: 'game_opened',
      at: `${today}T10:00:00.000Z`,
      msSinceOpen: 0,
    },
    {
      slug: 'sky-dodge',
      sessionId: 'demo-s1',
      type: 'alive',
      frames: 300,
      at: `${today}T10:00:05.000Z`,
      msSinceOpen: 5_000,
    },
    {
      slug: 'sky-dodge',
      sessionId: 'demo-s1',
      type: 'play_time',
      seconds: 95,
      at: `${today}T10:01:35.000Z`,
      msSinceOpen: 95_000,
    },
    {
      slug: 'sky-dodge',
      sessionId: 'demo-s1',
      type: 'game_closed',
      at: `${today}T10:01:36.000Z`,
      msSinceOpen: 96_000,
    },
    {
      slug: 'sky-dodge',
      sessionId: 'demo-s2',
      type: 'game_opened',
      at: `${today}T11:00:00.000Z`,
      msSinceOpen: 0,
    },
    {
      slug: 'sky-dodge',
      sessionId: 'demo-s2',
      type: 'error',
      message: 'TypeError: x is not a function',
      at: `${today}T11:00:02.000Z`,
      msSinceOpen: 2_000,
    },
    {
      slug: 'sky-dodge',
      sessionId: 'demo-s2',
      type: 'play_time',
      seconds: 12,
      at: `${today}T11:00:12.000Z`,
      msSinceOpen: 12_000,
    },
  ]);
  console.info('[dev] seeded Creator Studio demo user dev:studio-demo');

  // Seed self-build round awaiting connect.
  const selfUid = 'dev:local';
  await store.upsertUser({ uid: selfUid, name: 'Local local', email: 'local@localhost' });
  await store.createSubmission(120, selfUid, 'Beasts and pumpkins: scarecrow hero defends an endless pumpkin patch');
  await store.setSubmissionSlug(120, 'beasts-and-pumpkins');
  await store.setSubmissionLastStatus(120, 'queued');
  await store.recordJobTransition(120, { to: 'queued', at: new Date().toISOString(), by: 'system' });
  await store.setRoundBuilder(120, 'self');
  console.info('[dev] seeded self-build round awaiting connect: /studio/beasts-and-pumpkins (dev:local)');
}
