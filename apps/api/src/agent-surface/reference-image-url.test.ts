import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { AGENT_CHANNEL_ROUTES } from '@gamedevpl/contract';
import { InMemoryStore } from '../platform/store.js';
import { registerAgentChannelBriefRoutes } from './agent-channel-brief.js';
import {
  mintReferenceImageToken,
  REFERENCE_IMAGE_DOWNLOAD_ROUTE,
  verifyReferenceImageToken,
} from './reference-image-url.js';

const SECRET = 'test-secret';
const NOW = Date.parse('2026-10-07T10:00:00.000Z');

describe('reference image download token', () => {
  it('round-trips the job and shot until it expires', () => {
    const { token, expiresAt } = mintReferenceImageToken(SECRET, { jobId: 7, shotId: 'shot-a', nowMs: NOW });
    expect(verifyReferenceImageToken(SECRET, token, NOW)).toEqual({ jobId: 7, shotId: 'shot-a' });
    expect(verifyReferenceImageToken(SECRET, token, Date.parse(expiresAt))).toBeNull();
  });

  it('refuses another secret, another shot and a malformed token', () => {
    const { token } = mintReferenceImageToken(SECRET, { jobId: 7, shotId: 'shot-a', nowMs: NOW });
    expect(verifyReferenceImageToken('other', token, NOW)).toBeNull();
    const [job, , exp, sig] = token.split('.');
    const swapped = `${job}.${Buffer.from('shot-b').toString('base64url')}.${exp}.${sig}`;
    expect(verifyReferenceImageToken(SECRET, swapped, NOW)).toBeNull();
    expect(verifyReferenceImageToken(SECRET, 'nope', NOW)).toBeNull();
  });
});

async function app() {
  const store = new InMemoryStore();
  const created = await store.createSubmission(7, 'g:owner', 'Trench');
  const png = Buffer.from('fake-png-bytes');
  const reference = await store.appendBuildShot(7, { data: png.toString('base64'), label: 'creator-reference' });
  const agentShot = await store.appendBuildShot(7, { data: png.toString('base64'), label: 'opening' });
  const server = Fastify();
  registerAgentChannelBriefRoutes(server, {
    resolveBuild: async () => ({ jobId: 7, record: created, access: {} as never }),
    store,
    agentTokenSecret: SECRET,
    now: () => NOW,
  });
  return { server, png, reference, agentShot };
}

describe('reference image routes', () => {
  it('lists signed URLs that a plain GET downloads', async () => {
    const { server, png, reference } = await app();
    const listed = await server.inject({ method: 'GET', url: `${AGENT_CHANNEL_ROUTES.REFERENCE_IMAGES}?urls=1` });
    const images = listed.json().images as Array<{ id: string; url: string; png?: string }>;
    expect(images).toHaveLength(1);
    expect(images[0]).toMatchObject({ id: reference.id });
    expect(images[0]!.png).toBeUndefined();
    const path = new URL(images[0]!.url).pathname + new URL(images[0]!.url).search;
    const download = await server.inject({ method: 'GET', url: path });
    expect(download.statusCode).toBe(200);
    expect(download.headers['content-type']).toBe('image/png');
    expect(download.rawPayload).toEqual(png);
  });

  it('serves only creator references, and only with a valid token', async () => {
    const { server, agentShot } = await app();
    const forged = mintReferenceImageToken(SECRET, { jobId: 7, shotId: agentShot.id, nowMs: NOW }).token;
    const base = REFERENCE_IMAGE_DOWNLOAD_ROUTE;
    expect((await server.inject({ method: 'GET', url: `${base}?t=${forged}` })).statusCode).toBe(404);
    expect((await server.inject({ method: 'GET', url: `${base}?t=garbage` })).statusCode).toBe(404);
    expect((await server.inject({ method: 'GET', url: base })).statusCode).toBe(404);
  });
});
