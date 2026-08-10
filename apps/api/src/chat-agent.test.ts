import { genaicode } from 'genaicode';
import type { GenerationRequest } from 'genaicode';
import { describe, expect, it } from 'vitest';
import { StubStudioChatAgent, VertexStudioChatAgent, chatAgentEnabled, type ChatAgentStatus } from './chat-agent.js';

const STATUS: ChatAgentStatus = {
  scope: 'draft',
  state: 'building',
  hasDelivered: false,
  pendingCount: 0,
  recentEvents: [],
};

function stubClient(responseText: string, capture?: (request: GenerationRequest) => void) {
  return genaicode({
    name: 'stub',
    async generate(request) {
      capture?.(request);
      return { parts: [{ type: 'text' as const, text: responseText }] };
    },
  });
}

function failingClient(error: Error) {
  return genaicode({
    name: 'stub-fail',
    async generate() {
      throw error;
    },
  });
}

describe('VertexStudioChatAgent', () => {
  it('returns a reply decision with the model text, never dispatching', async () => {
    const agent = new VertexStudioChatAgent({
      client: stubClient(JSON.stringify({ action: 'reply', text: 'Still building — no changes yet.' })),
    });
    const decision = await agent.decide({ message: 'is it done?', status: STATUS, history: [] });
    expect(decision).toMatchObject({ kind: 'reply', text: 'Still building — no changes yet.' });
  });

  it('returns a build decision that carries no dispatchable text of its own', async () => {
    let seen: GenerationRequest | undefined;
    const agent = new VertexStudioChatAgent({
      client: stubClient(JSON.stringify({ action: 'build', text: 'On it!' }), (req) => (seen = req)),
    });
    const decision = await agent.decide({ message: 'make the enemies faster', status: STATUS, history: [] });
    expect(decision.kind).toBe('build');
    expect(decision).toMatchObject({ kind: 'build', text: 'On it!' });
    // No field on the decision names what the route should dispatch.
    expect(Object.keys(decision).sort()).toEqual(['kind', 'model', 'text']);
    expect(seen?.prompt[0]?.text).toContain('make the enemies faster');
  });

  it('a bare build action with no text is a valid, ack-less build decision', async () => {
    const agent = new VertexStudioChatAgent({ client: stubClient(JSON.stringify({ action: 'build' })) });
    const decision = await agent.decide({ message: 'fix the bug', status: STATUS, history: [] });
    expect(decision).toEqual({ kind: 'build', model: expect.any(String) });
  });

  it('throws on a reply with no usable text, rather than returning an empty bubble', async () => {
    const agent = new VertexStudioChatAgent({ client: stubClient(JSON.stringify({ action: 'reply' })) });
    await expect(agent.decide({ message: 'thanks', status: STATUS, history: [] })).rejects.toThrow();
  });

  it('throws on malformed JSON — the caller is responsible for failing open', async () => {
    const agent = new VertexStudioChatAgent({ client: stubClient('not json') });
    await expect(agent.decide({ message: 'hi', status: STATUS, history: [] })).rejects.toThrow();
  });

  it('throws on an unrecognized action', async () => {
    const agent = new VertexStudioChatAgent({ client: stubClient(JSON.stringify({ action: 'delete_everything' })) });
    await expect(agent.decide({ message: 'hi', status: STATUS, history: [] })).rejects.toThrow();
  });

  it('throws when the provider itself fails', async () => {
    const agent = new VertexStudioChatAgent({ client: failingClient(new Error('vertex unavailable')) });
    await expect(agent.decide({ message: 'hi', status: STATUS, history: [] })).rejects.toThrow('vertex unavailable');
  });

  it('never states a fact not injected in the status block by construction — the prompt only', async () => {
    let seen: GenerationRequest | undefined;
    const agent = new VertexStudioChatAgent({
      client: stubClient(JSON.stringify({ action: 'reply', text: 'ok' }), (req) => (seen = req)),
    });
    await agent.decide({
      message: 'what changed?',
      status: { ...STATUS, pendingCount: 2, recentEvents: ['Added a second level'] },
      history: [{ message: 'earlier', reply: 'earlier reply' }],
    });
    expect(seen?.prompt[0]?.text).toContain('change requests already queued and not yet collected');
    expect(seen?.prompt[0]?.text).toContain('Added a second level');
    expect(seen?.prompt[0]?.text).toContain('Earlier in this conversation');
    expect(seen?.prompt[0]?.text).toContain('never state anything not listed here');
  });
});

describe('StubStudioChatAgent', () => {
  it('returns the configured decision', async () => {
    const agent = new StubStudioChatAgent({ kind: 'build' });
    await expect(agent.decide({ message: 'x', status: STATUS, history: [] })).resolves.toEqual({ kind: 'build' });
  });

  it('supports a factory for varying per-call results', async () => {
    let n = 0;
    const agent = new StubStudioChatAgent(() => ({ kind: 'reply', text: `reply ${++n}` }));
    await expect(agent.decide({ message: 'x', status: STATUS, history: [] })).resolves.toEqual({
      kind: 'reply',
      text: 'reply 1',
    });
    await expect(agent.decide({ message: 'x', status: STATUS, history: [] })).resolves.toEqual({
      kind: 'reply',
      text: 'reply 2',
    });
  });
});

describe('chatAgentEnabled', () => {
  it('is off unless explicitly set to the string "true"', () => {
    expect(chatAgentEnabled({})).toBe(false);
    expect(chatAgentEnabled({ STUDIO_CHAT_AGENT: 'false' })).toBe(false);
    expect(chatAgentEnabled({ STUDIO_CHAT_AGENT: 'true' })).toBe(true);
  });
});
