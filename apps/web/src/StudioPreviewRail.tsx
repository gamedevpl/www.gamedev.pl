import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchPublishedGame } from './catalog.js';
import { GameFrame } from './GameFrame.js';
import { useCreatorPlaytest, useGamePlayer } from './gamePlayer.js';
import { useEditorDraftBridge } from './editorBridge.js';
import { PixelIcon } from './PixelIcon.js';
import { buildMediaUrl, getSubmissionPreview, getSubmissionStatus, type BuildMediaItem } from './submissionApi.js';
import type { StudioGame } from './studioApi.js';

/**
 * Desktop inset Game view beside the studio thread (Codex / Unity-style).
 * Full-viewport playtest theater stays available via Expand — phones keep using
 * that path only (this rail mounts only when the parent opts in at ≥1100px).
 */

/** Same offline toy as StudioPlaytestPanel — seeded Studio has no games-repo HTML. */
const DEV_PLAYTEST_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>Studio preview</title>
<style>html,body{margin:0;height:100%;background:#0b1018;overflow:hidden}canvas{display:block;width:100%;height:100%}</style>
</head><body><canvas id="game"></canvas>
<script>
(function(){
  var c=document.getElementById('game'),x=c.getContext('2d'),t=0;
  function resize(){c.width=innerWidth;c.height=innerHeight;}
  addEventListener('resize',resize);resize();
  (function loop(){
    t+=0.02;x.fillStyle='#0b1018';x.fillRect(0,0,c.width,c.height);
    for(var i=0;i<12;i++){
      var a=t+i*0.5,r=40+i*8;
      x.beginPath();
      x.arc(c.width/2+Math.cos(a)*r,c.height/2+Math.sin(a*1.3)*r,6,0,Math.PI*2);
      x.fillStyle='hsl('+(i*28+t*40)+' 70% 55%)';x.fill();
    }
    x.fillStyle='#9fe870';x.font='600 16px system-ui';x.fillText('Studio playtest demo',16,28);
    requestAnimationFrame(loop);
  })();
})();
</script></body></html>`;

export type StudioPreviewRailHandle = {
  pause: () => void;
  resume: () => void;
  hasHtml: boolean;
  paused: boolean;
};

type StudioPreviewRailProps = {
  game: StudioGame;
  published: boolean;
  onExpand: () => void;
  onTransportChange?: (state: { hasHtml: boolean; paused: boolean }) => void;
};

export const StudioPreviewRail = forwardRef<StudioPreviewRailHandle, StudioPreviewRailProps>(function StudioPreviewRail(
  { game, published, onExpand, onTransportChange },
  ref,
) {
  const { t } = useTranslation();
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [media, setMedia] = useState<BuildMediaItem[]>([]);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const active = Boolean(html);
  const { paused, pause, resume } = useCreatorPlaytest(frameRef, active);
  useGamePlayer(frameRef, active);
  useEditorDraftBridge(frameRef, active, game.slug, Boolean(game.editable));

  useImperativeHandle(
    ref,
    () => ({
      pause,
      resume,
      hasHtml: Boolean(html),
      paused,
    }),
    [pause, resume, html, paused],
  );

  useEffect(() => {
    onTransportChange?.({ hasHtml: Boolean(html), paused });
  }, [html, paused, onTransportChange]);

  useEffect(() => {
    let cancelled = false;
    setHtml(null);
    setLoadError(null);
    setLoading(true);

    const load =
      published && game.slug
        ? fetchPublishedGame(game.slug).then((doc) => doc.html)
        : getSubmissionPreview(game.token).then((preview) => preview.html);

    load
      .then((documentHtml) => {
        if (cancelled) return;
        setHtml(documentHtml);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        if (import.meta.env.MODE === 'development') {
          setHtml(DEV_PLAYTEST_HTML);
          setLoading(false);
          return;
        }
        setLoadError(t('studioPanel.playtest.loadError'));
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [game.token, game.slug, published, t]);

  useEffect(() => {
    let cancelled = false;
    getSubmissionStatus(game.token)
      .then((status) => {
        if (cancelled) return;
        setMedia(status.media ?? []);
      })
      .catch(() => {
        if (!cancelled) setMedia([]);
      });
    return () => {
      cancelled = true;
    };
  }, [game.token]);

  return (
    <aside className="studio-preview-rail" aria-label={t('studioPanel.preview.aria')}>
      <div className="studio-preview-rail-head">
        <span className="studio-preview-rail-title">{t('studioPanel.preview.title')}</span>
        {html ? <span className="studio-preview-rail-live">{t('studioPanel.preview.live')}</span> : null}
      </div>

      <div className={`studio-preview-stage${html ? ' is-live' : ''}`}>
        {html ? (
          <GameFrame frameRef={frameRef} title={game.title} html={html} embed />
        ) : (
          <div className="studio-preview-empty">
            {loading ? <p className="studio-muted">{t('studioPanel.playtest.loading')}</p> : null}
            {loadError ? <p className="error">{loadError}</p> : null}
            {!loading && !loadError ? <p className="studio-muted">{t('studioPanel.preview.empty')}</p> : null}
          </div>
        )}
      </div>

      <div className="studio-preview-controls">
        {html && !paused ? (
          <button type="button" className="studio-preview-play" onClick={pause}>
            <PixelIcon name="pause" size={12} /> {t('studioPanel.preview.pause')}
          </button>
        ) : (
          <button
            type="button"
            className="studio-preview-play"
            onClick={() => {
              if (html && paused) resume();
            }}
            disabled={!html}
          >
            <PixelIcon name="play" size={12} />{' '}
            {html && paused ? t('studioPanel.playtest.resume') : t('studioPanel.tabs.playtest')}
          </button>
        )}
        <button
          type="button"
          className="studio-preview-expand"
          onClick={onExpand}
          aria-label={t('studioPanel.preview.expand')}
          title={t('studioPanel.preview.expand')}
        >
          <PixelIcon name="expand" size={12} />
        </button>
      </div>

      {media.length > 0 ? (
        <div className="studio-preview-media">
          <div className="studio-preview-media-label">{t('studioPanel.preview.media')}</div>
          <div className="studio-preview-film" role="list">
            {media.slice(0, 8).map((item) => {
              const src = buildMediaUrl(game.token, item);
              return (
                <button
                  key={`${item.source}:${item.ref}`}
                  type="button"
                  className="studio-preview-thumb"
                  role="listitem"
                  onClick={() => setLightbox(src)}
                  aria-label={item.label?.trim() || t('studioPanel.preview.shot')}
                >
                  <img src={src} alt="" loading="lazy" />
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {lightbox ? (
        <button
          type="button"
          className="studio-preview-lightbox"
          onClick={() => setLightbox(null)}
          aria-label={t('studioPanel.preview.closeShot')}
        >
          <img src={lightbox} alt="" />
        </button>
      ) : null}
    </aside>
  );
});
