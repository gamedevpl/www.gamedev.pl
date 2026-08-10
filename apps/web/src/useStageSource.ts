import { useEffect, useRef, useState } from 'react';
import i18n from './i18n/index.js';
import { fetchPublishedGame } from './catalog.js';
import { embedGameHtml, withGameLocale } from './gamePlayer.js';
import { getChannelPlayable, getSubmissionPreview, type SubmissionStatus } from './submissionApi.js';

/**
 * Which build is on screen, and what to call it in the ribbon (`StudioVersionRibbon`).
 *
 * `at` is an epoch ms the client actually observed the build land — not a server
 * timestamp — because a staged build's own "produced at" time is not available (the
 * staged-preview pipeline's failures are silent by design; see
 * docs/studio-game-first-implementation-plan.md Workstream B2). `null` means unknown,
 * which the ribbon must render as "unknown" rather than guess.
 */
export type StageOriginKind = 'staged' | 'delivered' | 'seed' | 'none';

export type StageOrigin = {
  kind: StageOriginKind;
  at: number | null;
  /** Agent-authored label for a channel build, when the origin carries one. Untrusted text. */
  versionLabel: string | null;
};

export type StageSource = {
  /** Assembled + player-bridge-embedded HTML ready for `srcDoc`, or null before anything lands. */
  html: string | null;
  /**
   * The same document before `embedGameHtml`/`withGameLocale` — for a caller that does
   * its own embedding, `GameTheater` via `GameFrame`'s `embed` prop being the one that
   * matters here. Feeding it the already-embedded `html` would inject the player
   * bridge twice.
   */
  rawHtml: string | null;
  origin: StageOrigin;
};

const NONE_ORIGIN: StageOrigin = { kind: 'none', at: null, versionLabel: null };

/**
 * The stage's one source of truth for "what is running right now."
 *
 * Lifted out of `SubmissionStatusView`'s two fetch effects (preview-keyed-on-headSha,
 * channel-keyed-on-playable-ref) so `CreatorStudioView` can feed the same object to
 * both the always-mounted `<StudioStage>` and the embedded thread — the ribbon and the
 * thread's own "preview updated" moments can never disagree about which build is on
 * screen, because there is only one fetch of it.
 *
 * Preserves the original behaviour byte for byte: preview wins over channel, a refetch
 * failure keeps showing the last-good document instead of clearing it, and every
 * document gets the same `embedGameHtml(withGameLocale(...))` preparation every
 * embedded game gets.
 */
