import type { CatalogOrientation } from './catalog.js';
import { publishedBuildVersion } from './stageCheckVerdict.js';
import type { SubmissionStatus } from './submissionApi.js';

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
  orientation?: CatalogOrientation;
};

export type StagePreviewEntry = { html: string; at: number; version?: string | null; orientation?: CatalogOrientation };
export type StageVersionPreviewEntry = { html: string; at: number; version: string; orientation?: CatalogOrientation };
export type StageChannelEntry = { html: string; at: number; label: string | null; seed: boolean };
export type StagePublishedEntry = {
  html: string;
  slug: string;
  artifactVersion?: string;
  orientation?: CatalogOrientation;
};

const NONE_ORIGIN: StageOrigin = { kind: 'none', at: null, versionLabel: null };

export function resolveStageSourceState(input: {
  status: SubmissionStatus | null;
  selectedPreviewVersion: string | null;
  preview: StagePreviewEntry | null;
  versionPreview: StageVersionPreviewEntry | null;
  channel: StageChannelEntry | null;
  published: StagePublishedEntry | null;
}): { rawHtml: string | null; origin: StageOrigin; orientation?: CatalogOrientation } {
  const { status, selectedPreviewVersion, preview, versionPreview, channel, published } = input;
  const isPublished = !selectedPreviewVersion && status?.status === 'published' && Boolean(status.slug);
  const hasVersionPreview = Boolean(selectedPreviewVersion && versionPreview?.html);
  const showChannel = !hasVersionPreview && channel != null && (preview === null || channel.at > preview.at);

  if (hasVersionPreview) {
    const { html, at, version, orientation } = versionPreview!;
    return { rawHtml: html, origin: { kind: 'staged', at, versionLabel: version, version }, orientation };
  }
  if (isPublished) {
    return {
      rawHtml: published?.html ?? null,
      origin: {
        kind: 'delivered',
        at: null,
        versionLabel: null,
        version: publishedBuildVersion(status),
        artifactVersion: published?.artifactVersion,
      },
      orientation: published?.orientation,
    };
  }
  if (showChannel) {
    return {
      rawHtml: channel!.html,
      origin: { kind: channel!.seed ? 'seed' : 'staged', at: channel!.at, versionLabel: channel!.label },
      orientation: undefined,
    };
  }
  if (preview) {
    return {
      rawHtml: preview.html,
      origin: { kind: 'staged', at: preview.at, versionLabel: null, version: preview.version ?? null },
      orientation: preview.orientation,
    };
  }
  if (channel) {
    return {
      rawHtml: channel.html,
      origin: { kind: channel.seed ? 'seed' : 'staged', at: channel.at, versionLabel: channel.label },
      orientation: undefined,
    };
  }
  if (published) {
    return {
      rawHtml: published.html,
      origin: {
        kind: 'delivered',
        at: null,
        versionLabel: null,
        version: publishedBuildVersion(status),
        artifactVersion: published.artifactVersion,
      },
      orientation: published.orientation,
    };
  }
  return { rawHtml: null, origin: NONE_ORIGIN, orientation: undefined };
}
