import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mintAgentToken, mintLegacyAgentToken, STALE_AGENT_TOKEN_REASON } from './agent-token.js';
import { verifyUploadToken } from './agent-upload-token.js';
import type { AgentChannelOptions } from './agent-channel.js';
import { MAX_TRANSCRIPT_LIST_ENTRIES } from './build-transcript.js';
import { buildApp } from './app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from './auth.js';
import type { CatalogGameEntry, GameSources, GitHubClient, LinkedPullRequest } from './github-client.js';
import type { AgentBackend } from './agent-backend.js';
import type { GameSeeder } from './game-seed.js';
import { InvalidUploadError, type GamesStore } from './games-store.js';
import type { KnowledgeQueryResult } from './knowledge-search.js';
import { InMemoryStore } from './store.js';
import { mintToken } from './submission-token.js';
import type { Translator } from './translate.js';

const secret = 'test-secret';
const ISSUE = 42;

function stubGitHub(overrides: Partial<GitHubClient> = {}): GitHubClient {
  return {
    createIssue: async () => ({ number: ISSUE }),
    getIssueState: async () => ({ state: 'open' as const }),
    findLinkedPR: async (): Promise<LinkedPullRequest | null> => null,
    createIssueComment: async () => ({ id: 1 }),
    updateIssueBody: async () => {},
    closeIssue: async () => {},
    closePullRequest: async () => {},
    ensureOpenPullRequest: async () => ({ number: 1 }),
    deleteBranch: async () => {},
    getGameSources: async (): Promise<GameSources | null> => null,
    getGameMedia: async () => null,
    getCatalog: async (): Promise<CatalogGameEntry[]> => [],
    getProgressNotes: async () => null,
    ...overrides,
  };
}

const sessionSecret = 'dev-session-secret-change-me';

async function createApp(
  store: InMemoryStore,
  agentChannel?: {
    translator?: Translator;
    maxEventsPerWindow?: number;
    gamesStore?: GamesStore;
    maxSubmitsPerWindow?: number;
    knowledgeSearch?: AgentChannelOptions['knowledgeSearch'];
    maxKnowledgeAnswersPerWindow?: number;
    maxKnowledgeChunksPerWindow?: number;
    onSourcesDelivered?: (input: {
      issueNumber: number;
      slug: string;
      version: string;
      mode?: 'health' | 'preview';
    }) => void;
    onBuilderHandoffAcknowledged?: AgentChannelOptions['onBuilderHandoffAcknowledged'];
  },
  extra?: {
    githubClient?: GitHubClient;
    /** Live-preview timings; the real ones are tens of seconds and no test can wait them out. */
    stagedPreview?: { debounceMs?: number; minGapMs?: number; maxBytes?: number };
    gameSeeder?: GameSeeder;
    agentBackend?: AgentBackend;
  },
) {
  await store.upsertUser({ uid: 'g:owner' });
  return await buildApp({
    store,
    sessionSecret,
    submissionRoutes: {
      githubClient: extra?.githubClient ?? stubGitHub(),
      githubToken: 'gh-token',
      submissionTokenSecret: secret,
      ...(agentChannel ? { agentChannel } : {}),
      ...(extra?.stagedPreview ? { stagedPreview: extra.stagedPreview } : {}),
      ...(extra?.gameSeeder ? { gameSeeder: extra.gameSeeder } : {}),
      ...(extra?.agentBackend ? { agentBackend: extra.agentBackend } : {}),
    },
  });
}

