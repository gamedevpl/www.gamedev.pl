import { useCallback, useEffect, useRef, useState } from 'react';
import i18n from './i18n/index.js';
import { fetchPublishedGame } from './catalog.js';
import { embedGameHtml, withGameLocale } from './gamePlayer.js';
import { getChannelPlayable, getSubmissionPreview, type SubmissionStatus } from './submissionApi.js';

/**
 * Which build is on screen, and what to call it in the ribbon (`StudioVersionRibbon`).
 *
 * `at` is an epoch ms marking when this build was produced, read from a server
 * timestamp when the pipeline reports one (`previewGate.ranAt` for a PR preview,
 * `playable.createdAt` for a channel build) — comparing a preview and a channel build
 * needs a shared clock, or a preview loaded a while ago always looks "fresher" than a
 * channel build that just landed, even across a page reload (CE-12). Falls back to the
 * client's own observed-landing time only when the server does not report one (the
 * staged-preview pipeline's failures are silent by design; see
 * docs/studio-game-first-implementation-plan.md Workstream B2). `null` means unknown,
 * which the ribbon must render as "unknown" rather than guess.
 */
export type StageOriginKind = 'staged' | 'delivered' | 'seed' | 'none';

export type StageOrigin = {
  kind: StageOriginKind;
  at: number | null;
  versionLabel: string | null;
};

