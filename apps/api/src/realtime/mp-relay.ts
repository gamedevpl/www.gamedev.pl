import { GoogleAuth } from 'google-auth-library';
import type { CreateRoomResult } from './mp.js';

/**
 * Splitting the party relay off the main API (store-launch-plan.md T0, private www.gamedev.pl-ops repo).
 *
 * `--max-instances 1` is pinned on the app service for exactly one reason: party rooms
 * are per-instance memory, so a guest load-balanced to a second container cannot see the
 * host's room. That pin is what stops the API scaling out for a public beta, and the
 * relay is the only thing that needs it.
 *
 * So the relay moves to its own Cloud Run service, pinned at one instance, and the app
 * service loses the pin. **Both run the same image** — the mode is chosen by env. That is
 * deliberate: a second Dockerfile is a second thing to drift, and drift between the
 * workspace layout and an image is precisely what took every deploy down when
 * `@gamedevpl/zone-core` landed.
 *
 * The hard part is that creating a room is *authenticated* (a session cookie on the app
 * origin) and *stateful* (the room lives in the relay's memory). Rather than teach the
 * relay about cookies — spreading the session's blast radius to a second origin — the app
 * service stays the front door and calls the relay server-to-server with a Google-signed
 * OIDC token, the same shape the sweep endpoints already use (`internal-auth.ts`).
 *
 * That choice is what keeps this change small: room codes, room tokens, the
 * one-room-per-host rule and every existing test keep their meaning, because
 * `RoomRegistry.createRoom` still runs in exactly one place. Only *where* that place is
 * changes. The alternative — minting a self-describing host ticket in the app and creating
 * the room lazily on the relay — would have needed a new token format, a new claim set and
 * code-collision handling, for no benefit on a path that runs once per party.
 *
 * The extra hop costs one HTTP round trip when a host opens a lobby. It is nowhere near
 * the frame path: input frames go straight to the relay over the websocket.
 */

/** Set on the relay service. It serves the websocket + the internal create route only. */
export function isRelayOnly(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.MP_RELAY_ONLY === '1' || env.MP_RELAY_ONLY === 'true';
}

/**
 * Set on the app service: the relay's base URL. Unset means "no split" — the app keeps
 * serving the relay in-process exactly as it does today, which is what local development
 * and every existing test run against.
 */
export function relayBaseUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const raw = env.MP_RELAY_URL?.trim();
  return raw ? raw.replace(/\/+$/, '') : undefined;
}

export class RelayUnavailableError extends Error {
  constructor(message = 'relay unavailable') {
    super(message);
    this.name = 'RelayUnavailableError';
  }
}

export interface RelayClient {
  /** Ask the relay to open a room. Throws RelayUnavailableError when it cannot. */
  createRoom(input: { slug: string; ownerUid: string; maxPlayers?: number }): Promise<CreateRoomResult>;
}

export interface HttpRelayClientOptions {
  baseUrl: string;
  /** Injected in tests. Production mints a Google OIDC token for `baseUrl` as audience. */
  fetchImpl?: typeof fetch;
  authTokenFor?: (audience: string) => Promise<string | undefined>;
  timeoutMs?: number;
}

/**
 * The audience is the relay's own URL, matching `internal-auth.ts`'s rule: an OIDC token
 * minted for one endpoint must not be replayable against another.
 */
async function defaultAuthToken(audience: string): Promise<string | undefined> {
  try {
    const client = await new GoogleAuth().getIdTokenClient(audience);
    // google-auth-library has returned both a plain object and a `Headers` across majors,
    // and getting this wrong fails open into an unauthenticated call — so handle both.
    const headers: unknown = await client.getRequestHeaders();
    const header =
      headers instanceof Headers
        ? headers.get('authorization')
        : (headers as Record<string, string> | undefined)?.authorization;
    return header?.replace(/^Bearer\s+/i, '') ?? undefined;
  } catch {
    // No metadata server (local dev, tests). The relay's own verifier decides whether an
    // unauthenticated call is acceptable — this must not silently become an auth bypass.
    return undefined;
  }
}

export class HttpRelayClient implements RelayClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly authTokenFor: (audience: string) => Promise<string | undefined>;
  private readonly timeoutMs: number;

  constructor(options: HttpRelayClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.authTokenFor = options.authTokenFor ?? defaultAuthToken;
    this.timeoutMs = options.timeoutMs ?? 5_000;
  }

  async createRoom(input: { slug: string; ownerUid: string; maxPlayers?: number }): Promise<CreateRoomResult> {
    const url = `${this.baseUrl}/api/internal/mp/sessions`;
    const token = await this.authTokenFor(this.baseUrl);
    const controller = new AbortController();
    // A host waiting on a lobby is waiting on a person's attention: fail fast and let them
    // retry rather than hold the request open until the platform's own timeout.
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(input),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new RelayUnavailableError(`relay responded ${response.status}`);
      }
      return (await response.json()) as CreateRoomResult;
    } catch (err) {
      if (err instanceof RelayUnavailableError) throw err;
      throw new RelayUnavailableError(err instanceof Error ? err.message : 'relay request failed');
    } finally {
      clearTimeout(timer);
    }
  }
}

export function createRelayClientFromEnv(env: NodeJS.ProcessEnv = process.env): RelayClient | undefined {
  const baseUrl = relayBaseUrl(env);
  return baseUrl ? new HttpRelayClient({ baseUrl }) : undefined;
}