function creatorHeaders(uid = 'g:owner') {
  return { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, sessionSecret)}` };
}

async function seedSubmission(store: InMemoryStore, issueNumber = ISSUE) {
  await store.createSubmission(issueNumber, 'g:owner', 'Squad game');
  await store.setSubmissionLocale(issueNumber, 'pl');
}

function agentHeaders(issueNumber = ISSUE, roundGeneration = 1) {
  return {
    authorization: `Bearer ${mintAgentToken(issueNumber, secret, { roundGeneration })}`,
  };
}

describe('agent build channel', () => {
  let app: FastifyInstance | null = null;

  afterEach(async () => {
    await app?.close();
    app = null;
  });

  it('records a progress event and returns it on the creator status response', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    app = await createApp(store);

    const posted = await app.inject({
      method: 'POST',
      url: '/api/agent/build/progress',
      headers: agentHeaders(),
      payload: { kind: 'step', step: 'mechanics', text: 'Getting the squad moving and shooting.' },
    });

    expect(posted.statusCode).toBe(200);
    expect(posted.json().accepted).toBe(true);
    expect(posted.json().event).toMatchObject({ kind: 'step', step: 'mechanics' });

    const status = await app.inject({ method: 'GET', url: `/api/submissions/${mintToken(ISSUE, secret)}` });
    expect(status.statusCode).toBe(200);
    expect(status.json().events).toHaveLength(1);
    expect(status.json().events[0]).toMatchObject({
      step: 'mechanics',
      text: 'Getting the squad moving and shooting.',
    });
  });

  it('serves the agent sentence written in the creator language without translating it', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    app = await createApp(store);

    await app.inject({
      method: 'POST',
      url: '/api/agent/build/progress',
      headers: agentHeaders(),
      payload: {
        step: 'art',
        text: 'Drawing the soldiers.',
        textLocalized: 'Rysuję żołnierzy.',
        locale: 'pl',
      },
    });

    const polish = await app.inject({
      method: 'GET',
      url: `/api/submissions/${mintToken(ISSUE, secret)}?locale=pl`,
    });
    expect(polish.json().events[0].text).toBe('Rysuję żołnierzy.');
    // The wire carries one resolved sentence, not a choice for the client to make.
    expect(polish.json().events[0].textLocalized).toBeUndefined();

    // A reader in another language falls back to the source text (translation is
    // stubbed out here) rather than being served Polish they may not read.
    const english = await app.inject({
      method: 'GET',
      url: `/api/submissions/${mintToken(ISSUE, secret)}?locale=en`,
    });
    expect(english.json().events[0].text).toBe('Drawing the soldiers.');
  });

  it('drops a localized sentence with no language tag', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    app = await createApp(store);

    await app.inject({
      method: 'POST',
      url: '/api/agent/build/progress',
      headers: agentHeaders(),
      payload: { text: 'Drawing the soldiers.', textLocalized: 'Rysuję żołnierzy.' },
    });

    const events = await store.listBuildEvents(ISSUE);
    expect(events[0]!.textLocalized).toBeUndefined();
  });

  it('localizes an English-only progress report once, on the write', async () => {
    // report_progress asks agents for textLocalized + locale, and the ones that comply
    // cost nothing. This is the fallback for the ones that do not — and it belongs here,
    // on the write, because the alternative (translating when somebody reads the status)
    // costs one model call per poll per viewer.
    const store = new InMemoryStore();
    await seedSubmission(store);
    const asked: string[] = [];
    const translator: Translator = {
      toBilingual: async (text) => {
        asked.push(text);
        return { en: text, localized: `PL:${text}` };
      },
    };
    app = await createApp(store, { translator });

    await app.inject({
      method: 'POST',
      url: '/api/agent/build/progress',
      headers: agentHeaders(),
      payload: { text: 'Drawing the soldiers.' },
    });

    const events = await store.listBuildEvents(ISSUE);
    expect(events[0]!.text).toBe('Drawing the soldiers.');
    expect(events[0]!.textLocalized).toBe('PL:Drawing the soldiers.');
    expect(events[0]!.locale).toBe('pl');
    expect(asked).toEqual(['Drawing the soldiers.']);

    // Reading the status any number of times must not translate anything. This is the
    // assertion that would have caught 2026-08-04: the leak was not a bad translation,
    // it was a translation on a 3s-polled read path.
    for (let i = 0; i < 3; i++) {
      await app.inject({ method: 'GET', url: `/api/submissions/${mintToken(ISSUE, secret)}?locale=pl` });
    }
    expect(asked).toHaveLength(1);
  });

  it('stores English in `text` even when the agent wrote the report in Polish', async () => {
    // Nothing enforces the language an agent writes in. An agent talking to a Polish
    // creator writes Polish into `text`, and `text` is the field every reader falls back
    // to — so an English reader on a shared draft link was shown Polish with no second
    // version stored. Normalization decides what English is rather than assuming.
    const store = new InMemoryStore();
    await seedSubmission(store);
    const translator: Translator = {
      toBilingual: async (text) => ({ en: `EN:${text}`, localized: text }),
    };
    app = await createApp(store, { translator });

    await app.inject({
      method: 'POST',
      url: '/api/agent/build/progress',
      headers: agentHeaders(),
      payload: { text: 'Rysuję żołnierzy.' },
    });

    const events = await store.listBuildEvents(ISSUE);
    expect(events[0]!.text).toBe('EN:Rysuję żołnierzy.');
    expect(events[0]!.textLocalized).toBe('Rysuję żołnierzy.');
    expect(events[0]!.locale).toBe('pl');
  });

  it('stores both languages even when the game record says its creator reads English', async () => {
    // The record's locale is routinely wrong: a game created over MCP has no
    // accept-language to fall back on, so it lands on 'en' unless the agent passed one —
    // eight consecutive self-build games did not, and their Polish creator read English
    // throughout. Storing both makes that field irrelevant to what a reader sees.
    const store = new InMemoryStore();
    await store.createSubmission(4242, 'g:owner', 'Squad game');
    await store.setSubmissionLocale(4242, 'en');
    const translator: Translator = {
      toBilingual: async (text) => ({ en: `EN:${text}`, localized: `PL:${text}` }),
    };
    app = await createApp(store, { translator });

    await app.inject({
      method: 'POST',
      url: '/api/agent/build/progress',
      headers: agentHeaders(4242),
      payload: { text: 'Zeichne die Soldaten.' },
    });

    const events = await store.listBuildEvents(4242);
    expect(events[0]!.text).toBe('EN:Zeichne die Soldaten.');
    expect(events[0]!.textLocalized).toBe('PL:Zeichne die Soldaten.');
    expect(events[0]!.locale).toBe('pl');

    // And a Polish reader gets Polish, despite the record claiming English.
    const status = await app.inject({ method: 'GET', url: `/api/submissions/${mintToken(4242, secret)}?locale=pl` });
    expect(status.json().events[0].text).toBe('PL:Zeichne die Soldaten.');
  });

  it('does not translate when the agent already sent both languages', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    let calls = 0;
    const translator: Translator = {
      toBilingual: async () => {
        calls++;
        return null;
      },
    };
    app = await createApp(store, { translator });

    await app.inject({
      method: 'POST',
      url: '/api/agent/build/progress',
      headers: agentHeaders(),
      payload: { text: 'Drawing the soldiers.', textLocalized: 'Rysuję żołnierzy.', locale: 'pl' },
    });

    const events = await store.listBuildEvents(ISSUE);
    expect(events[0]!.textLocalized).toBe('Rysuję żołnierzy.');
    expect(calls).toBe(0);
  });

  it('stores the English text when translation fails, and never retries it', async () => {
    // Decorative by contract: a build must not fail, and must not get slower, because a
    // sentence could not be translated. The event stays English permanently — that is the
    // correct outcome, and the opposite of the read-path design, where a failure cached
    // nothing and the next poll asked again forever.
    const store = new InMemoryStore();
    await seedSubmission(store);
    let calls = 0;
    const translator: Translator = {
      toBilingual: async () => {
        calls++;
        throw new Error('vertex is down');
      },
    };
    app = await createApp(store, { translator });

    const res = await app.inject({
      method: 'POST',
      url: '/api/agent/build/progress',
      headers: agentHeaders(),
      payload: { text: 'Drawing the soldiers.' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().accepted).toBe(true);
    const events = await store.listBuildEvents(ISSUE);
    expect(events[0]!.text).toBe('Drawing the soldiers.');
    expect(events[0]!.textLocalized).toBeUndefined();

    const status = await app.inject({
      method: 'GET',
      url: `/api/submissions/${mintToken(ISSUE, secret)}?locale=pl`,
    });
    expect(status.json().events[0].text).toBe('Drawing the soldiers.');
    expect(calls).toBe(1);
  });

  it('sanitizes agent text and caps its length', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    app = await createApp(store);

    await app.inject({
      method: 'POST',
      url: '/api/agent/build/progress',
      headers: agentHeaders(),
      payload: { text: `<img src=x onerror=alert(1)> **${'a'.repeat(400)}**` },
    });

    const [event] = await store.listBuildEvents(ISSUE);
    expect(event!.text).not.toContain('<');
    expect(event!.text).not.toContain('*');
    expect(event!.text.length).toBeLessThanOrEqual(300);
  });

  it('hands the creator’s change requests back in the reply, and keeps them until acked', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    await store.appendCreatorMessage(ISSUE, 'Make the soldiers faster');
    app = await createApp(store);

    const first = await app.inject({
      method: 'POST',
      url: '/api/agent/build/progress',
      headers: agentHeaders(),
      payload: { text: 'Working on the maze.' },
    });
    expect(first.json().pending).toHaveLength(1);
    expect(first.json().pending[0].text).toBe('Make the soldiers faster');
    expect(first.json().control).toMatchObject({ stop: false, locale: 'pl' });

    // Reading is not acknowledging: an agent that crashes here must not lose it.
    const again = await app.inject({ method: 'GET', url: '/api/agent/build/inbox', headers: agentHeaders() });
    expect(again.json().pending).toHaveLength(1);

    const acked = await app.inject({
      method: 'POST',
      url: '/api/agent/build/inbox/ack',
      headers: agentHeaders(),
      payload: { ids: [first.json().pending[0].id] },
    });
    expect(acked.json().pending).toHaveLength(0);
  });

  it('serves the tail of the conversation on the transcript route without acking anything', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    // Already delivered — gone from the inbox, kept in the record.
    await store.appendCreatorMessage(ISSUE, 'A long spec about hatching and teaching creatures.', {
      delivered: true,
    });
    await store.appendCreatorMessage(ISSUE, 'build my game plz');
    await store.appendCreatorMessage(ISSUE, 'Relayed on your behalf.', { origin: 'studio' });
    await store.appendBuildEvent(ISSUE, { kind: 'step', text: 'Drawing the nursery.' });
    app = await createApp(store);

    const res = await app.inject({ method: 'GET', url: '/api/agent/build/transcript', headers: agentHeaders() });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      entries: Array<{ kind: string; text: string; round: string }>;
      hasMore: boolean;
      nextCursor?: string;
      pending: Array<{ text: string }>;
      control: { stop: boolean };
    };
    expect(body.entries.map((entry) => [entry.kind, entry.text])).toEqual(
      expect.arrayContaining([
        ['creator_request', 'A long spec about hatching and teaching creatures.'],
        ['creator_request', 'build my game plz'],
        ['agent_note', 'Relayed on your behalf.'],
        ['build_progress', 'Drawing the nursery.'],
      ]),
    );
    // Four entries fit under the default window.
    expect(body.hasMore).toBe(false);
    expect(body.nextCursor).toBeUndefined();
    expect(body.control).toMatchObject({ stop: false });

    // Reading the transcript is not acknowledging: the pending message survives.
    const inbox = await app.inject({ method: 'GET', url: '/api/agent/build/inbox', headers: agentHeaders() });
    expect(inbox.json().pending).toHaveLength(1);
  });

  it('pages the transcript with cursor/limit instead of serving it all at once', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    for (let i = 0; i < 5; i += 1) {
      await store.appendCreatorMessage(ISSUE, `message-${i}`, { delivered: true });
    }
    app = await createApp(store);

    const firstPage = await app.inject({
      method: 'GET',
      url: '/api/agent/build/transcript?limit=2',
      headers: agentHeaders(),
    });
    const first = firstPage.json() as { entries: Array<{ text: string }>; hasMore: boolean; nextCursor?: string };
    expect(first.entries.map((e) => e.text)).toEqual(['message-3', 'message-4']);
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).toBeDefined();

    const secondPage = await app.inject({
      method: 'GET',
      url: `/api/agent/build/transcript?limit=2&cursor=${first.nextCursor}`,
      headers: agentHeaders(),
    });
    const second = secondPage.json() as { entries: Array<{ text: string }>; hasMore: boolean };
    expect(second.entries.map((e) => e.text)).toEqual(['message-1', 'message-2']);
    expect(second.hasMore).toBe(true);
  });

  it('flags truncatedAtSource over the real channel route when a round exceeds the read ceiling', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    for (let i = 0; i < MAX_TRANSCRIPT_LIST_ENTRIES; i += 1) {
      await store.appendBuildEvent(ISSUE, { kind: 'step', text: `event-${i}` });
    }
    app = await createApp(store);

    const res = await app.inject({ method: 'GET', url: '/api/agent/build/transcript', headers: agentHeaders() });
    expect(res.json().truncatedAtSource).toBe(true);
  });

  it('queues creator feedback for the agent when it is posted to GitHub', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    app = await createApp(store);

    const sent = await app.inject({
      method: 'POST',
      url: `/api/submissions/${mintToken(ISSUE, secret)}/feedback`,
      headers: creatorHeaders(),
      payload: { feedback: 'Please make the soldiers move faster' },
    });

    expect(sent.statusCode).toBe(200);
    const pending = await store.listPendingCreatorMessages(ISSUE);
    expect(pending).toHaveLength(1);
    expect(pending[0]!.text).toBe('Please make the soldiers move faster');
  });

  it('tells an agent to stop when the creator abandoned the build, and records nothing', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    await store.setSubmissionAbandoned(ISSUE, new Date().toISOString());
    app = await createApp(store);

    const response = await app.inject({
      method: 'POST',
      url: '/api/agent/build/progress',
      headers: agentHeaders(),
      payload: { text: 'Still building away.' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      accepted: false,
      rejected: 'stopped',
      control: { stop: true, reason: 'abandoned' },
    });
    expect(await store.listBuildEvents(ISSUE)).toHaveLength(0);
  });

  it('keeps a builder handoff pending until the agent acknowledges the stop nudge', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    await store.requestBuilderHandoff(ISSUE, 'self', new Date().toISOString());
    app = await createApp(store, {
      onBuilderHandoffAcknowledged: async ({ issueNumber, acknowledgedAt }) => {
        const handoff = await store.acknowledgeBuilderHandoff(issueNumber, acknowledgedAt);
        await store.clearBuilderHandoff(issueNumber);
        return { started: handoff !== null };
      },
    });

    const nudge = await app.inject({
      method: 'POST',
      url: '/api/agent/build/progress',
      headers: agentHeaders(),
      payload: { text: 'I am checking the handoff.' },
    });
    expect(nudge.json()).toMatchObject({
      accepted: false,
      rejected: 'stopped',
      control: { stop: true, reason: 'builder_handoff', builderHandoff: { target: 'self' } },
    });

    const end = await app.inject({ method: 'POST', url: '/api/agent/build/end', headers: agentHeaders() });
    expect(end.json()).toMatchObject({
      accepted: true,
      ended: true,
      handoffAcknowledged: true,
      control: { stop: true, reason: 'builder_handoff_acknowledged' },
    });
    expect((await store.getSubmission(ISSUE))?.builderHandoff).toBeUndefined();
  });

  it('shows the closing summary from end in the creator thread', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    app = await createApp(store);

    const end = await app.inject({
      method: 'POST',
      url: '/api/agent/build/end',
      headers: agentHeaders(),
      payload: { summary: 'Star Parcel Run is an arcade game — collect parcels, dodge clouds.' },
    });

    expect(end.json()).toMatchObject({ accepted: true, ended: true, summaryShown: true });

    const status = await app.inject({ method: 'GET', url: `/api/submissions/${mintToken(ISSUE, secret)}` });
    expect(status.json().events).toHaveLength(1);
    expect(status.json().events[0]).toMatchObject({
      kind: 'done',
      text: 'Star Parcel Run is an arcade game — collect parcels, dodge clouds.',
    });
  });

  it('does not duplicate the summary when a client retries end after a lost response', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    app = await createApp(store);

    const first = await app.inject({
      method: 'POST',
      url: '/api/agent/build/end',
      headers: agentHeaders(),
      payload: { summary: 'Star Parcel Run is an arcade game.' },
    });
    expect(first.json()).toMatchObject({ accepted: true, ended: true, summaryShown: true });

    const retry = await app.inject({
      method: 'POST',
      url: '/api/agent/build/end',
      headers: agentHeaders(),
      payload: { summary: 'Star Parcel Run is an arcade game.' },
    });
    expect(retry.json()).toMatchObject({ accepted: true, ended: true });
    expect(retry.json().summaryShown).toBeUndefined();

    const events = await store.listBuildEvents(ISSUE);
    expect(events.filter((event) => event.kind === 'done')).toHaveLength(1);
  });

  it('still records the summary when submit already marked the round ended', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    await store.markAgentEnded(ISSUE, '2026-08-12T12:00:00.000Z', 'submit');
    app = await createApp(store);

    const end = await app.inject({
      method: 'POST',
      url: '/api/agent/build/end',
      headers: agentHeaders(),
      payload: { summary: 'Preview fixed and resubmitted with the save module enabled.' },
    });

    expect(end.json()).toMatchObject({ accepted: true, ended: true, summaryShown: true });
    expect((await store.listBuildEvents(ISSUE))[0]).toMatchObject({
      kind: 'done',
      text: 'Preview fixed and resubmitted with the save module enabled.',
    });
  });

  it('does not duplicate the summary on a legacy ended record without agentEndedBy', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    await store.markAgentEnded(ISSUE, '2026-08-11T12:00:00.000Z');
    const stored = (
      store as unknown as { submissions: Map<number, import('./store.js').SubmissionRecord> }
    ).submissions.get(ISSUE);
    delete stored!.agentEndedBy;
    app = await createApp(store);

    const retry = await app.inject({
      method: 'POST',
      url: '/api/agent/build/end',
      headers: agentHeaders(),
      payload: { summary: 'Should not appear on a legacy retry.' },
    });

    expect(retry.json()).toMatchObject({ accepted: true, ended: true });
    expect(retry.json().summaryShown).toBeUndefined();
    expect(await store.listBuildEvents(ISSUE)).toHaveLength(0);
  });

  it('records a fresh summary once the agent has resumed and ended again', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    app = await createApp(store);

    await app.inject({
      method: 'POST',
      url: '/api/agent/build/end',
      headers: agentHeaders(),
      payload: { summary: 'First pass: arcade shell in place.' },
    });
    await app.inject({
      method: 'POST',
      url: '/api/agent/build/progress',
      headers: agentHeaders(),
      payload: { text: 'Back to add sound effects.' },
    });
    const second = await app.inject({
      method: 'POST',
      url: '/api/agent/build/end',
      headers: agentHeaders(),
      payload: { summary: 'Sound effects added.' },
    });
    expect(second.json()).toMatchObject({ accepted: true, ended: true, summaryShown: true });

    const events = await store.listBuildEvents(ISSUE);
    expect(events.filter((event) => event.kind === 'done')).toHaveLength(2);
  });

  it('takes the agent at its word when end carries a localized summary', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    app = await createApp(store);

    await app.inject({
      method: 'POST',
      url: '/api/agent/build/end',
      headers: agentHeaders(),
      payload: { summary: 'Clouds drift slower now.', summaryLocalized: 'Chmury płyną wolniej.', locale: 'pl' },
    });

    const polish = await app.inject({
      method: 'GET',
      url: `/api/submissions/${mintToken(ISSUE, secret)}?locale=pl`,
    });
    expect(polish.json().events[0].text).toBe('Chmury płyną wolniej.');
  });

  it('ends cleanly with no summary, as every existing client sends', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    app = await createApp(store);

    const end = await app.inject({ method: 'POST', url: '/api/agent/build/end', headers: agentHeaders() });

    expect(end.json()).toMatchObject({ accepted: true, ended: true });
    expect(end.json().summaryShown).toBeUndefined();
    expect(await store.listBuildEvents(ISSUE)).toHaveLength(0);
    expect((await store.getSubmission(ISSUE))?.agentEndedAt).toBeTruthy();
  });

  it('carries the closing summary through a builder handoff acknowledgement', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    await store.requestBuilderHandoff(ISSUE, 'self', new Date().toISOString());
    app = await createApp(store, {
      onBuilderHandoffAcknowledged: async ({ issueNumber, acknowledgedAt }) => {
        const handoff = await store.acknowledgeBuilderHandoff(issueNumber, acknowledgedAt);
        await store.clearBuilderHandoff(issueNumber);
        return { started: handoff !== null };
      },
    });

    const end = await app.inject({
      method: 'POST',
      url: '/api/agent/build/end',
      headers: agentHeaders(),
      payload: { summary: 'Handing over — the beacon still needs art.' },
    });

    expect(end.json()).toMatchObject({ accepted: true, handoffAcknowledged: true, summaryShown: true });
    expect((await store.listBuildEvents(ISSUE))[0]).toMatchObject({
      kind: 'done',
      text: 'Handing over — the beacon still needs art.',
    });
  });

  it('drops the summary and does not ack the inbox when the round is already stopped', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    const msg = await store.appendCreatorMessage(ISSUE, 'please make the ship faster');
    await store.setSubmissionAbandoned(ISSUE, new Date().toISOString());
    app = await createApp(store);

    const end = await app.inject({
      method: 'POST',
      url: '/api/agent/build/end',
      headers: agentHeaders(),
      payload: { summary: 'One last word the creator did not ask for.', ackInboxIds: [msg.id] },
    });

    expect(end.json()).toMatchObject({ accepted: false, rejected: 'stopped' });
    expect(await store.listBuildEvents(ISSUE)).toHaveLength(0);
    expect(await store.listPendingCreatorMessages(ISSUE)).toHaveLength(1);
  });

  it('acknowledges inbox messages on a successful end call', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    const msg1 = await store.appendCreatorMessage(ISSUE, 'feedback 1');
    const msg2 = await store.appendCreatorMessage(ISSUE, 'feedback 2');
    app = await createApp(store);

    const end = await app.inject({
      method: 'POST',
      url: '/api/agent/build/end',
      headers: agentHeaders(),
      payload: { summary: 'Addressed feedback.', ackInboxIds: [msg1.id] },
    });

    expect(end.json()).toMatchObject({ accepted: true, ended: true });
    const pending = await store.listPendingCreatorMessages(ISSUE);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.id).toBe(msg2.id);
  });

  it('acknowledges inbox messages on builder handoff ack', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    const msg = await store.appendCreatorMessage(ISSUE, 'feedback');
    await store.requestBuilderHandoff(ISSUE, 'self', new Date().toISOString());
    app = await createApp(store, {
      onBuilderHandoffAcknowledged: async ({ issueNumber, acknowledgedAt }) => {
        const handoff = await store.acknowledgeBuilderHandoff(issueNumber, acknowledgedAt);
        await store.clearBuilderHandoff(issueNumber);
        return { started: handoff !== null };
      },
    });

    const end = await app.inject({
      method: 'POST',
      url: '/api/agent/build/end',
      headers: agentHeaders(),
      payload: { summary: 'Handing over.', ackInboxIds: [msg.id] },
    });

    expect(end.json()).toMatchObject({ accepted: true, handoffAcknowledged: true });
    expect(await store.listPendingCreatorMessages(ISSUE)).toHaveLength(0);
  });

  it('does not ack the inbox when a builder handoff is already acknowledged', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    const msg = await store.appendCreatorMessage(ISSUE, 'please make the ship faster');
    await store.requestBuilderHandoff(ISSUE, 'self', new Date().toISOString());
    await store.acknowledgeBuilderHandoff(ISSUE, new Date().toISOString());
    app = await createApp(store);

    const end = await app.inject({
      method: 'POST',
      url: '/api/agent/build/end',
      headers: agentHeaders(),
      payload: { summary: 'Handing over.', ackInboxIds: [msg.id] },
    });

    expect(end.json()).toMatchObject({ accepted: false, rejected: 'handoff_already_acknowledged' });
    expect(await store.listPendingCreatorMessages(ISSUE)).toHaveLength(1);
  });

  it('rejects the pre-cancel token after operator cancel bumps the round generation', async () => {
    // Cancel closes the round (generation bump). The agent's held key is then stale;
    // the 401 fresh-prompt body is the stop signal — no terminal-job exception.
    const store = new InMemoryStore();
    await seedSubmission(store);
    await store.recordJobTransition(ISSUE, {
      to: 'canceled',
      at: new Date().toISOString(),
      by: 'operator',
      reason: 'operator_canceled',
    });
    expect((await store.getSubmission(ISSUE))?.roundGeneration).toBe(2);
    app = await createApp(store);

    const response = await app.inject({
      method: 'POST',
      url: '/api/agent/build/progress',
      headers: agentHeaders(ISSUE, 1),
      payload: { text: 'Still building away.' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error).toBe(STALE_AGENT_TOKEN_REASON);
    expect(await store.listBuildEvents(ISSUE)).toHaveLength(0);
  });

  it('rejects a missing, malformed, or wrongly scoped token', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    app = await createApp(store);

    const payload = { text: 'hello' };
    const none = await app.inject({ method: 'POST', url: '/api/agent/build/progress', payload });
    expect(none.statusCode).toBe(401);

    const garbage = await app.inject({
      method: 'POST',
      url: '/api/agent/build/progress',
      headers: { authorization: 'Bearer not-a-token' },
      payload,
    });
    expect(garbage.statusCode).toBe(401);

    // A submission token is a *different* capability (it can spend quota and stop
    // the build). Presenting one here must not work, even for the same issue.
    const wrongScope = await app.inject({
      method: 'POST',
      url: '/api/agent/build/progress',
      headers: { authorization: `Bearer ${mintToken(ISSUE, secret)}` },
      payload,
    });
    expect(wrongScope.statusCode).toBe(401);
  });

  it('rejects a stale-generation or expired token with the fresh-prompt reason', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    app = await createApp(store);

    const stale = await app.inject({
      method: 'POST',
      url: '/api/agent/build/progress',
      headers: agentHeaders(ISSUE, 99),
      payload: { text: 'hello' },
    });
    expect(stale.statusCode).toBe(401);
    expect(stale.json().error).toBe(STALE_AGENT_TOKEN_REASON);

    const expired = mintAgentToken(ISSUE, secret, {
      roundGeneration: 1,
      now: Date.now() - 20 * 24 * 60 * 60 * 1000,
      ttlDays: 14,
    });
    const expiredRes = await app.inject({
      method: 'POST',
      url: '/api/agent/build/progress',
      headers: { authorization: `Bearer ${expired}` },
      payload: { text: 'hello' },
    });
    expect(expiredRes.statusCode).toBe(401);
    expect(expiredRes.json().error).toBe(STALE_AGENT_TOKEN_REASON);
  });

  it('rejects stale and expired tokens on terminal jobs with a strict 401 (no stopReason bypass)', async () => {
    // Regression for the rejected resolveBuild exception: publishedAt is permanent, so
    // letting a signature-valid stale/expired key through on stopReason would grant
    // indefinite source/inbox reads and unguarded inbox/ack writes.
    const store = new InMemoryStore();
    await seedSubmission(store);
    await store.setSubmissionPublishedAt(ISSUE, '2026-07-31T12:00:00.000Z');
    // Leave roundGeneration at 1 so a gen-99 key is clearly stale, not merely "closed".
    app = await createApp(store);

    const staleHeaders = agentHeaders(ISSUE, 99);
    for (const req of [
      { method: 'GET' as const, url: '/api/agent/build/sources' },
      { method: 'GET' as const, url: '/api/agent/build/inbox' },
      { method: 'GET' as const, url: '/api/agent/build/brief' },
      { method: 'GET' as const, url: '/api/agent/build/seed' },
      { method: 'GET' as const, url: '/api/agent/build/kit' },
      { method: 'GET' as const, url: '/api/agent/build/examples' },
      { method: 'POST' as const, url: '/api/agent/build/inbox/ack', payload: { ids: ['m1'] } },
      { method: 'POST' as const, url: '/api/agent/build/progress', payload: { text: 'hello' } },
    ]) {
      const res = await app.inject({
        method: req.method,
        url: req.url,
        headers: staleHeaders,
        ...(req.payload ? { payload: req.payload } : {}),
      });
      expect(res.statusCode, req.url).toBe(401);
      expect(res.json().error).toBe(STALE_AGENT_TOKEN_REASON);
    }

    const expired = mintAgentToken(ISSUE, secret, {
      roundGeneration: 1,
      now: Date.now() - 20 * 24 * 60 * 60 * 1000,
      ttlDays: 14,
    });
    const expiredSources = await app.inject({
      method: 'GET',
      url: '/api/agent/build/sources',
      headers: { authorization: `Bearer ${expired}` },
    });
    expect(expiredSources.statusCode).toBe(401);
    expect(expiredSources.json().error).toBe(STALE_AGENT_TOKEN_REASON);
  });

  it('still accepts a legacy token on a job that has never closed a round under the new model', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    // Simulate a pre-migration record: strip the generation new creates stamp.
    const legacy = await store.getSubmission(ISSUE);
    const submissions = (store as unknown as { submissions: Map<number, import('./store.js').SubmissionRecord> })
      .submissions;
    submissions.set(ISSUE, { ...legacy!, roundGeneration: undefined });

    app = await createApp(store);
    const response = await app.inject({
      method: 'POST',
      url: '/api/agent/build/progress',
      headers: { authorization: `Bearer ${mintLegacyAgentToken(ISSUE, secret)}` },
      payload: { kind: 'step', step: 'mechanics', text: 'Still the same round.' },
    });
    expect(response.statusCode).toBe(200);

    // Closing the round initializes generation; the legacy token must not revive.
    await store.recordJobTransition(ISSUE, {
      to: 'ready_for_review',
      at: '2026-07-31T12:00:00.000Z',
      by: 'gate',
      reason: 'gate_green',
    });
    expect((await store.getSubmission(ISSUE))?.roundGeneration).toBe(1);

    const afterClose = await app.inject({
      method: 'POST',
      url: '/api/agent/build/progress',
      headers: { authorization: `Bearer ${mintLegacyAgentToken(ISSUE, secret)}` },
      payload: { text: 'too late' },
    });
    expect(afterClose.statusCode).toBe(401);
    expect(afterClose.json().error).toBe(STALE_AGENT_TOKEN_REASON);
  });

  it('refuses a token for a build that does not exist', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    app = await createApp(store);

    const response = await app.inject({
      method: 'POST',
      url: '/api/agent/build/progress',
      headers: agentHeaders(999),
      payload: { text: 'hello' },
    });
    expect(response.statusCode).toBe(404);
  });

  it('caps how many events one build may record', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    app = await createApp(store, { maxEventsPerWindow: 2 });

    for (let index = 0; index < 2; index += 1) {
      const ok = await app.inject({
        method: 'POST',
        url: '/api/agent/build/progress',
        headers: agentHeaders(),
        payload: { text: `update ${index}` },
      });
      expect(ok.json().accepted).toBe(true);
    }

    const limited = await app.inject({
      method: 'POST',
      url: '/api/agent/build/progress',
      headers: agentHeaders(),
      payload: { text: 'one too many' },
    });
    // Still a 200 carrying the inbox: dropping the creator's request because the
    // agent is chatty would be the worst of both.
    expect(limited.json()).toMatchObject({ accepted: false, rejected: 'rate_limited' });
    expect(limited.json().pending).toEqual([]);
  });
  // A 1x1 PNG — the smallest payload that still carries a real PNG signature.
  const TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  it('stores a screenshot via signed PUT, lists it on status, and serves the bytes', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    app = await createApp(store);

    const minted = await app.inject({
      method: 'POST',
      url: '/api/agent/build/shot/upload-url',
      headers: agentHeaders(),
      payload: { label: 'First bridge' },
    });
    expect(minted.statusCode).toBe(200);
    expect(minted.json().accepted).toBe(true);
    const url = String(minted.json().url).replace(/^https?:\/\/[^/]+/, '');

    const pushed = await app.inject({
      method: 'PUT',
      url,
      headers: { 'content-type': 'image/png' },
      payload: Buffer.from(TINY_PNG, 'base64'),
    });
    expect(pushed.statusCode).toBe(200);
    expect(pushed.json().accepted).toBe(true);
    const shotId = pushed.json().shot.id as string;

    // No pull request exists in this fixture, so this is exactly the empty-page
    // stretch the channel is for: a picture with nothing committed anywhere.
    const token = mintToken(ISSUE, secret);
    const status = await app.inject({ method: 'GET', url: `/api/submissions/${token}` });
    expect(status.json().media).toEqual([
      expect.objectContaining({ source: 'channel', ref: shotId, label: 'First bridge' }),
    ]);

    const image = await app.inject({
      method: 'GET',
      url: `/api/submissions/${token}/shot/${shotId}`,
      headers: creatorHeaders(),
    });
    expect(image.statusCode).toBe(200);
    expect(image.headers['content-type']).toContain('image/png');
    expect(image.rawPayload.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  });

  it('mints a curl one-liner that sets Content-Type, because no parser claims a missing one', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    app = await createApp(store);

    const minted = await app.inject({
      method: 'POST',
      url: '/api/agent/build/shot/upload-url',
      headers: agentHeaders(),
      payload: {},
    });
    expect(minted.statusCode).toBe(200);
    const { url, upload, expiresAt, expiresInSeconds, maxBytes } = minted.json();
    expect(upload).toContain("-H 'Content-Type: image/png'");
    expect(typeof expiresAt).toBe('string');
    expect(typeof expiresInSeconds).toBe('number');
    expect(maxBytes).toBe(700 * 1024);
    // expiresAt must match the signed exp, not a second clock read.
    const token = new URL(String(url)).searchParams.get('token');
    const claims = verifyUploadToken(String(token), secret);
    expect(Math.floor(Date.parse(expiresAt) / 1000)).toBe(claims.exp);
    expect(expiresInSeconds).toBeGreaterThan(0);

    // Untyped body must not buffer — a '' parser hits everything.
    const untyped = await app.inject({
      method: 'PUT',
      url: String(url).replace(/^https?:\/\/[^/]+/, ''),
      payload: Buffer.from(TINY_PNG, 'base64'),
    });
    expect(untyped.statusCode).not.toBe(200);
  });

  it('retires base64 POST /shot and refuses a non-PNG PUT body', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    app = await createApp(store);

    const retired = await app.inject({
      method: 'POST',
      url: '/api/agent/build/shot',
      headers: agentHeaders(),
      payload: { png: TINY_PNG },
    });
    expect(retired.statusCode).toBe(410);
    expect(retired.json().error).toMatch(/retired|upload-url/i);

    const minted = await app.inject({
      method: 'POST',
      url: '/api/agent/build/shot/upload-url',
      headers: agentHeaders(),
      payload: {},
    });
    const url = String(minted.json().url).replace(/^https?:\/\/[^/]+/, '');
    const response = await app.inject({
      method: 'PUT',
      url,
      headers: { 'content-type': 'application/octet-stream' },
      payload: Buffer.from('<svg onload=alert(1)>'),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('not a PNG');
    expect(await store.countBuildShots(ISSUE)).toBe(0);
  });

  it('will not serve one build\u2019s screenshot to another build\u2019s token', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    await seedSubmission(store, 99);
    app = await createApp(store);

    const minted = await app.inject({
      method: 'POST',
      url: '/api/agent/build/shot/upload-url',
      headers: agentHeaders(),
      payload: {},
    });
    const url = String(minted.json().url).replace(/^https?:\/\/[^/]+/, '');
    const pushed = await app.inject({
      method: 'PUT',
      url,
      headers: { 'content-type': 'image/png' },
      payload: Buffer.from(TINY_PNG, 'base64'),
    });
    const shotId = pushed.json().shot.id as string;

    const stolen = await app.inject({
      method: 'GET',
      url: `/api/submissions/${mintToken(99, secret)}/shot/${shotId}`,
      headers: creatorHeaders(),
    });
    expect(stolen.statusCode).toBe(404);
  });

  const GAME_HTML = Buffer.from('<!doctype html><html><body><canvas id="game"></canvas></body></html>').toString(
    'base64',
  );

  it('stores a pushed playable build, lists it on the status response, and serves it', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    app = await createApp(store);

    const pushed = await app.inject({
      method: 'POST',
      url: '/api/agent/build/preview',
      headers: agentHeaders(),
      payload: { html: GAME_HTML, slug: 'puppy-stroll', label: 'You can walk the puppy now.' },
    });

    expect(pushed.statusCode).toBe(200);
    expect(pushed.json().accepted).toBe(true);
    const previewId = pushed.json().preview.id as string;

    const token = mintToken(ISSUE, secret);
    const status = await app.inject({ method: 'GET', url: `/api/submissions/${token}` });
    expect(status.json().playable).toEqual([
      expect.objectContaining({ ref: previewId, slug: 'puppy-stroll', label: 'You can walk the puppy now.' }),
    ]);

    const page = await app.inject({
      method: 'GET',
      url: `/api/submissions/${token}/preview/${previewId}`,
      headers: creatorHeaders(),
    });
    expect(page.statusCode).toBe(200);
    expect(page.headers['content-type']).toContain('text/html');
    expect(page.body).toContain('<canvas id="game">');
  });

  it('serves a preview sandboxed, uncacheable by shared caches, and unable to call home', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    app = await createApp(store);

    const pushed = await app.inject({
      method: 'POST',
      url: '/api/agent/build/preview',
      headers: agentHeaders(),
      payload: { html: GAME_HTML },
    });
    const token = mintToken(ISSUE, secret);
    const page = await app.inject({
      method: 'GET',
      url: `/api/submissions/${token}/preview/${pushed.json().preview.id}`,
      headers: creatorHeaders(),
    });

    // This document is unreviewed agent output executed in the creator's browser. Each
    // of these is load-bearing, so each is asserted rather than assumed.
    const csp = page.headers['content-security-policy'] as string;
    expect(csp).toContain('sandbox allow-scripts allow-pointer-lock');
    // Never granted: with it, the sandbox would share the site's origin and the
    // document could reach the creator's session.
    expect(csp).not.toContain('allow-same-origin');
    // A game bundle is offline by construction, so nothing legitimate needs the network.
    expect(csp).toContain("connect-src 'none'");
    expect(csp).toContain("form-action 'none'");
    // Deliberately absent: the web app may live on a different origin than the API
    // (VITE_API_BASE_URL), and frame-ancestors would block the status page from
    // framing its own preview in exactly those deployments.
    expect(csp).not.toContain('frame-ancestors');
    expect(page.headers['x-content-type-options']).toBe('nosniff');
    expect(page.headers['cache-control']).toContain('private');
  });

  it('refuses a payload that is not an HTML document', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    app = await createApp(store);

    const response = await app.inject({
      method: 'POST',
      url: '/api/agent/build/preview',
      headers: agentHeaders(),
      payload: { html: Buffer.from('GIF89a<script>alert(1)</script>').toString('base64') },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('not an HTML document');
    expect(await store.countBuildPreviews(ISSUE)).toBe(0);
  });

  it('keeps only the newest previews, because each one obsoletes the last', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    app = await createApp(store);

    for (let index = 0; index < 7; index++) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/agent/build/preview',
        headers: agentHeaders(),
        payload: { html: GAME_HTML, label: `build ${index}` },
      });
      expect(response.json().accepted).toBe(true);
    }

    // A watcher pushing every time the game recompiles would otherwise accumulate
    // hundreds of megabytes over one build.
    expect(await store.countBuildPreviews(ISSUE)).toBe(4);
    const newest = await store.listBuildPreviews(ISSUE);
    expect(newest[0]?.label).toBe('build 6');
  });

  it('will not serve one build’s playable preview to another build’s token', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    await seedSubmission(store, 99);
    app = await createApp(store);

    const pushed = await app.inject({
      method: 'POST',
      url: '/api/agent/build/preview',
      headers: agentHeaders(),
      payload: { html: GAME_HTML },
    });

    const stolen = await app.inject({
      method: 'GET',
      url: `/api/submissions/${mintToken(99, secret)}/preview/${pushed.json().preview.id}`,
      headers: creatorHeaders(),
    });
    expect(stolen.statusCode).toBe(404);
  });

  it('stops accepting previews once the creator has stopped the build', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    await store.setSubmissionAbandoned(ISSUE, new Date().toISOString());
    app = await createApp(store);

    const response = await app.inject({
      method: 'POST',
      url: '/api/agent/build/preview',
      headers: agentHeaders(),
      payload: { html: GAME_HTML },
    });

    expect(response.json()).toMatchObject({ accepted: false, rejected: 'stopped' });
    expect(await store.countBuildPreviews(ISSUE)).toBe(0);
  });

  /**
   * Delivery: the verb that replaces "open a pull request and wait for a merge".
   *
   * The interesting cases are all about not trusting the upload — the agent is working
   * from creator-authored text, so the request is treated as a claim to be checked rather
   * than an instruction to be carried out.
   */
  describe('POST /api/agent/build/sources', () => {
    const MINIMAL = [
      { path: 'SPEC.md', content: '---\ntitle: A game\n---\n' },
      { path: 'game.ts', content: 'export {};' },
      { path: 'TRACE.json', content: '{"samples":[]}' },
      { path: 'PLAYTEST.json', content: '{"expectProgress":["round-start"]}' },
      { path: 'AGENT.json', content: '{"policy":"capture"}' },
      // index.html is refused as an upload — GAME.json.howToPlay supplies markup instead.
      {
        path: 'GAME.json',
        content: JSON.stringify({
          engine: { modules: [] },
          howToPlay: { goal: { en: 'Survive', pl: 'Przetrwaj' }, hint: { en: 'Keep moving', pl: 'Nie stój' } },
        }),
      },
    ];

    function stubGamesStore() {
      const stored: Array<{
        slug: string;
        issueNumber: number;
        files: unknown[];
        kitEngineRef?: string;
        mode?: string;
        summary?: string;
      }> = [];
      const versionSummaries: Array<{ slug: string; version: string; summary: string }> = [];
      const staged = new Map<string, string>();
      const deletedPaths = new Set<string>();
      const stagedEntries = () => [
        ...[...staged.entries()].map(([path, content]) => ({ path, bytes: Buffer.byteLength(content, 'utf8') })),
        ...[...deletedPaths].map((path) => ({ path, bytes: 0, deleted: true as const })),
      ];
      const gamesStore = {
        putCandidateSources: async (input: {
          slug: string;
          issueNumber: number;
          files: unknown[];
          kitEngineRef?: string;
          mode?: 'preview' | 'publish';
          summary?: string;
        }) => {
          stored.push(input);
          const { validateSourceUpload } = await import('./games-store.js');
          validateSourceUpload(input.files as Array<{ path: string; content: string }>, input.mode ?? 'publish');
          return { version: 'v1', manifest: {} as never };
        },
        putStagedSourceFile: async (input: { path: string; content: string }) => {
          deletedPaths.delete(input.path);
          staged.set(input.path, input.content);
          const files = stagedEntries();
          return {
            path: input.path,
            bytes: Buffer.byteLength(input.content, 'utf8'),
            files,
            totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
            maxBytes: 2 * 1024 * 1024,
            maxFiles: 200,
            updatedAt: '2026-08-03T23:00:00.000Z',
          };
        },
        deleteStagedSourceFile: async (input: { path: string }) => {
          staged.delete(input.path);
          deletedPaths.add(input.path);
          const files = stagedEntries();
          return {
            path: input.path,
            files,
            totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
            maxBytes: 2 * 1024 * 1024,
            maxFiles: 200,
            updatedAt: '2026-08-03T23:00:00.000Z',
          };
        },
        listStagedSources: async () => {
          const files = stagedEntries();
          return {
            files,
            totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
            maxBytes: 2 * 1024 * 1024,
            maxFiles: 200,
            updatedAt: files.length ? '2026-08-03T23:00:00.000Z' : null,
          };
        },
        getStagedSourceFiles: async () => [
          ...[...staged.entries()].map(([path, content]) => ({ path, content })),
          ...[...deletedPaths].map((path) => ({ path, content: '', deleted: true as const })),
        ],
        getStagedSourceFile: async (input: { path: string }) =>
          deletedPaths.has(input.path) ? null : (staged.get(input.path) ?? null),
        clearStagedSources: async (input?: { paths?: string[] }) => {
          if (!input?.paths?.length) {
            const cleared = staged.size + deletedPaths.size;
            staged.clear();
            deletedPaths.clear();
            return { cleared };
          }
          let cleared = 0;
          for (const path of input.paths) {
            if (staged.delete(path)) cleared += 1;
            if (deletedPaths.delete(path)) cleared += 1;
          }
          return { cleared };
        },
        setVersionSummary: async (slug: string, version: string, summary: string) => {
          versionSummaries.push({ slug, version, summary });
        },
        getManifest: async () => null,
        getSourceFile: async () => null,
        putGateResult: async () => {},
        putPreviewGateResult: async () => {},
        putDerivedArtifact: async () => {},
        getDerivedArtifact: async () => null,
        getKitRegistry: async () => null,
      } as unknown as GamesStore;
      return { gamesStore, stored, staged, versionSummaries };
    }

    it('stores a delivered game as a candidate version', async () => {
      const store = new InMemoryStore();
      await seedSubmission(store);
      const { gamesStore, stored } = stubGamesStore();
      app = await createApp(store, { gamesStore });

      const response = await app.inject({
        method: 'POST',
        url: '/api/agent/build/sources',
        headers: agentHeaders(),
        payload: {
          slug: 'comet-courier',
          files: MINIMAL,
          kitEngineRef: 'abcdef1234567890',
        },
      });

      expect(response.json()).toMatchObject({ accepted: true, delivery: { slug: 'comet-courier', version: 'v1' } });
      expect(stored[0]).toMatchObject({
        slug: 'comet-courier',
        issueNumber: ISSUE,
        kitEngineRef: 'abcdef1234567890',
      });
    });

    it('rejects config-shaped filenames at the sources endpoint, naming the path', async () => {
      const store = new InMemoryStore();
      await seedSubmission(store);
      const { gamesStore } = stubGamesStore();
      app = await createApp(store, { gamesStore });

      const response = await app.inject({
        method: 'POST',
        url: '/api/agent/build/sources',
        headers: agentHeaders(),
        payload: {
          slug: 'comet-courier',
          files: [...MINIMAL, { path: 'package.json', content: '{}' }],
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toContain('package.json');
      expect(response.json().error).toMatch(/Config or executable-shaped/i);
    });

    it('refuses a fresh index.html riding along in a direct files[] submit', async () => {
      const store = new InMemoryStore();
      await seedSubmission(store);
      const { gamesStore, stored } = stubGamesStore();
      app = await createApp(store, { gamesStore });

      const response = await app.inject({
        method: 'POST',
        url: '/api/agent/build/sources',
        headers: agentHeaders(),
        payload: {
          slug: 'comet-courier',
          files: [...MINIMAL, { path: 'index.html', content: '<canvas id="game"></canvas>' }],
          kitEngineRef: 'abcdef1234567890',
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toMatch(/index\.html cannot be staged or patched/);
      // Refused before the store saw it, not after (stored stays empty).
      expect(stored).toEqual([]);
    });

    it('adopts the SPEC title so the shelf stops showing a truncated prompt', async () => {
      // The production example: submission title was prompt.slice(0, 40), SPEC said
      // "TV Tycoon". Publish already preferred the SPEC title for the catalog; the
      // shelf and studio kept the fragment until delivery wrote it back.
      const store = new InMemoryStore();
      await store.createSubmission(ISSUE, 'g:owner', 'A game tycoon like where I run a tv busi');
      await store.setSubmissionLocale(ISSUE, 'pl');
      const { gamesStore } = stubGamesStore();
      app = await createApp(store, { gamesStore });

      const files = MINIMAL.map((file) =>
        file.path === 'SPEC.md' ? { ...file, content: '---\ntitle: TV Tycoon\n---\n' } : file,
      );
      const response = await app.inject({
        method: 'POST',
        url: '/api/agent/build/sources',
        headers: agentHeaders(),
        payload: { slug: 'tv-tycoon', files },
      });

      expect(response.statusCode).toBe(200);
      expect((await store.getSubmission(ISSUE))?.title).toBe('TV Tycoon');
    });

    it('tells the agent the gate refused its delivery, and that it is not done', async () => {
      // The step an agent cannot see: the gate runs after the upload, in our container,
      // against our engine. A session that delivered and exited learned nothing, so the
      // report nobody read became the next round's starting point. It is carried on the
      // channel the agent is already polling, for the same reason `mustDeliver` is.
      const store = new InMemoryStore();
      await seedSubmission(store);
      await store.setSubmissionSlug(ISSUE, 'comet-courier');
      await store.setSubmissionDeliveredVersion(ISSUE, 'v1');
      const { gamesStore } = stubGamesStore();
      app = await createApp(store, {
        gamesStore: {
          ...gamesStore,
          getManifest: async () => ({
            gate: {
              green: false,
              ranAt: '2026-07-30T19:35:00Z',
              report: 'Check 26 failed: every control is pointer-driven',
            },
          }),
        } as unknown as GamesStore,
      });

      const response = await app.inject({ method: 'GET', url: '/api/agent/build/inbox', headers: agentHeaders() });

      expect(response.json()).toMatchObject({
        gate: { version: 'v1', green: false, report: 'Check 26 failed: every control is pointer-driven' },
      });
      expect(response.json().control.mustFixGate).toContain('not');
    });

    it('does not nudge a build whose gate passed', async () => {
      const store = new InMemoryStore();
      await seedSubmission(store);
      await store.setSubmissionSlug(ISSUE, 'comet-courier');
      await store.setSubmissionDeliveredVersion(ISSUE, 'v1');
      const { gamesStore } = stubGamesStore();
      app = await createApp(store, {
        gamesStore: {
          ...gamesStore,
          getManifest: async () => ({ gate: { green: true, ranAt: '2026-07-30T19:35:00Z' } }),
        } as unknown as GamesStore,
      });

      const response = await app.inject({ method: 'GET', url: '/api/agent/build/inbox', headers: agentHeaders() });

      expect(response.json()).toMatchObject({ gate: { green: true } });
      expect(response.json().control.mustFixGate).toBeUndefined();
    });

    it('prefers a newer preview verdict over a stale red publish', async () => {
      // Publish set deliveredVersion=v1 (and previewVersion=v1). A later mode=preview
      // only advances previewVersion — delivered-first would keep reporting the old red.
      const store = new InMemoryStore();
      await seedSubmission(store);
      await store.setSubmissionSlug(ISSUE, 'comet-courier');
      await store.setSubmissionDeliveredVersion(ISSUE, 'v1');
      await store.setSubmissionPreviewVersion(ISSUE, 'v2');
      const { gamesStore } = stubGamesStore();
      app = await createApp(store, {
        gamesStore: {
          ...gamesStore,
          getManifest: async (_slug: string, version: string) => {
            if (version === 'v2') {
              return {
                previewGate: {
                  green: false,
                  ranAt: '2026-08-03T22:00:00Z',
                  report: 'typecheck failed: missing export',
                },
              };
            }
            return {
              gate: {
                green: false,
                ranAt: '2026-08-03T21:00:00Z',
                report: 'trace stage refused: TRACE.json missing',
              },
            };
          },
        } as unknown as GamesStore,
      });

      const response = await app.inject({ method: 'GET', url: '/api/agent/build/inbox', headers: agentHeaders() });

      expect(response.json()).toMatchObject({
        gate: {
          version: 'v2',
          lane: 'preview',
          status: 'preview_failed',
          report: 'typecheck failed: missing export',
        },
      });
      expect(response.json().control.mustFixGate).toMatch(/mode=preview/);
    });

    it('surfaces kit_outdated from a preview-lane check', async () => {
      const store = new InMemoryStore();
      await seedSubmission(store);
      await store.setSubmissionSlug(ISSUE, 'comet-courier');
      await store.setSubmissionPreviewVersion(ISSUE, 'v1');
      const { gamesStore } = stubGamesStore();
      app = await createApp(store, {
        gamesStore: {
          ...gamesStore,
          getManifest: async () => ({
            previewGate: {
              green: false,
              ranAt: '2026-08-03T22:00:00Z',
              report: 'kitEngineRef outside supported window',
              status: 'kit_outdated',
            },
          }),
        } as unknown as GamesStore,
      });

      const response = await app.inject({ method: 'GET', url: '/api/agent/build/inbox', headers: agentHeaders() });

      expect(response.json()).toMatchObject({
        gate: { version: 'v1', lane: 'preview', status: 'kit_outdated' },
      });
      expect(response.json().control.mustFixGate).toMatch(/kit_outdated|Creator Kit/i);
    });

    it('keeps the channel working when the gate verdict cannot be read', async () => {
      // The channel is how an agent reports progress and reads its creator's messages.
      // A store that will not answer must cost it the verdict, not both.
      const store = new InMemoryStore();
      await seedSubmission(store);
      await store.setSubmissionSlug(ISSUE, 'comet-courier');
      await store.setSubmissionDeliveredVersion(ISSUE, 'v1');
      const { gamesStore } = stubGamesStore();
      app = await createApp(store, {
        gamesStore: {
          ...gamesStore,
          getManifest: async () => {
            throw new Error('games store read failed: 503');
          },
        } as unknown as GamesStore,
      });

      const response = await app.inject({ method: 'GET', url: '/api/agent/build/inbox', headers: agentHeaders() });

      expect(response.statusCode).toBe(200);
      expect(response.json().gate).toBeUndefined();
    });

    it('refuses a delivery aimed at a different game than the job owns', async () => {
      // The token is minted per job. An agent that has been associated with one game must
      // not be able to write into another game's history by asking to.
      const store = new InMemoryStore();
      await seedSubmission(store);
      await store.setSubmissionSlug(ISSUE, 'comet-courier');
      const { gamesStore, stored } = stubGamesStore();
      app = await createApp(store, { gamesStore });

      const response = await app.inject({
        method: 'POST',
        url: '/api/agent/build/sources',
        headers: agentHeaders(),
        payload: { slug: 'someone-elses-game', files: MINIMAL },
      });

      expect(response.statusCode).toBe(409);
      expect(stored).toHaveLength(0);
    });

    it('binds the job to the first slug it delivers, so a later one cannot switch games', async () => {
      // The test above seeds the slug, which is the case where the job already knows
      // what it is building. This is the case that does not: a job dispatched without a
      // slug learns it from its first delivery, and if that is never persisted the
      // check above can never fire — every delivery would find the job unbound and be
      // free to name a different game.
      const store = new InMemoryStore();
      await seedSubmission(store);
      const { gamesStore, stored } = stubGamesStore();
      app = await createApp(store, { gamesStore });

      const first = await app.inject({
        method: 'POST',
        url: '/api/agent/build/sources',
        headers: agentHeaders(),
        payload: { slug: 'comet-courier', files: MINIMAL },
      });
      expect(first.json()).toMatchObject({ accepted: true });
      expect((await store.getSubmission(ISSUE))?.slug).toBe('comet-courier');

      const second = await app.inject({
        method: 'POST',
        url: '/api/agent/build/sources',
        headers: agentHeaders(),
        payload: { slug: 'someone-elses-game', files: MINIMAL },
      });

      expect(second.statusCode).toBe(409);
      expect(stored).toHaveLength(1);
    });

    it('explains a rejected path instead of failing opaquely', async () => {
      const store = new InMemoryStore();
      await seedSubmission(store);
      const { gamesStore } = stubGamesStore();
      app = await createApp(store, { gamesStore });

      const response = await app.inject({
        method: 'POST',
        url: '/api/agent/build/sources',
        headers: agentHeaders(),
        payload: { slug: 'g', files: [...MINIMAL, { path: 'shared/modules/core.ts', content: 'x' }] },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toMatch(/belongs to the harness/);
    });

    it('requires a credential like every other channel verb', async () => {
      const store = new InMemoryStore();
      await seedSubmission(store);
      const { gamesStore } = stubGamesStore();
      app = await createApp(store, { gamesStore });

      const response = await app.inject({
        method: 'POST',
        url: '/api/agent/build/sources',
        payload: { slug: 'g', files: MINIMAL },
      });

      expect(response.statusCode).toBe(401);
    });

    it('stops accepting deliveries once the creator has stopped the build', async () => {
      const store = new InMemoryStore();
      await seedSubmission(store);
      await store.setSubmissionAbandoned(ISSUE, new Date().toISOString());
      const { gamesStore, stored } = stubGamesStore();
      app = await createApp(store, { gamesStore });

      const response = await app.inject({
        method: 'POST',
        url: '/api/agent/build/sources',
        headers: agentHeaders(),
        payload: { slug: 'g', files: MINIMAL },
      });

      expect(response.json()).toMatchObject({ accepted: false, rejected: 'stopped' });
      expect(stored).toHaveLength(0);
    });

    it('says so plainly when delivery is not configured', async () => {
      // Local development has no bucket. Reporting unavailability beats accepting work
      // and silently dropping it.
      const store = new InMemoryStore();
      await seedSubmission(store);
      app = await createApp(store);

      const response = await app.inject({
        method: 'POST',
        url: '/api/agent/build/sources',
        headers: agentHeaders(),
        payload: { slug: 'g', files: MINIMAL },
      });

      expect(response.statusCode).toBe(503);
    });

    it('notifies the job so the gate can pick the candidate up', async () => {
      const store = new InMemoryStore();
      await seedSubmission(store);
      const { gamesStore } = stubGamesStore();
      const delivered: Array<{ slug: string; version: string; mode?: string }> = [];
      app = await createApp(store, { gamesStore });
      // Re-create with the hook wired, since createApp builds options once.
      await app.close();
      app = await buildApp({
        store,
        sessionSecret,
        submissionRoutes: {
          githubClient: stubGitHub(),
          githubToken: 'gh-token',
          submissionTokenSecret: secret,
          agentChannel: {
            gamesStore,
            onSourcesDelivered: ({ slug, version, mode }) => {
              delivered.push({ slug, version, ...(mode ? { mode } : {}) });
            },
          },
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/agent/build/sources',
        headers: agentHeaders(),
        payload: { slug: 'comet-courier', files: MINIMAL },
      });

      expect(delivered).toEqual([{ slug: 'comet-courier', version: 'v1' }]);
      // Hook returned void — delivery accepted, but no Cloud Build id.
      expect(response.json()).toMatchObject({ accepted: true, gateStarted: false });
      expect(response.json().buildId).toBeUndefined();
    });

    it('reports gateStarted when Cloud Build accepted the create', async () => {
      const store = new InMemoryStore();
      await seedSubmission(store);
      const { gamesStore } = stubGamesStore();
      app = await buildApp({
        store,
        sessionSecret,
        submissionRoutes: {
          githubClient: stubGitHub(),
          githubToken: 'gh-token',
          submissionTokenSecret: secret,
          agentChannel: {
            gamesStore,
            onSourcesDelivered: async () => ({ buildId: 'projects/x/builds/abc' }),
          },
        },
      });

      const withGate = await app.inject({
        method: 'POST',
        url: '/api/agent/build/sources',
        headers: agentHeaders(),
        payload: { slug: 'comet-courier', files: MINIMAL, mode: 'preview' },
      });
      expect(withGate.statusCode).toBe(200);
      expect(withGate.json()).toMatchObject({
        accepted: true,
        gateStarted: true,
        buildId: 'projects/x/builds/abc',
      });

      await app.close();
      app = await buildApp({
        store,
        sessionSecret,
        submissionRoutes: {
          githubClient: stubGitHub(),
          githubToken: 'gh-token',
          submissionTokenSecret: secret,
          agentChannel: {
            gamesStore,
            // 2xx without a parseable build id — still started, do not advise retry.
            onSourcesDelivered: async () => ({ accepted: true }),
          },
        },
      });

      const acceptedNoId = await app.inject({
        method: 'POST',
        url: '/api/agent/build/sources',
        headers: agentHeaders(),
        payload: {
          slug: 'comet-courier',
          files: MINIMAL.map((f) =>
            f.path === 'SPEC.md' ? { ...f, content: '---\ntitle: Comet Courier\n---\nv2\n' } : f,
          ),
          mode: 'preview',
        },
      });
      expect(acceptedNoId.statusCode).toBe(200);
      expect(acceptedNoId.json()).toMatchObject({ accepted: true, gateStarted: true });
      expect(acceptedNoId.json().buildId).toBeUndefined();
    });

    it('preview mode accepts TRACE-less drafts and does not seal deliveredVersion', async () => {
      const store = new InMemoryStore();
      await seedSubmission(store);
      const { gamesStore, stored } = stubGamesStore();
      const delivered: Array<{ mode?: string }> = [];
      app = await buildApp({
        store,
        sessionSecret,
        submissionRoutes: {
          githubClient: stubGitHub(),
          githubToken: 'gh-token',
          submissionTokenSecret: secret,
          agentChannel: {
            gamesStore,
            onSourcesDelivered: (input) => {
              delivered.push({ mode: input.mode });
            },
          },
        },
      });

      const draft = MINIMAL.filter((f) => f.path !== 'TRACE.json' && f.path !== 'PLAYTEST.json');
      const response = await app.inject({
        method: 'POST',
        url: '/api/agent/build/sources',
        headers: agentHeaders(),
        payload: {
          slug: 'comet-courier',
          files: draft,
          kitEngineRef: 'abcdef1234567890',
          mode: 'preview',
        },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ accepted: true, mode: 'preview' });
      expect(stored[0]?.mode).toBe('preview');
      expect(delivered).toEqual([{ mode: 'preview' }]);

      const record = await store.getSubmission(ISSUE);
      expect(record?.previewVersion).toBe('v1');
      expect(record?.deliveredVersion).toBeUndefined();
      expect(record?.state).not.toBe('submitted');
    });

    it('stages files one-by-one and finalizes with fromStaged', async () => {
      const store = new InMemoryStore();
      await seedSubmission(store);
      const { gamesStore, stored, staged } = stubGamesStore();
      app = await createApp(store, { gamesStore });

      const draft = MINIMAL.filter((f) => f.path !== 'TRACE.json' && f.path !== 'PLAYTEST.json');
      for (const file of draft) {
        const stagedRes = await app.inject({
          method: 'PUT',
          url: '/api/agent/build/sources/stage',
          headers: agentHeaders(),
          payload: { slug: 'comet-courier', path: file.path, content: file.content },
        });
        expect(stagedRes.statusCode).toBe(200);
        expect(stagedRes.json()).toMatchObject({ accepted: true, path: file.path });
      }
      // Staging must refresh the quiet clock — otherwise a long stage_source_file loop
      // looks offline and Studio offers a platform handoff mid-upload.
      const afterStage = await store.getSubmission(ISSUE);
      expect(afterStage?.lastAgentSignalAt).toBeTruthy();
      expect(afterStage?.lastAgentPresence?.key).toBe('staging_sources');
      expect(afterStage?.state).toBe('building');

      const listed = await app.inject({
        method: 'GET',
        url: '/api/agent/build/sources/stage',
        headers: agentHeaders(),
      });
      expect(
        listed
          .json()
          .files.map((f: { path: string }) => f.path)
          .sort(),
      ).toEqual(draft.map((f) => f.path).sort());

      const response = await app.inject({
        method: 'POST',
        url: '/api/agent/build/sources',
        headers: agentHeaders(),
        payload: {
          slug: 'comet-courier',
          fromStaged: true,
          kitEngineRef: 'abcdef1234567890',
          mode: 'preview',
        },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ accepted: true, mode: 'preview' });
      expect(stored[0]?.mode).toBe('preview');
      expect((stored[0]?.files as Array<{ path: string }>).map((f) => f.path).sort()).toEqual(
        draft.map((f) => f.path).sort(),
      );
      // Finalize clears the buffer so the next iterate starts clean.
      expect(staged.size).toBe(0);
    });

    it('patches a delivery file into staging and fromStaged overlays the rest', async () => {
      const store = new InMemoryStore();
      await seedSubmission(store);
      await store.setSubmissionSlug(ISSUE, 'comet-courier');
      await store.setSubmissionPreviewVersion(ISSUE, 'v1');
      const { gamesStore, stored, staged } = stubGamesStore();
      const delivered: Record<string, string> = Object.fromEntries(
        MINIMAL.filter((f) => f.path !== 'TRACE.json' && f.path !== 'PLAYTEST.json').map((f) => [f.path, f.content]),
      );
      delivered['game/render.ts'] = 'export function paint() {\n  drawSky();\n}\n';
      app = await createApp(store, {
        gamesStore: {
          ...gamesStore,
          getManifest: async () => ({ sourceFiles: Object.keys(delivered) }),
          getSourceFile: async (_slug: string, _version: string, path: string) => delivered[path] ?? null,
        } as unknown as GamesStore,
      });

      const patched = await app.inject({
        method: 'POST',
        url: '/api/agent/build/sources/stage/patch',
        headers: agentHeaders(),
        payload: {
          path: 'game/render.ts',
          patch: [
            '--- a/game/render.ts',
            '+++ b/game/render.ts',
            '@@ -1,3 +1,4 @@',
            ' export function paint() {',
            '   drawSky();',
            '+  drawHud();',
            ' }',
            '',
          ].join('\n'),
        },
      });
      expect(patched.statusCode).toBe(200);
      expect(patched.json()).toMatchObject({
        accepted: true,
        path: 'game/render.ts',
        replacements: 1,
        baseFrom: 'delivery',
      });
      expect(staged.get('game/render.ts')).toContain('drawHud()');
      expect(staged.size).toBe(1);

      const response = await app.inject({
        method: 'POST',
        url: '/api/agent/build/sources',
        headers: agentHeaders(),
        payload: {
          slug: 'comet-courier',
          fromStaged: true,
          kitEngineRef: 'abcdef1234567890',
          mode: 'preview',
        },
      });
      expect(response.statusCode).toBe(200);
      const files = stored[0]?.files as Array<{ path: string; content: string }>;
      expect(files.find((f) => f.path === 'game/render.ts')?.content).toContain('drawHud()');
      expect(files.find((f) => f.path === 'game.ts')?.content).toBe(delivered['game.ts']);
      expect(staged.size).toBe(0);
    });

    it('delete_source_file drops a path from the next fromStaged delivery entirely', async () => {
      const store = new InMemoryStore();
      await seedSubmission(store);
      await store.setSubmissionSlug(ISSUE, 'comet-courier');
      await store.setSubmissionPreviewVersion(ISSUE, 'v1');
      const { gamesStore, stored } = stubGamesStore();
      const delivered: Record<string, string> = Object.fromEntries(
        MINIMAL.filter((f) => f.path !== 'TRACE.json' && f.path !== 'PLAYTEST.json').map((f) => [f.path, f.content]),
      );
      delivered['game/old-module.ts'] = 'export const dead = 1;';
      app = await createApp(store, {
        gamesStore: {
          ...gamesStore,
          getManifest: async () => ({ sourceFiles: Object.keys(delivered) }),
          getSourceFile: async (_slug: string, _version: string, path: string) => delivered[path] ?? null,
        } as unknown as GamesStore,
      });

      const deleted = await app.inject({
        method: 'POST',
        url: '/api/agent/build/sources/stage/delete',
        headers: agentHeaders(),
        payload: { path: 'game/old-module.ts' },
      });
      expect(deleted.statusCode).toBe(200);
      expect(deleted.json()).toMatchObject({ accepted: true, path: 'game/old-module.ts' });

      const response = await app.inject({
        method: 'POST',
        url: '/api/agent/build/sources',
        headers: agentHeaders(),
        payload: {
          slug: 'comet-courier',
          fromStaged: true,
          kitEngineRef: 'abcdef1234567890',
          mode: 'preview',
        },
      });
      expect(response.statusCode).toBe(200);
      const files = stored[0]?.files as Array<{ path: string; content: string }>;
      // Dropped entirely — not delivered as a live empty file.
      expect(files.find((f) => f.path === 'game/old-module.ts')).toBeUndefined();
      expect(files.find((f) => f.path === 'game.ts')?.content).toBe(delivered['game.ts']);
    });

    it('propagates summary changelog to candidate sources on submit_sources', async () => {
      const store = new InMemoryStore();
      await seedSubmission(store);
      const { gamesStore, stored } = stubGamesStore();
      app = await createApp(store, { gamesStore });

      const response = await app.inject({
        method: 'POST',
        url: '/api/agent/build/sources',
        headers: agentHeaders(),
        payload: {
          slug: 'comet-courier',
          files: MINIMAL,
          mode: 'publish',
          summary: 'Fix collisions and audio bugs',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(stored[0]).toMatchObject({
        summary: 'Fix collisions and audio bugs',
      });
    });

    it('derives a changelog from the latest progress when submit omits summary', async () => {
      const store = new InMemoryStore();
      await seedSubmission(store);
      const { gamesStore, stored } = stubGamesStore();
      app = await createApp(store, { gamesStore });

      await app.inject({
        method: 'POST',
        url: '/api/agent/build/progress',
        headers: agentHeaders(),
        payload: { kind: 'step', text: 'Tuned jump height and landing lag.' },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/agent/build/sources',
        headers: agentHeaders(),
        payload: {
          slug: 'comet-courier',
          files: MINIMAL,
          mode: 'publish',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(stored[0]).toMatchObject({
        summary: 'Tuned jump height and landing lag.',
      });
    });

    it('writes the closing end summary onto the latest version', async () => {
      const store = new InMemoryStore();
      await seedSubmission(store);
      await store.setSubmissionSlug(ISSUE, 'comet-courier');
      await store.setSubmissionPreviewVersion(ISSUE, 'v1');
      const { gamesStore, versionSummaries } = stubGamesStore();
      app = await createApp(store, { gamesStore });

      const response = await app.inject({
        method: 'POST',
        url: '/api/agent/build/end',
        headers: agentHeaders(),
        payload: { summary: 'Jump feels tighter and the HUD is readable.' },
      });

      expect(response.statusCode).toBe(200);
      expect(versionSummaries).toEqual([
        { slug: 'comet-courier', version: 'v1', summary: 'Jump feels tighter and the HUD is readable.' },
      ]);
    });

    it('accepts old+new exact replace without a unified diff', async () => {
      const store = new InMemoryStore();
      await seedSubmission(store);
      const { gamesStore, staged } = stubGamesStore();
      app = await createApp(store, { gamesStore });

      await app.inject({
        method: 'PUT',
        url: '/api/agent/build/sources/stage',
        headers: agentHeaders(),
        payload: {
          slug: 'comet-courier',
          path: 'game/render.ts',
          content: 'export function paint() {\n  drawSky();\n}\n',
        },
      });

      const patched = await app.inject({
        method: 'POST',
        url: '/api/agent/build/sources/stage/patch',
        headers: agentHeaders(),
        payload: {
          path: 'game/render.ts',
          old: '  drawSky();\n',
          new: '  drawSky();\n  drawHud();\n',
        },
      });
      expect(patched.statusCode).toBe(200);
      expect(patched.json()).toMatchObject({ accepted: true, replacements: 1, baseFrom: 'staged' });
      expect(staged.get('game/render.ts')).toContain('drawHud()');
    });

    it('patches several files in one call via files[]', async () => {
      const store = new InMemoryStore();
      await seedSubmission(store);
      const { gamesStore, staged } = stubGamesStore();
      app = await createApp(store, { gamesStore });

      await app.inject({
        method: 'PUT',
        url: '/api/agent/build/sources/stage',
        headers: agentHeaders(),
        payload: {
          slug: 'comet-courier',
          path: 'game/render.ts',
          content: 'export function paint() {\n  drawSky();\n}\n',
        },
      });
      await app.inject({
        method: 'PUT',
        url: '/api/agent/build/sources/stage',
        headers: agentHeaders(),
        payload: {
          slug: 'comet-courier',
          path: 'game/sim.ts',
          content: 'export const SPEED = 4;\nexport const LIVES = 3;\n',
        },
      });

      const patched = await app.inject({
        method: 'POST',
        url: '/api/agent/build/sources/stage/patch',
        headers: agentHeaders(),
        payload: {
          files: [
            { path: 'game/render.ts', old: '  drawSky();\n', new: '  drawSky();\n  drawHud();\n' },
            {
              path: 'game/sim.ts',
              patches: [
                { old: 'SPEED = 4', new: 'SPEED = 6' },
                { old: 'LIVES = 3', new: 'LIVES = 5' },
              ],
            },
          ],
        },
      });
      expect(patched.statusCode).toBe(200);
      expect(patched.json()).toMatchObject({
        accepted: true,
        replacements: 3,
        path: 'game/render.ts',
        files: [
          { path: 'game/render.ts', replacements: 1, baseFrom: 'staged' },
          { path: 'game/sim.ts', replacements: 2, baseFrom: 'staged' },
        ],
      });
      expect(staged.get('game/render.ts')).toContain('drawHud()');
      expect(staged.get('game/sim.ts')).toBe('export const SPEED = 6;\nexport const LIVES = 5;\n');
    });

    it('keeps successful files[] edits and reports the ones that missed', async () => {
      const store = new InMemoryStore();
      await seedSubmission(store);
      const { gamesStore, staged } = stubGamesStore();
      app = await createApp(store, { gamesStore });

      await app.inject({
        method: 'PUT',
        url: '/api/agent/build/sources/stage',
        headers: agentHeaders(),
        payload: {
          slug: 'comet-courier',
          path: 'game/render.ts',
          content: 'export function paint() {\n  drawSky();\n}\n',
        },
      });
      await app.inject({
        method: 'PUT',
        url: '/api/agent/build/sources/stage',
        headers: agentHeaders(),
        payload: {
          slug: 'comet-courier',
          path: 'game/sim.ts',
          content: 'export const SPEED = 4;\n',
        },
      });

      const patched = await app.inject({
        method: 'POST',
        url: '/api/agent/build/sources/stage/patch',
        headers: agentHeaders(),
        payload: {
          files: [
            { path: 'game/render.ts', old: '  drawSky();\n', new: '  drawHud();\n' },
            { path: 'game/sim.ts', old: 'missing snippet', new: 'x' },
          ],
        },
      });
      expect(patched.statusCode).toBe(200);
      expect(patched.json()).toMatchObject({
        accepted: true,
        incomplete: true,
        replacements: 1,
        files: [{ path: 'game/render.ts', replacements: 1 }],
        failed: [{ path: 'game/sim.ts', index: 0 }],
      });
      expect(patched.json().failed[0].error).toMatch(/not found in game\/sim\.ts/);
      expect(staged.get('game/render.ts')).toContain('drawHud()');
      expect(staged.get('game/sim.ts')).toBe('export const SPEED = 4;\n');
    });

    it('keeps earlier patches[] on a file when a later fragment misses', async () => {
      const store = new InMemoryStore();
      await seedSubmission(store);
      const { gamesStore, staged } = stubGamesStore();
      app = await createApp(store, { gamesStore });

      await app.inject({
        method: 'PUT',
        url: '/api/agent/build/sources/stage',
        headers: agentHeaders(),
        payload: {
          slug: 'comet-courier',
          path: 'game/sim.ts',
          content: 'export const SPEED = 4;\nexport const LIVES = 3;\nexport const FUEL = 9;\n',
        },
      });

      const patched = await app.inject({
        method: 'POST',
        url: '/api/agent/build/sources/stage/patch',
        headers: agentHeaders(),
        payload: {
          path: 'game/sim.ts',
          patches: [
            { old: 'SPEED = 4', new: 'SPEED = 6' },
            { old: 'missing snippet', new: 'x' },
            { old: 'FUEL = 9', new: 'FUEL = 1' },
          ],
        },
      });
      expect(patched.statusCode).toBe(200);
      expect(patched.json()).toMatchObject({
        accepted: true,
        incomplete: true,
        replacements: 2,
        failed: [{ path: 'game/sim.ts', index: 1 }],
      });
      expect(staged.get('game/sim.ts')).toBe(
        'export const SPEED = 6;\nexport const LIVES = 3;\nexport const FUEL = 1;\n',
      );
    });

    it('returns 400 with failed[] when no edit in the batch applied', async () => {
      const store = new InMemoryStore();
      await seedSubmission(store);
      const { gamesStore, staged } = stubGamesStore();
      app = await createApp(store, { gamesStore });

      await app.inject({
        method: 'PUT',
        url: '/api/agent/build/sources/stage',
        headers: agentHeaders(),
        payload: {
          slug: 'comet-courier',
          path: 'game/sim.ts',
          content: 'export const SPEED = 4;\n',
        },
      });

      const patched = await app.inject({
        method: 'POST',
        url: '/api/agent/build/sources/stage/patch',
        headers: agentHeaders(),
        payload: {
          files: [
            { path: 'game/sim.ts', old: 'missing one', new: 'x' },
            { path: 'game/missing.ts', old: 'also missing', new: 'y' },
          ],
        },
      });
      expect(patched.statusCode).toBe(400);
      expect(patched.json()).toMatchObject({
        accepted: false,
        replacements: 0,
        failed: [
          { path: 'game/sim.ts', index: 0 },
          { path: 'game/missing.ts', index: 0 },
        ],
      });
      expect(staged.get('game/sim.ts')).toBe('export const SPEED = 4;\n');
    });

    it('reports every applied index when staging a patched file is refused', async () => {
      const store = new InMemoryStore();
      await seedSubmission(store);
      const { gamesStore, staged } = stubGamesStore();
      const put = gamesStore.putStagedSourceFile.bind(gamesStore);
      gamesStore.putStagedSourceFile = async (input: { path: string; content: string }) => {
        if (input.path === 'game/sim.ts' && input.content.includes('SPEED = 6')) {
          throw new InvalidUploadError('game/sim.ts is too large');
        }
        return put(input);
      };
      app = await createApp(store, { gamesStore });

      await app.inject({
        method: 'PUT',
        url: '/api/agent/build/sources/stage',
        headers: agentHeaders(),
        payload: {
          slug: 'comet-courier',
          path: 'game/render.ts',
          content: 'export function paint() {\n  drawSky();\n}\n',
        },
      });
      await app.inject({
        method: 'PUT',
        url: '/api/agent/build/sources/stage',
        headers: agentHeaders(),
        payload: {
          slug: 'comet-courier',
          path: 'game/sim.ts',
          content: 'export const SPEED = 4;\nexport const LIVES = 3;\n',
        },
      });

      const patched = await app.inject({
        method: 'POST',
        url: '/api/agent/build/sources/stage/patch',
        headers: agentHeaders(),
        payload: {
          files: [
            { path: 'game/render.ts', old: '  drawSky();\n', new: '  drawHud();\n' },
            {
              path: 'game/sim.ts',
              patches: [
                { old: 'SPEED = 4', new: 'SPEED = 6' },
                { old: 'LIVES = 3', new: 'LIVES = 5' },
              ],
            },
          ],
        },
      });
      expect(patched.statusCode).toBe(200);
      expect(patched.json()).toMatchObject({
        accepted: true,
        incomplete: true,
        replacements: 1,
        files: [{ path: 'game/render.ts', replacements: 1 }],
        failed: [
          { path: 'game/sim.ts', index: 0 },
          { path: 'game/sim.ts', index: 1 },
        ],
      });
      expect(staged.get('game/render.ts')).toContain('drawHud()');
      expect(staged.get('game/sim.ts')).toBe('export const SPEED = 4;\nexport const LIVES = 3;\n');
    });

    it('refuses files[] mixed with a top-level path', async () => {
      const store = new InMemoryStore();
      await seedSubmission(store);
      const { gamesStore } = stubGamesStore();
      app = await createApp(store, { gamesStore });

      const patched = await app.inject({
        method: 'POST',
        url: '/api/agent/build/sources/stage/patch',
        headers: agentHeaders(),
        payload: {
          path: 'game/render.ts',
          old: 'a',
          new: 'b',
          files: [{ path: 'game/sim.ts', old: 'c', new: 'd' }],
        },
      });
      expect(patched.statusCode).toBe(400);
      expect(patched.json().error).toMatch(/files\[\] alone/);
    });

    it('accepts a bare @@ patch (no line numbers) matched by context', async () => {
      const store = new InMemoryStore();
      await seedSubmission(store);
      const { gamesStore, staged } = stubGamesStore();
      app = await createApp(store, { gamesStore });

      await app.inject({
        method: 'PUT',
        url: '/api/agent/build/sources/stage',
        headers: agentHeaders(),
        payload: {
          slug: 'comet-courier',
          path: 'game/render.ts',
          content: 'export function paint() {\n  drawSky();\n}\n',
        },
      });

      const patched = await app.inject({
        method: 'POST',
        url: '/api/agent/build/sources/stage/patch',
        headers: agentHeaders(),
        payload: {
          path: 'game/render.ts',
          patch: [
            '--- a/game/render.ts',
            '+++ b/game/render.ts',
            '@@',
            ' export function paint() {',
            '   drawSky();',
            '+  drawHud();',
            ' }',
            '',
          ].join('\n'),
        },
      });
      expect(patched.statusCode).toBe(200);
      expect(patched.json()).toMatchObject({ accepted: true, replacements: 1, baseFrom: 'staged' });
      expect(staged.get('game/render.ts')).toContain('drawHud()');
    });

    it('fromStaged fails closed when the delivery manifest lists unreadable paths', async () => {
      const store = new InMemoryStore();
      await seedSubmission(store);
      await store.setSubmissionSlug(ISSUE, 'comet-courier');
      await store.setSubmissionPreviewVersion(ISSUE, 'v1');
      const { gamesStore, stored, staged } = stubGamesStore();
      app = await createApp(store, {
        gamesStore: {
          ...gamesStore,
          getManifest: async () => ({ sourceFiles: ['game.ts', 'SPEC.md', 'index.html'] }),
          getSourceFile: async (_slug: string, _version: string, path: string) =>
            path === 'game.ts' ? 'export {};' : null,
        } as unknown as GamesStore,
      });

      await app.inject({
        method: 'PUT',
        url: '/api/agent/build/sources/stage',
        headers: agentHeaders(),
        payload: { slug: 'comet-courier', path: 'game.ts', content: 'export const fixed = 1;' },
      });
      expect(staged.size).toBe(1);

      const response = await app.inject({
        method: 'POST',
        url: '/api/agent/build/sources',
        headers: agentHeaders(),
        payload: {
          slug: 'comet-courier',
          fromStaged: true,
          kitEngineRef: 'abcdef1234567890',
          mode: 'preview',
        },
      });
      expect(response.statusCode).toBe(502);
      expect(response.json().error).toMatch(/could not be read back/i);
      expect(stored).toHaveLength(0);
    });

    it('refuses a whitespace-only patch before apply', async () => {
      const store = new InMemoryStore();
      await seedSubmission(store);
      const { gamesStore } = stubGamesStore();
      app = await createApp(store, { gamesStore });

      await app.inject({
        method: 'PUT',
        url: '/api/agent/build/sources/stage',
        headers: agentHeaders(),
        payload: { slug: 'comet-courier', path: 'game.ts', content: 'line1\n' },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/agent/build/sources/stage/patch',
        headers: agentHeaders(),
        payload: { path: 'game.ts', patch: '   \n\t  ' },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error).toMatch(/empty|patch/i);
    });

    it('refuses a unified diff that does not apply or targets the wrong path', async () => {
      const store = new InMemoryStore();
      await seedSubmission(store);
      const { gamesStore, staged } = stubGamesStore();
      app = await createApp(store, { gamesStore });

      await app.inject({
        method: 'PUT',
        url: '/api/agent/build/sources/stage',
        headers: agentHeaders(),
        payload: { slug: 'comet-courier', path: 'game.ts', content: 'line1\nline2\n' },
      });

      const stale = await app.inject({
        method: 'POST',
        url: '/api/agent/build/sources/stage/patch',
        headers: agentHeaders(),
        payload: {
          path: 'game.ts',
          patch: ['--- a/game.ts', '+++ b/game.ts', '@@ -1,2 +1,2 @@', ' missing', '-line2', '+line2x', ''].join('\n'),
        },
      });
      expect(stale.statusCode).toBe(400);
      expect(stale.json().error).toMatch(/did not apply/i);

      const wrongPath = await app.inject({
        method: 'POST',
        url: '/api/agent/build/sources/stage/patch',
        headers: agentHeaders(),
        payload: {
          path: 'game.ts',
          patch: ['--- a/other.ts', '+++ b/other.ts', '@@ -1,2 +1,2 @@', ' line1', '-line2', '+line2x', ''].join('\n'),
        },
      });
      expect(wrongPath.statusCode).toBe(400);
      expect(wrongPath.json().error).toMatch(/does not match/i);
      expect(staged.get('game.ts')).toBe('line1\nline2\n');
    });

    /**
     * The point of the whole live-preview path: an agent that has only *staged* — not
     * delivered, not gated, not committed — has already given the creator something to
     * play. Everything the assembly needs is exercised here except the real bundler,
     * which `staged-preview.test.ts` and the play route own.
     */
    it('publishes a playable preview from the staging buffer alone, before any delivery', async () => {
      const store = new InMemoryStore();
      await seedSubmission(store);
      const { gamesStore } = stubGamesStore();
      app = await createApp(
        store,
        { gamesStore },
        {
          githubClient: stubGitHub({
            getGameSources: async () => ({
              indexHtml: '<div id="game-root"></div>',
              gameJs: 'console.log("staged play");',
              styleCss: 'body{margin:0}',
              title: 'A game',
            }),
          }),
          stagedPreview: { debounceMs: 1, minGapMs: 1 },
        },
      );

      const tree = [
        { path: 'index.html', content: '<div id="game-root"></div>' },
        { path: 'game.ts', content: 'export {};' },
        { path: 'style.css', content: 'body{margin:0}' },
        { path: 'GAME.json', content: '{"modules":[]}' },
      ];
      for (const file of tree) {
        const response = await app.inject({
          method: 'PUT',
          url: '/api/agent/build/sources/stage',
          headers: agentHeaders(),
          payload: { slug: 'comet-courier', path: file.path, content: file.content },
        });
        expect(response.statusCode).toBe(200);
      }

      // The assembly is scheduled off the response path on purpose — the agent's staging
      // receipt must not wait on it — so this waits for the debounce rather than the call.
      await vi.waitFor(async () => {
        expect(await store.countBuildPreviews(ISSUE)).toBeGreaterThan(0);
      });

      const [preview] = await store.listBuildPreviews(ISSUE);
      expect(preview?.slug).toBe('comet-courier');
      const full = await store.getBuildPreview(ISSUE, preview!.id);
      const html = Buffer.from(full!.data, 'base64').toString('utf8');
      expect(html).toContain('console.log("staged play")');
      // Unreviewed agent output: the same network-restricted document the play path serves.
      expect(html).toContain("default-src 'none'");
    });

    it('does not preview a staging buffer that cannot make a game yet', async () => {
      const store = new InMemoryStore();
      await seedSubmission(store);
      const { gamesStore } = stubGamesStore();
      app = await createApp(
        store,
        { gamesStore },
        {
          githubClient: stubGitHub({
            getGameSources: async () => {
              throw new Error('assembly must not be attempted for a partial tree');
            },
          }),
          stagedPreview: { debounceMs: 1, minGapMs: 1 },
        },
      );

      const response = await app.inject({
        method: 'PUT',
        url: '/api/agent/build/sources/stage',
        headers: agentHeaders(),
        payload: { slug: 'comet-courier', path: 'SPEC.md', content: '---\ntitle: A game\n---\n' },
      });

      // The staging call still succeeds — a preview that cannot be built is not the
      // agent's problem and must never be reported back as one.
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ accepted: true });
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(await store.countBuildPreviews(ISSUE)).toBe(0);
    });
  });

  /**
   * Reading a delivery back. The channel was upload-only, which quietly made the
   * agent's branch the real home of a game — and a session that starts on a fresh
   * branch then "continues" from an empty directory, delivering a different game than
   * the one the creator gave feedback on.
   */
  describe('restoring a delivery', () => {
    function storeWithVersion(files: Record<string, string | null>) {
      return {
        putCandidateSources: async () => ({ version: 'v1', manifest: {} as never }),
        getManifest: async () => ({ sourceFiles: Object.keys(files) }),
        getSourceFile: async (_slug: string, _version: string, path: string) => files[path] ?? null,
        putGateResult: async () => {},
        putDerivedArtifact: async () => {},
        getDerivedArtifact: async () => null,
      } as unknown as GamesStore;
    }

    it('hands a build back the exact files it delivered', async () => {
      const store = new InMemoryStore();
      await seedSubmission(store);
      await store.setSubmissionSlug(ISSUE, 'comet-courier');
      await store.setSubmissionDeliveredVersion(ISSUE, 'v1');
      app = await createApp(store, {
        gamesStore: storeWithVersion({ 'SPEC.md': '# Comet Courier', 'game.ts': 'export const tick = () => {};' }),
      });

      const response = await app.inject({ method: 'GET', url: '/api/agent/build/sources', headers: agentHeaders() });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        origin: 'delivery',
        delivery: { slug: 'comet-courier', version: 'v1' },
        files: [
          { path: 'SPEC.md', content: '# Comet Courier' },
          { path: 'game.ts', content: 'export const tick = () => {};' },
        ],
      });
    });

    it('restores a preview-only delivery when nothing has been published yet', async () => {
      const store = new InMemoryStore();
      await seedSubmission(store);
      await store.setSubmissionSlug(ISSUE, 'comet-courier');
      await store.setSubmissionPreviewVersion(ISSUE, 'v1');
      app = await createApp(store, {
        gamesStore: storeWithVersion({ 'SPEC.md': '# Draft', 'game.ts': 'export {};' }),
      });

      const response = await app.inject({ method: 'GET', url: '/api/agent/build/sources', headers: agentHeaders() });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        delivery: { slug: 'comet-courier', version: 'v1' },
        files: [
          { path: 'SPEC.md', content: '# Draft' },
          { path: 'game.ts', content: 'export {};' },
        ],
      });
    });

    it('restores the newer preview when a red publish pointer is still on the job', async () => {
      const store = new InMemoryStore();
      await seedSubmission(store);
      await store.setSubmissionSlug(ISSUE, 'comet-courier');
      await store.setSubmissionDeliveredVersion(ISSUE, 'v1');
      await store.setSubmissionPreviewVersion(ISSUE, 'v2');
      const filesByVersion: Record<string, Record<string, string>> = {
        v1: { 'SPEC.md': '# Publish attempt' },
        v2: { 'SPEC.md': '# Preview fix' },
      };
      app = await createApp(store, {
        gamesStore: {
          putCandidateSources: async () => ({ version: 'v1', manifest: {} as never }),
          getManifest: async (_slug: string, version: string) => ({
            sourceFiles: Object.keys(filesByVersion[version] ?? {}),
          }),
          getSourceFile: async (_slug: string, version: string, path: string) =>
            filesByVersion[version]?.[path] ?? null,
          putGateResult: async () => {},
          putDerivedArtifact: async () => {},
          getDerivedArtifact: async () => null,
        } as unknown as GamesStore,
      });

      const response = await app.inject({ method: 'GET', url: '/api/agent/build/sources', headers: agentHeaders() });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        delivery: { slug: 'comet-courier', version: 'v2' },
        files: [{ path: 'SPEC.md', content: '# Preview fix' }],
      });
    });

    it('says plainly that a build with no draft and no delivery has nothing to continue', async () => {
      const store = new InMemoryStore();
      await seedSubmission(store);
      app = await createApp(store, { gamesStore: storeWithVersion({}) });

      const response = await app.inject({ method: 'GET', url: '/api/agent/build/sources', headers: agentHeaders() });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        delivery: null,
        origin: null,
        files: [],
        seedStatus: 'unavailable',
      });
    });

    it('serves the generated round-0 draft as the sources of a game that has never delivered', async () => {
      const store = new InMemoryStore();
      await seedSubmission(store);
      await store.setSubmissionSlug(ISSUE, 'comet-courier');
      await store.setSubmissionSeed(ISSUE, {
        slug: 'comet-courier',
        files: [{ path: 'game.ts', content: 'export const draft = true;' }],
        references: ['apex-sprint'],
        notes: 'physics is roughed in; tune the thrust curve',
      });
      app = await createApp(store, { gamesStore: storeWithVersion({}) });

      const response = await app.inject({ method: 'GET', url: '/api/agent/build/sources', headers: agentHeaders() });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        delivery: null,
        origin: 'seed',
        files: [{ path: 'game.ts', content: 'export const draft = true;' }],
        references: ['apex-sprint'],
        notes: 'physics is roughed in; tune the thrust curve',
        seedStatus: 'available',
      });
    });

    it('tells an agent to call again while the draft is still generating, rather than to scaffold', async () => {
      const store = new InMemoryStore();
      await seedSubmission(store);
      await store.setSeedStatus(ISSUE, 'pending');
      app = await createApp(store, { gamesStore: storeWithVersion({}) });

      const response = await app.inject({ method: 'GET', url: '/api/agent/build/sources', headers: agentHeaders() });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ origin: null, files: [], seedStatus: 'pending' });
    });

    it('restores the live publication for an improvement job that has not delivered yet', async () => {
      // An improvement is a *new* job on a published slug (job-state.ts: publishing is
      // terminal). That job inherits the slug before it has a deliveredVersion of its
      // own — without the publication fallback, restore reports nothing and the agent
      // rebuilds from the spec instead of revising the game the creator played.
      const IMPROVEMENT = 1000004;
      const store = new InMemoryStore();
      await seedSubmission(store, IMPROVEMENT);
      await store.setSubmissionSlug(IMPROVEMENT, 'global-thermonuclear-strategy');
      await store.setPublication({
        slug: 'global-thermonuclear-strategy',
        state: 'published',
        currentVersion: 'v3',
        publishedAt: '2026-07-01T00:00:00.000Z',
      });
      app = await createApp(store, {
        gamesStore: storeWithVersion({
          'SPEC.md': '# Global Thermonuclear Strategy',
          'game.ts': 'export const tick = () => {};',
        }),
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/agent/build/sources',
        headers: agentHeaders(IMPROVEMENT),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        origin: 'delivery',
        delivery: { slug: 'global-thermonuclear-strategy', version: 'v3' },
        files: [
          { path: 'SPEC.md', content: '# Global Thermonuclear Strategy' },
          { path: 'game.ts', content: 'export const tick = () => {};' },
        ],
      });
    });

    it('prefers this job’s own delivery over the publication when both exist', async () => {
      const store = new InMemoryStore();
      await seedSubmission(store);
      await store.setSubmissionSlug(ISSUE, 'comet-courier');
      await store.setSubmissionDeliveredVersion(ISSUE, 'v2');
      await store.setPublication({
        slug: 'comet-courier',
        state: 'published',
        currentVersion: 'v1',
        publishedAt: '2026-07-01T00:00:00.000Z',
      });
      app = await createApp(store, {
        gamesStore: storeWithVersion({ 'SPEC.md': '# Candidate v2' }),
      });

      const response = await app.inject({ method: 'GET', url: '/api/agent/build/sources', headers: agentHeaders() });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ delivery: { slug: 'comet-courier', version: 'v2' } });
    });

    it('does not restore a taken-down publication as if it were still live', async () => {
      const store = new InMemoryStore();
      await seedSubmission(store);
      await store.setSubmissionSlug(ISSUE, 'comet-courier');
      await store.setPublication({
        slug: 'comet-courier',
        state: 'disabled',
        currentVersion: 'v1',
        publishedAt: '2026-07-01T00:00:00.000Z',
        takedownAt: '2026-07-15T00:00:00.000Z',
        takedownReason: 'withdrawn',
      });
      app = await createApp(store, {
        gamesStore: storeWithVersion({ 'SPEC.md': '# Gone' }),
      });

      const response = await app.inject({ method: 'GET', url: '/api/agent/build/sources', headers: agentHeaders() });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ delivery: null, origin: null, files: [] });
    });

    it('refuses a version with holes rather than restoring a game missing files', async () => {
      // A manifest listing a file the bucket does not have is a broken version, not a
      // partial one — handing it back would have the agent "restore" a deletion it
      // never made, then deliver the result as the creator's game.
      const store = new InMemoryStore();
      await seedSubmission(store);
      await store.setSubmissionSlug(ISSUE, 'comet-courier');
      await store.setSubmissionDeliveredVersion(ISSUE, 'v1');
      app = await createApp(store, {
        gamesStore: storeWithVersion({ 'SPEC.md': '# Comet Courier', 'game.ts': null }),
      });

      const response = await app.inject({ method: 'GET', url: '/api/agent/build/sources', headers: agentHeaders() });

      expect(response.statusCode).toBe(502);
    });

    it('rejects a request without a valid build token', async () => {
      const store = new InMemoryStore();
      await seedSubmission(store);
      await store.setSubmissionSlug(ISSUE, 'comet-courier');
      await store.setSubmissionDeliveredVersion(ISSUE, 'v1');
      app = await createApp(store, { gamesStore: storeWithVersion({ 'SPEC.md': 'x' }) });

      const response = await app.inject({
        method: 'GET',
        url: '/api/agent/build/sources',
        headers: { authorization: 'Bearer not-a-real-token' },
      });

      expect(response.statusCode).toBe(401);
    });
  });
});

describe('the delivery reminder on every channel call', () => {
  it('tells an undelivered build that pushing is not delivering', async () => {
    // The brief says this too, but the brief is read at the start of a session and the
    // omission happens at the end of one. A live session has been observed doing the
    // whole job, pushing its branch, and stopping — thousands of tokens after being
    // told. This rides along with something the agent is already doing.
    const store = new InMemoryStore();
    await seedSubmission(store);
    const app = await createApp(store);

    const response = await app.inject({
      method: 'POST',
      url: '/api/agent/build/progress',
      headers: agentHeaders(),
      payload: { text: 'Working on the maze.' },
    });

    expect(response.json().control.delivered).toBe(false);
    expect(response.json().control.mustDeliver).toContain('npm run submit');

    await app.close();
  });

  it('stops nagging once the build has actually delivered (deliveredVersion or previewVersion)', async () => {
    // Derived from what we stored, not from anything the session claims about itself.
    const store = new InMemoryStore();
    await seedSubmission(store);
    await store.setSubmissionDeliveredVersion(ISSUE, 'v1');
    const app = await createApp(store);

    const response = await app.inject({
      method: 'POST',
      url: '/api/agent/build/progress',
      headers: agentHeaders(),
      payload: { text: 'Polishing.' },
    });

    expect(response.json().control.delivered).toBe(true);
    expect(response.json().control.mustDeliver).toBeUndefined();

    await app.close();
  });

  it('stops nagging when a previewVersion was delivered', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    await store.setSubmissionPreviewVersion(ISSUE, 'v1-preview');
    const app = await createApp(store);

    const response = await app.inject({
      method: 'POST',
      url: '/api/agent/build/progress',
      headers: agentHeaders(),
      payload: { text: 'Polishing.' },
    });

    expect(response.json().control.delivered).toBe(true);
    expect(response.json().control.mustDeliver).toBeUndefined();

    await app.close();
  });
});

function stubKnowledgeResult(overrides: Partial<KnowledgeQueryResult> = {}): KnowledgeQueryResult {
  return {
    mode: 'answer',
    fallback: false,
    answer: 'Use the party module for same-screen multiplayer.',
    chunks: [{ repoPath: 'kits/current/shared/modules/party.d.ts', snippet: 'export interface PartyApi {}' }],
    repoPaths: ['kits/current/shared/modules/party.d.ts'],
    indexedCommit: 'abc123',
    guidance: 'Verify signatures via get_kit_api.',
    truncated: false,
    cached: false,
    warnings: [],
    ...overrides,
  };
}

describe('GET /api/agent/build/knowledge/query', () => {
  let app: FastifyInstance | null = null;

  afterEach(async () => {
    await app?.close();
    app = null;
  });

  it('answers 503 when knowledge search is not configured', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    app = await createApp(store);

    const response = await app.inject({
      method: 'GET',
      url: '/api/agent/build/knowledge/query?query=how+do+parties+work',
      headers: agentHeaders(),
    });

    expect(response.statusCode).toBe(503);
    expect(response.json().error).toBe('knowledge_search_unavailable');
  });

  it('requires a query', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    const knowledgeSearch = vi.fn(async () => stubKnowledgeResult());
    app = await createApp(store, { knowledgeSearch });

    const response = await app.inject({
      method: 'GET',
      url: '/api/agent/build/knowledge/query',
      headers: agentHeaders(),
    });

    expect(response.statusCode).toBe(400);
    expect(knowledgeSearch).not.toHaveBeenCalled();
  });

  it('forwards query/mode/scope and returns the result untouched', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    const knowledgeSearch = vi.fn(async () => stubKnowledgeResult());
    app = await createApp(store, { knowledgeSearch });

    const response = await app.inject({
      method: 'GET',
      url: '/api/agent/build/knowledge/query?query=how+do+parties+work&mode=chunks&scope=kit',
      headers: agentHeaders(),
    });

    expect(response.statusCode).toBe(200);
    expect(knowledgeSearch).toHaveBeenCalledWith({ query: 'how do parties work', mode: 'chunks', scope: 'kit' });
    expect(response.json().repoPaths).toEqual(['kits/current/shared/modules/party.d.ts']);
  });

  it('defaults to mode=answer and ignores an unknown scope', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    const knowledgeSearch = vi.fn(async () => stubKnowledgeResult());
    app = await createApp(store, { knowledgeSearch });

    await app.inject({
      method: 'GET',
      url: '/api/agent/build/knowledge/query?query=hello&scope=nonsense',
      headers: agentHeaders(),
    });

    expect(knowledgeSearch).toHaveBeenCalledWith({ query: 'hello', mode: 'answer', scope: undefined });
  });

  it('degrades to a 200 warning once the per-round answer cap is hit, without calling through', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    const knowledgeSearch = vi.fn(async () => stubKnowledgeResult());
    app = await createApp(store, { knowledgeSearch, maxKnowledgeAnswersPerWindow: 1 });

    const first = await app.inject({
      method: 'GET',
      url: '/api/agent/build/knowledge/query?query=first',
      headers: agentHeaders(),
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: 'GET',
      url: '/api/agent/build/knowledge/query?query=second',
      headers: agentHeaders(),
    });

    expect(second.statusCode).toBe(200);
    expect(second.json().warnings).toEqual([expect.objectContaining({ code: 'rate_limited' })]);
    expect(knowledgeSearch).toHaveBeenCalledTimes(1);
  });

  it('caps chunks and answer modes separately', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    const knowledgeSearch = vi.fn(async () => stubKnowledgeResult());
    app = await createApp(store, { knowledgeSearch, maxKnowledgeAnswersPerWindow: 1 });

    await app.inject({
      method: 'GET',
      url: '/api/agent/build/knowledge/query?query=answer+one',
      headers: agentHeaders(),
    });
    const chunksResponse = await app.inject({
      method: 'GET',
      url: '/api/agent/build/knowledge/query?query=chunks+one&mode=chunks',
      headers: agentHeaders(),
    });

    expect(chunksResponse.json().warnings ?? []).toEqual([]);
    expect(knowledgeSearch).toHaveBeenCalledTimes(2);
  });

  it('refuses an invalid build token the same as every other channel route', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    const knowledgeSearch = vi.fn(async () => stubKnowledgeResult());
    app = await createApp(store, { knowledgeSearch });

    const response = await app.inject({
      method: 'GET',
      url: '/api/agent/build/knowledge/query?query=hello',
      headers: { authorization: 'Bearer not-a-real-token' },
    });

    expect(response.statusCode).toBe(401);
    expect(knowledgeSearch).not.toHaveBeenCalled();
  });
});

describe('seed regeneration', () => {
  let app: FastifyInstance | null = null;

  afterEach(async () => {
    await app?.close();
    app = null;
  });

  function seederStub(onSeed?: (request: { steer?: string }) => void): GameSeeder {
    return {
      seed: async (request) => {
        onSeed?.(request);
        return {
          slug: request.slug,
          files: [{ path: 'game.ts', content: 'export {};\n' }],
          references: ['apex-sprint'],
          usage: { inputTokens: 10, outputTokens: 10, model: 'gemini-3.6-flash' },
          elapsedMs: 1000,
          compiles: true,
          repaired: false,
        };
      },
    };
  }

  async function selfRound(store: InMemoryStore) {
    await seedSubmission(store);
    await store.setSubmissionSlug(ISSUE, 'squad-game');
    await store.setRoundBuilder(ISSUE, 'self');
  }

  function stagedGamesStore(files: Array<{ path: string; bytes: number }>) {
    return {
      listStagedSources: async () => ({
        files,
        totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
        maxBytes: 2 * 1024 * 1024,
        maxFiles: 200,
        updatedAt: files.length ? '2026-08-13T08:00:00.000Z' : null,
      }),
    } as unknown as GamesStore;
  }

  it('queues a replacement draft and reports what is left', async () => {
    const store = new InMemoryStore();
    await selfRound(store);
    const steers: Array<string | undefined> = [];
    app = await createApp(store, undefined, {
      gameSeeder: seederStub((request) => steers.push(request.steer)),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/agent/build/seed/regenerate',
      headers: agentHeaders(),
      payload: { steer: 'the brief asks for co-op; the draft built a single-player runner' },
    });

    expect(res.statusCode).toBe(200);
    // Returns immediately: generation is background, so agents recheck get_seed.
    expect(res.json()).toMatchObject({ status: 'pending', regenerationsRemaining: 1 });

    await vi.waitFor(async () => {
      expect((await store.getSubmission(ISSUE))?.seed?.files).toHaveLength(1);
    });
    expect((await store.getSubmission(ISSUE))?.seedStatus).toBe('available');
    // The steer reaches the generator, or a retry repeats itself.
    expect(steers).toEqual(['the brief asks for co-op; the draft built a single-player runner']);
  });

  it('recovers a round whose first generation failed', async () => {
    const store = new InMemoryStore();
    await selfRound(store);
    await store.setSeedStatus(ISSUE, 'unavailable');
    app = await createApp(store, undefined, { gameSeeder: seederStub() });

    const res = await app.inject({
      method: 'POST',
      url: '/api/agent/build/seed/regenerate',
      headers: agentHeaders(),
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    await vi.waitFor(async () => {
      expect((await store.getSubmission(ISSUE))?.seedStatus).toBe('available');
    });
  });

  it('refuses once files are staged, because a new seed would move the base they overlay', async () => {
    const store = new InMemoryStore();
    await selfRound(store);
    let seedCalls = 0;
    app = await createApp(
      store,
      { gamesStore: stagedGamesStore([{ path: 'game.ts', bytes: 12 }]) },
      { gameSeeder: seederStub(() => seedCalls++) },
    );

    const res = await app.inject({
      method: 'POST',
      url: '/api/agent/build/seed/regenerate',
      headers: agentHeaders(),
      payload: {},
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('already_staged');
    expect(seedCalls).toBe(0);
  });

  it('lets a managed round that reads its seed regenerate one too', async () => {
    // The refusal tracks how the seed arrives, not who is building.
    const store = new InMemoryStore();
    await seedSubmission(store);
    await store.setSubmissionSlug(ISSUE, 'squad-game');
    await store.setRoundBuilder(ISSUE, 'platform');
    const platformBackend: AgentBackend = {
      name: 'managed:stub',
      seedDelivery: () => 'channel' as const,
      dispatch: async () => ({ ref: 'session-1' }),
      resume: async () => ({ ref: 'session-2' }),
      observe: async () => null,
      cancel: async () => ({ enforced: false }),
    };
    app = await createApp(store, undefined, {
      gameSeeder: seederStub(),
      agentBackend: platformBackend,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/agent/build/seed/regenerate',
      headers: agentHeaders(),
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    await vi.waitFor(async () => {
      expect((await store.getSubmission(ISSUE))?.seedStatus).toBe('available');
    });
  });

  it('refuses a round that was handed its seed as a workspace it already forked', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    await store.setSubmissionSlug(ISSUE, 'squad-game');
    await store.setRoundBuilder(ISSUE, 'platform');
    let seedCalls = 0;
    app = await createApp(store, undefined, { gameSeeder: seederStub(() => seedCalls++) });

    const res = await app.inject({
      method: 'POST',
      url: '/api/agent/build/seed/regenerate',
      headers: agentHeaders(),
      payload: {},
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('seed_not_readable');
    expect(seedCalls).toBe(0);
  });

  it('caps regenerations so a looping agent cannot bill generations forever', async () => {
    const store = new InMemoryStore();
    await selfRound(store);
    let seedCalls = 0;
    app = await createApp(store, undefined, { gameSeeder: seederStub(() => seedCalls++) });

    const regenerate = () =>
      app!.inject({
        method: 'POST',
        url: '/api/agent/build/seed/regenerate',
        headers: agentHeaders(),
        payload: {},
      });

    expect((await regenerate()).json()).toMatchObject({ regenerationsRemaining: 1 });
    expect((await regenerate()).json()).toMatchObject({ regenerationsRemaining: 0 });

    const third = await regenerate();
    expect(third.statusCode).toBe(409);
    expect(third.json().error).toBe('cap_reached');
    await vi.waitFor(() => expect(seedCalls).toBe(2));
  });

  it('refuses without spending regeneration quota when the console kill switch is off', async () => {
    const store = new InMemoryStore();
    await selfRound(store);
    await store.setCreationLimits({ seedingMode: 'off' }, 'g:boss');
    let seedCalls = 0;
    app = await createApp(store, undefined, { gameSeeder: seederStub(() => seedCalls++) });

    const regenerate = () =>
      app!.inject({
        method: 'POST',
        url: '/api/agent/build/seed/regenerate',
        headers: agentHeaders(),
        payload: {},
      });

    // Twice — more than the cap — and neither may cost a real attempt.
    for (let i = 0; i < 2; i++) {
      const res = await regenerate();
      expect(res.statusCode).toBe(409);
      expect(res.json().error).toBe('seeding_off');
    }
    expect(seedCalls).toBe(0);
    expect((await store.getSubmission(ISSUE))?.seedRegenerations ?? 0).toBe(0);
  });

  it('answers 503 rather than pretending, when the deployment does not seed', async () => {
    const store = new InMemoryStore();
    await selfRound(store);
    app = await createApp(store);

    const res = await app.inject({
      method: 'POST',
      url: '/api/agent/build/seed/regenerate',
      headers: agentHeaders(),
      payload: {},
    });

    expect(res.statusCode).toBe(503);
  });
});
