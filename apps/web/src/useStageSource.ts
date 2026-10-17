import { useCallback, useEffect, useRef, useState } from 'react';
import i18n from './i18n/index.js';
import { fetchPublishedGame } from './catalog.js';
import { embedGameHtml, withGameLocale } from './gamePlayer.js';
import { publishedBuildVersion } from './stageCheckVerdict.js';
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
  // Gate version on stage; versionLabel may be a free-text caption.
  version?: string | null;
  artifactVersion?: string;
};

export type StageSource = {
  html: string | null;
  rawHtml: string | null;
  origin: StageOrigin;
};

const NONE_ORIGIN: StageOrigin = { kind: 'none', at: null, versionLabel: null };

// Shares the latest playable source between the stage and thread.
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
  const deliveredPreviewVersion = status?.recentBuilds?.find(
    (build) => build.version === status.progress?.headSha,
  )?.version;
  const [preview, setPreview] = useState<{ html: string; at: number; version?: string | null } | null>(null);
  const [versionPreview, setVersionPreview] = useState<{ html: string; at: number; version: string } | null>(null);
  const [channel, setChannel] = useState<{
    html: string;
    at: number;
    label: string | null;
    seed: boolean;
  } | null>(null);
  const [published, setPublished] = useState<{ html: string; slug: string; artifactVersion?: string } | null>(null);
  const [dataToken, setDataToken] = useState(token);

  const loadedVersionPreviewKeyRef = useRef<string | null>(null);
  const versionPreviewInFlightRef = useRef(false);
  const loadedPreviewKeyRef = useRef<string | null>(null);
  const previewRequestKeyRef = useRef<string | null>(null);
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

  // Ignore completed fetches belonging to a previously selected game.
  const activeTokenRef = useRef(token);

  // Reset before children can render the previous token's content.
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
    previewRequestKeyRef.current = null;
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

  // New deliveries supersede requests still fetching the previous document.
  useEffect(() => {
    const previewSlug = status?.preview?.slug;
    const headSha = status?.progress?.headSha;
    const gateRunAt = status?.previewGate?.ranAt;
    const previewKey = `${headSha ?? 'unknown'}:${gateRunAt ?? ''}`;
    if (!previewSlug) return;
    if (headSha && previewKey === loadedPreviewKeyRef.current) return;
    if (!headSha && loadedPreviewKeyRef.current !== null) return;

    if (previewRequestKeyRef.current !== previewKey) {
      previewRequestKeyRef.current = previewKey;
      previewRetryRef.current = 0;
    }
    let cancelled = false;
    let retryTimer: number | undefined;
    const requestToken = token;
    // Pin deliveries so a cached fallback cannot impersonate the new version.
    const request = deliveredPreviewVersion
      ? getSubmissionPreview(token, deliveredPreviewVersion)
      : getSubmissionPreview(token);
    request
      .then((result) => {
        if (cancelled || activeTokenRef.current !== requestToken) return;
        loadedPreviewKeyRef.current = previewKey;
        previewRetryRef.current = 0;
        // Prefer the gate's own "produced at" over the client's fetch time — the
        // latter is only comparable to a channel build's `createdAt` while the page
        // stays open (see the CE-12 note above).
        const producedAt = gateRunAt ? Date.parse(gateRunAt) : NaN;
        setPreview({
          html: result.html,
          at: Number.isFinite(producedAt) ? producedAt : Date.now(),
          version: headSha ?? null,
        });
      })
      .catch(() => {
        // Assembly can still be finishing; retain the previous playable document.
        if (cancelled || activeTokenRef.current !== requestToken) return;
        if (previewRetryRef.current < 3) {
          previewRetryRef.current += 1;
          retryTimer = window.setTimeout(() => {
            if (activeTokenRef.current === requestToken) setPreviewRetryTick((tick) => tick + 1);
          }, 4_000);
        } else {
          loadedPreviewKeyRef.current = previewKey;
        }
      });
    return () => {
      cancelled = true;
      window.clearTimeout(retryTimer);
    };
  }, [
    status?.preview?.slug,
    status?.progress?.headSha,
    status?.previewGate?.ranAt,
    deliveredPreviewVersion,
    token,
    previewRetryTick,
  ]);

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

  // Published HTML and its content hash remain the fallback during improvement.
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
        setPublished({ html: game.html, slug, artifactVersion: game.artifactVersion });
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
  // Prefer the freshest fetched document.
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
    const { at, version } = versionPreview!;
    origin = { kind: 'staged', at, versionLabel: version, version };
  } else if (isPublished) {
    origin = {
      kind: 'delivered',
      at: null,
      versionLabel: null,
      version: publishedBuildVersion(status),
      artifactVersion: published?.artifactVersion,
    };
  } else if (showChannel) {
    origin = { kind: channel!.seed ? 'seed' : 'staged', at: channel!.at, versionLabel: channel!.label };
  } else if (preview) {
    origin = { kind: 'staged', at: preview.at, versionLabel: null, version: preview.version ?? null };
  } else if (channel) {
    origin = { kind: channel.seed ? 'seed' : 'staged', at: channel.at, versionLabel: channel.label };
  } else if (published) {
    origin = {
      kind: 'delivered',
      at: null,
      versionLabel: null,
      version: publishedBuildVersion(status),
      artifactVersion: published?.artifactVersion,
    };
  } else if (status && !status.preview && !status.playable?.length) {
    origin = NONE_ORIGIN;
  }

  const pushPreview = useCallback((nextHtml: string) => {
    setPreview({ html: nextHtml, at: Date.now(), version: null });
  }, []);

  return { html, rawHtml, origin, pushPreview };
}