export function useStageSource(token: string, status: SubmissionStatus | null): StageSource {
  const [preview, setPreview] = useState<{ html: string; at: number } | null>(null);
  const [channel, setChannel] = useState<{ html: string; at: number; label: string | null } | null>(null);
  const [published, setPublished] = useState<{ html: string; slug: string } | null>(null);

  const loadedPreviewKeyRef = useRef<string | null>(null);
  const previewInFlightRef = useRef(false);
  const loadedChannelRef = useRef<string | null>(null);
  const channelInFlightRef = useRef(false);
  const loadedPublishedSlugRef = useRef<string | null>(null);
  const publishedInFlightRef = useRef(false);
  const publishedRetryRef = useRef(0);
  const [publishedRetryTick, setPublishedRetryTick] = useState(0);

  // Every fetch below closes over the token it was issued for and checks this ref
  // before applying its result — a game switch must never show the previous game's
  // stage under the new title, even when the old request is still in flight and
  // resolves after the switch.
  const activeTokenRef = useRef(token);

  // A game switch must never show the previous game's stage under the new title.
  useEffect(() => {
    activeTokenRef.current = token;
    setPreview(null);
    setChannel(null);
    setPublished(null);
    loadedPreviewKeyRef.current = null;
    previewInFlightRef.current = false;
    loadedChannelRef.current = null;
    channelInFlightRef.current = false;
    loadedPublishedSlugRef.current = null;
    publishedInFlightRef.current = false;
    publishedRetryRef.current = 0;
  }, [token]);

  // Auto-load the live preview as soon as one is available, and silently refresh it
  // whenever the agent pushes a new commit (headSha changes) — no click required.
  useEffect(() => {
    const previewSlug = status?.preview?.slug;
    const headSha = status?.progress?.headSha;
    const gateRun = status?.previewGate?.ranAt ?? '';
    const previewKey = `${headSha ?? 'unknown'}:${gateRun}`;
    if (!previewSlug || previewInFlightRef.current) return;
    if (headSha && previewKey === loadedPreviewKeyRef.current) return;
    if (!headSha && loadedPreviewKeyRef.current !== null) return;

    previewInFlightRef.current = true;
    const requestToken = token;
    getSubmissionPreview(token)
      .then((result) => {
        if (activeTokenRef.current !== requestToken) return;
        loadedPreviewKeyRef.current = previewKey;
        setPreview({ html: result.html, at: Date.now() });
      })
      .catch(() => {
        // Keep last-good on a refetch failure — a stale stage beats a blank one.
        if (activeTokenRef.current !== requestToken) return;
        loadedPreviewKeyRef.current = previewKey;
      })
      .finally(() => {
        if (activeTokenRef.current !== requestToken) return;
        previewInFlightRef.current = false;
      });
  }, [status?.preview?.slug, status?.progress?.headSha, status?.previewGate?.ranAt, token]);

  // Prefetch the latest channel build when there is no PR preview yet.
  useEffect(() => {
    const latest = status?.playable?.[0];
    if (preview || !latest) {
      if (!latest) {
        setChannel(null);
        loadedChannelRef.current = null;
      }
      return;
    }
    if (latest.ref === loadedChannelRef.current || channelInFlightRef.current) return;

    channelInFlightRef.current = true;
    const requestToken = token;
    getChannelPlayable(token, latest)
      .then((html) => {
        if (activeTokenRef.current !== requestToken) return;
        loadedChannelRef.current = latest.ref;
        setChannel({
          html,
          at: latest.createdAt ? Date.parse(latest.createdAt) : Date.now(),
          label: latest.label ?? null,
        });
      })
      .catch(() => {
        if (activeTokenRef.current !== requestToken) return;
        loadedChannelRef.current = latest.ref;
      })
      .finally(() => {
        if (activeTokenRef.current !== requestToken) return;
        channelInFlightRef.current = false;
      });
  }, [preview, status?.playable, token]);

  // Once the game has published, the stage shows the delivered build itself — the
  // same document a player sees — rather than a stale staged/channel copy.
  useEffect(() => {
    const slug = status?.status === 'published' ? status.slug : undefined;
    if (!slug) return;
    if (loadedPublishedSlugRef.current === slug || publishedInFlightRef.current) return;

    publishedInFlightRef.current = true;
    const requestToken = token;
    fetchPublishedGame(slug)
      .then((game) => {
        if (activeTokenRef.current !== requestToken) return;
        loadedPublishedSlugRef.current = slug;
        publishedRetryRef.current = 0;
        setPublished({ html: game.html, slug });
      })
      .catch(() => {
        if (activeTokenRef.current !== requestToken) return;
        // Leave the slug unmarked so this effect retries — a transient failure here
        // must not permanently blank a published game's stage. Cap attempts so a
        // genuinely broken slug doesn't retry forever.
        if (publishedRetryRef.current < 3) {
          publishedRetryRef.current += 1;
          window.setTimeout(() => {
            if (activeTokenRef.current === requestToken) setPublishedRetryTick((tick) => tick + 1);
          }, 4_000);
        } else {
          loadedPublishedSlugRef.current = slug;
        }
      })
      .finally(() => {
        if (activeTokenRef.current !== requestToken) return;
        publishedInFlightRef.current = false;
      });
  }, [status?.status, status?.slug, token, publishedRetryTick]);

  const isPublished = status?.status === 'published' && Boolean(status.slug);
  const rawHtml = isPublished ? (published?.html ?? null) : (preview?.html ?? channel?.html ?? null);
  const html = rawHtml ? embedGameHtml(withGameLocale(rawHtml, i18n.language)) : null;

  let origin: StageOrigin = NONE_ORIGIN;
  if (isPublished) {
    origin = { kind: 'delivered', at: null, versionLabel: null };
  } else if (preview) {
    origin = { kind: 'staged', at: preview.at, versionLabel: null };
  } else if (channel) {
    origin = { kind: 'staged', at: channel.at, versionLabel: channel.label };
  } else if (status && !status.preview && !status.playable?.length) {
    origin = NONE_ORIGIN;
  }

  return { html, rawHtml, origin };
}