export type StageSource = {
  html: string | null;
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
export type UseStageSourceResult = StageSource & {
  pushPreview: (html: string) => void;
};

export type UseStageSourceOptions = {
  selectedPreviewVersion?: string | null;
};

export function useStageSource(
  token: string,
  status: SubmissionStatus | null,
  options?: UseStageSourceOptions,
): UseStageSourceResult {
  const selectedPreviewVersion = options?.selectedPreviewVersion ?? null;
  const [preview, setPreview] = useState<{ html: string; at: number } | null>(null);
  const [versionPreview, setVersionPreview] = useState<{ html: string; at: number; version: string } | null>(null);
  const [channel, setChannel] = useState<{
    html: string;
    at: number;
    label: string | null;
    seed: boolean;
  } | null>(null);
  const [published, setPublished] = useState<{ html: string; slug: string } | null>(null);
  const [dataToken, setDataToken] = useState(token);

  const loadedVersionPreviewKeyRef = useRef<string | null>(null);
  const versionPreviewInFlightRef = useRef(false);
  const loadedPreviewKeyRef = useRef<string | null>(null);
  const previewInFlightRef = useRef(false);
  const loadedChannelRef = useRef<string | null>(null);
  const channelInFlightRef = useRef(false);
  const loadedPublishedSlugRef = useRef<string | null>(null);
  const publishedInFlightRef = useRef(false);
  const publishedRetryRef = useRef(0);
  const [publishedRetryTick, setPublishedRetryTick] = useState(0);
  const channelRetryRef = useRef(0);
  const [channelRetryTick, setChannelRetryTick] = useState(0);
  const previewRetryRef = useRef(0);
  const [previewRetryTick, setPreviewRetryTick] = useState(0);

  // Every fetch below closes over the token it was issued for and checks this ref
  // before applying its result — a game switch must never show the previous game's
  // stage under the new title, even when the old request is still in flight and
  // resolves after the switch.
  const activeTokenRef = useRef(token);

  // React's sanctioned render-phase bailout ("adjusting state when a prop changes"):
  // an *effect*-based reset alone would let this same render pass the previous game's
  // preview/channel/published HTML to a freshly key-remounted `StudioStage` before the
  // effect ever runs — the parent renders the new `token` and the new stage in the
  // same pass (Codex review of PR #739).
  if (token !== dataToken) {
    setDataToken(token);
    activeTokenRef.current = token;
    setPreview(null);
    setVersionPreview(null);
    setChannel(null);
    setPublished(null);
    loadedPreviewKeyRef.current = null;
    loadedVersionPreviewKeyRef.current = null;
    versionPreviewInFlightRef.current = false;
    previewInFlightRef.current = false;
    loadedChannelRef.current = null;
    channelInFlightRef.current = false;
    loadedPublishedSlugRef.current = null;
    publishedInFlightRef.current = false;
    publishedRetryRef.current = 0;
    channelRetryRef.current = 0;
    previewRetryRef.current = 0;
  }

  useEffect(() => {
    if (!token || !selectedPreviewVersion) {
      setVersionPreview(null);
      loadedVersionPreviewKeyRef.current = null;
      return;
    }
    const versionKey = `${token}:${selectedPreviewVersion}`;
    if (loadedVersionPreviewKeyRef.current === versionKey || versionPreviewInFlightRef.current) return;

    versionPreviewInFlightRef.current = true;
    const requestToken = token;
    getSubmissionPreview(token, selectedPreviewVersion)
      .then((result) => {
        if (activeTokenRef.current !== requestToken) return;
        loadedVersionPreviewKeyRef.current = versionKey;
        setVersionPreview({
          html: result.html,
          at: Date.now(),
          version: selectedPreviewVersion,
        });
      })
      .catch(() => {
        if (activeTokenRef.current !== requestToken) return;
        setVersionPreview(null);
      })
      .finally(() => {
        if (activeTokenRef.current !== requestToken) return;
        versionPreviewInFlightRef.current = false;
      });
  }, [token, selectedPreviewVersion]);

  // Auto-load the live preview as soon as one is available, and silently refresh it
  // whenever the agent pushes a new commit (headSha changes) — no click required.
  useEffect(() => {
    const previewSlug = status?.preview?.slug;
    const headSha = status?.progress?.headSha;
    const gateRunAt = status?.previewGate?.ranAt;
    const previewKey = `${headSha ?? 'unknown'}:${gateRunAt ?? ''}`;
    if (!previewSlug || previewInFlightRef.current) return;
    if (headSha && previewKey === loadedPreviewKeyRef.current) return;
    if (!headSha && loadedPreviewKeyRef.current !== null) return;

    previewInFlightRef.current = true;
    const requestToken = token;
    getSubmissionPreview(token)
      .then((result) => {
        if (activeTokenRef.current !== requestToken) return;
        loadedPreviewKeyRef.current = previewKey;
        previewRetryRef.current = 0;
        // Prefer the gate's own "produced at" over the client's fetch time — the
        // latter is only comparable to a channel build's `createdAt` while the page
        // stays open (see the CE-12 note above).
        const producedAt = gateRunAt ? Date.parse(gateRunAt) : NaN;
        setPreview({ html: result.html, at: Number.isFinite(producedAt) ? producedAt : Date.now() });
      })
      .catch(() => {
        // Keep last-good on a refetch failure — a stale stage beats a blank one. But
        // don't mark this head/gate key loaded yet: a 409 while assembly is still
        // finishing is transient, and marking it now would block every later poll with
        // the same head/gate from ever trying again (bounded retry, same as channel/
        // published below).
        if (activeTokenRef.current !== requestToken) return;
        if (previewRetryRef.current < 3) {
          previewRetryRef.current += 1;
          window.setTimeout(() => {
            if (activeTokenRef.current === requestToken) setPreviewRetryTick((tick) => tick + 1);
          }, 4_000);
        } else {
          loadedPreviewKeyRef.current = previewKey;
        }
      })
      .finally(() => {
        if (activeTokenRef.current !== requestToken) return;
        previewInFlightRef.current = false;
      });
  }, [status?.preview?.slug, status?.progress?.headSha, status?.previewGate?.ranAt, token, previewRetryTick]);

  // Prefetch the latest channel build when there is no PR preview yet — or when a
  // staged assembly has landed more recently than the PR preview currently on screen.
  //
  // Before this comparison existed, `preview` alone disabled this effect for the rest
  // of the session the instant any gate-built preview had loaded — which the preview
  // effect above never does for a staging write, only for a commit, a delivery, or a
  // gate run (`getSubmissionPreview` serves a *gate-built* artifact and never reflects
  // the live staging buffer at all). On a game that has ever delivered, that is always,
  // so an owner staging a file through the Code surface (or an agent staging one after
  // its own gate-built preview loaded) would edit, stage, and watch nothing happen —
  // silently, because staged-preview failures are silent by design (CE-12).
  useEffect(() => {
    const latest = status?.playable?.[0];
    const latestAt = latest?.createdAt ? Date.parse(latest.createdAt) : null;
    // Conservative when the newest playable carries no timestamp: treat the loaded
    // preview as still the freshest thing we know about, same as the old behaviour.
    const previewIsFresher =
      preview != null && (latestAt === null || !Number.isFinite(latestAt) || preview.at >= latestAt);
    if (previewIsFresher || !latest) {
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
        channelRetryRef.current = 0;
        setChannel({
          html,
          at: latest.createdAt ? Date.parse(latest.createdAt) : Date.now(),
          label: latest.label ?? null,
          // The scaffold has its own ribbon identity; nobody staged it.
          seed: latest.origin === 'seed',
        });
      })
      .catch(() => {
        if (activeTokenRef.current !== requestToken) return;
        // Same reasoning as the published-fetch retry below: a transient failure must
        // not permanently blank the stage just because this ref will never come around
        // again on its own (no PR preview means no other trigger to retry with).
        if (channelRetryRef.current < 3) {
          channelRetryRef.current += 1;
          window.setTimeout(() => {
            if (activeTokenRef.current === requestToken) setChannelRetryTick((tick) => tick + 1);
          }, 4_000);
        } else {
          loadedChannelRef.current = latest.ref;
        }
      })
      .finally(() => {
        if (activeTokenRef.current !== requestToken) return;
        channelInFlightRef.current = false;
      });
  }, [preview, status?.playable, token, channelRetryTick]);

  // Once the game has published, the stage shows the delivered build itself — the
  // same document a player sees — rather than a stale staged/channel copy. Fetched
  // whenever a slug exists, not only while the round is currently `published`: an
  // improvement round on an already-live game keeps this as the fallback under the
  // "building" card, instead of the stage going blank the moment a new round opens.
  useEffect(() => {
    const slug = status?.slug;
    if (!slug) return;
    // Distinct key per published-ness — a round must refetch once it publishes.
    const isPublishedNow = status?.status === 'published';
    const key = isPublishedNow ? slug : `${slug}:fallback`;
    if (loadedPublishedSlugRef.current === key || publishedInFlightRef.current) return;

    publishedInFlightRef.current = true;
    const requestToken = token;
    fetchPublishedGame(slug)
      .then((game) => {
        if (activeTokenRef.current !== requestToken) return;
        loadedPublishedSlugRef.current = key;
        publishedRetryRef.current = 0;
        setPublished({ html: game.html, slug });
      })
      .catch(() => {
        if (activeTokenRef.current !== requestToken) return;
        // Leave the key unmarked so this effect retries — a transient failure here
        // must not permanently blank a published game's stage. Cap attempts so a
        // genuinely broken slug doesn't retry forever.
        if (publishedRetryRef.current < 3) {
          publishedRetryRef.current += 1;
          window.setTimeout(() => {
            if (activeTokenRef.current === requestToken) setPublishedRetryTick((tick) => tick + 1);
          }, 4_000);
        } else {
          loadedPublishedSlugRef.current = key;
        }
      })
      .finally(() => {
        if (activeTokenRef.current !== requestToken) return;
        publishedInFlightRef.current = false;
      });
  }, [status?.status, status?.slug, token, publishedRetryTick]);

  const isPublished = !selectedPreviewVersion && status?.status === 'published' && Boolean(status.slug);
  // When a historical version preview is explicitly selected, it takes precedence over normal stage sources.
  const hasVersionPreview = Boolean(selectedPreviewVersion && versionPreview?.html);
  // The fetch-freshness fix above (CE-12) is wasted if display still prefers `preview`
  // unconditionally — a fresher `channel` document that gets fetched must also get
  // shown, or the stage keeps rendering the stale gate-built preview underneath it.
  const showChannel = !hasVersionPreview && channel != null && (preview === null || channel.at > preview.at);
  const rawHtml = hasVersionPreview
    ? versionPreview!.html
    : isPublished
      ? (published?.html ?? null)
      : showChannel
        ? channel!.html
        : (preview?.html ?? channel?.html ?? published?.html ?? null);
  const html = rawHtml ? embedGameHtml(withGameLocale(rawHtml, i18n.language)) : null;

  let origin: StageOrigin = NONE_ORIGIN;
  if (hasVersionPreview) {
    origin = { kind: 'staged', at: versionPreview!.at, versionLabel: versionPreview!.version };
  } else if (isPublished) {
    origin = { kind: 'delivered', at: null, versionLabel: null };
  } else if (showChannel) {
    origin = { kind: channel!.seed ? 'seed' : 'staged', at: channel!.at, versionLabel: channel!.label };
  } else if (preview) {
    origin = { kind: 'staged', at: preview.at, versionLabel: null };
  } else if (channel) {
    origin = { kind: channel.seed ? 'seed' : 'staged', at: channel.at, versionLabel: channel.label };
  } else if (published) {
    origin = { kind: 'delivered', at: null, versionLabel: null };
  } else if (status && !status.preview && !status.playable?.length) {
    origin = NONE_ORIGIN;
  }

  // Track 2: a synchronous preview beats waiting on the next status poll.
  const pushPreview = useCallback((nextHtml: string) => {
    setPreview({ html: nextHtml, at: Date.now() });
  }, []);

  return { html, rawHtml, origin, pushPreview };
}
