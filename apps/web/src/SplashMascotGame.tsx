import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { InteractiveMascot, Mascot, type MascotEmotion } from './Mascot.js';
import { PixelIcon } from './PixelIcon.js';
import {
  SNACK_ICONS,
  SPLASH_LIVES,
  createSplashGame,
  nudgeSplashMascot,
  setSplashMascotX,
  tickSplashGame,
  type SplashGameState,
} from './splashGame.js';

function overEmotion(score: number): MascotEmotion {
  if (score >= 15) return 'excited';
  if (score >= 8) return 'proud';
  if (score >= 1) return 'happy';
  return 'confused';
}

function motionSpeed(): number {
  if (typeof matchMedia !== 'function') return 1;
  return matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.45 : 1;
}

export function SplashMascotGame({ pokeLabel }: { pokeLabel: string }) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<'idle' | 'playing' | 'over'>('idle');
  const [view, setView] = useState<SplashGameState | null>(null);
  const [emotion, setEmotion] = useState<MascotEmotion>('curious');
  const [chomp, setChomp] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<SplashGameState | null>(null);
  const rafRef = useRef(0);
  const lastTsRef = useRef(0);
  const speedRef = useRef(1);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chompTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startGame = () => {
    const next = createSplashGame();
    stateRef.current = next;
    lastTsRef.current = 0;
    speedRef.current = motionSpeed();
    if (flashTimer.current) clearTimeout(flashTimer.current);
    if (chompTimer.current) clearTimeout(chompTimer.current);
    setChomp(false);
    setEmotion('curious');
    setView(next);
    setPhase('playing');
  };

  useEffect(() => {
    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
      if (chompTimer.current) clearTimeout(chompTimer.current);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(() => {
    if (phase === 'playing') stageRef.current?.focus({ preventScroll: true });
  }, [phase]);

  useEffect(() => {
    if (phase !== 'playing') return;

    const flash = (next: MascotEmotion) => {
      setEmotion(next);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => {
        flashTimer.current = null;
        setEmotion('curious');
      }, 420);
    };

    const loop = (ts: number) => {
      const prev = stateRef.current;
      if (!prev) return;
      const last = lastTsRef.current || ts;
      lastTsRef.current = ts;
      const { state, caught, missed } = tickSplashGame(prev, (ts - last) / 1000, Math.random, speedRef.current);
      stateRef.current = state;
      setView(state);
      if (caught > 0) {
        flash('happy');
        setChomp(true);
        if (chompTimer.current) clearTimeout(chompTimer.current);
        chompTimer.current = setTimeout(() => {
          chompTimer.current = null;
          setChomp(false);
        }, 180);
      } else if (missed > 0) {
        flash('sad');
      }
      if (state.status === 'over') {
        if (flashTimer.current) clearTimeout(flashTimer.current);
        setEmotion(overEmotion(state.score));
        setPhase('over');
        return;
      }
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase]);

  const aim = (event: ReactPointerEvent<HTMLDivElement>) => {
    const node = stageRef.current;
    const prev = stateRef.current;
    if (!node || !prev || prev.status !== 'playing') return;
    const rect = node.getBoundingClientRect();
    if (rect.width === 0) return;
    const next = setSplashMascotX(prev, (event.clientX - rect.left) / rect.width);
    stateRef.current = next;
    setView(next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const prev = stateRef.current;
    if (!prev || prev.status !== 'playing') return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const next = nudgeSplashMascot(prev, event.key === 'ArrowLeft' ? -1 : 1);
    stateRef.current = next;
    setView(next);
  };

  if (phase === 'idle' || view == null) {
    return (
      <div className="splash-game">
        <InteractiveMascot
          className="beta-splash__mascot"
          idleEmotion="wave"
          reactsToTilt
          doesPullUps
          size={96}
          pokeLabel={pokeLabel}
        />
        <button type="button" className="splash-game__play" onClick={startGame}>
          <PixelIcon name="gamepad" size={14} />
          {t('betaSplash.game.play')}
        </button>
      </div>
    );
  }

  return (
    <div className={phase === 'over' ? 'splash-game splash-game--over' : 'splash-game splash-game--playing'}>
      <div className="splash-game__hud">
        <span className="splash-game__score" aria-live="polite">
          {t('betaSplash.game.score', { count: view.score })}
        </span>
        <span className="splash-game__lives" aria-label={t('betaSplash.game.lives', { count: view.lives })}>
          {Array.from({ length: SPLASH_LIVES }, (_, index) => (
            <span
              key={index}
              className={index < view.lives ? 'splash-game__life' : 'splash-game__life splash-game__life--gone'}
            />
          ))}
        </span>
      </div>
      <div
        ref={stageRef}
        className="splash-game__stage"
        tabIndex={0}
        role="group"
        aria-label={t('betaSplash.game.region')}
        onPointerDown={(event) => {
          if (phase !== 'playing') return;
          event.currentTarget.setPointerCapture(event.pointerId);
          aim(event);
        }}
        onPointerMove={aim}
        onKeyDown={onKeyDown}
      >
        {view.snacks.map((snack) => (
          <span
            key={snack.id}
            className={`splash-game__snack splash-game__snack--${snack.kind}`}
            style={{ left: `${snack.x * 100}%`, top: `${snack.y * 100}%` }}
          >
            <PixelIcon name={SNACK_ICONS[snack.kind]} size={22} />
          </span>
        ))}
        <div
          className={chomp ? 'splash-game__catcher splash-game__catcher--chomp' : 'splash-game__catcher'}
          style={{ left: `${view.mascotX * 100}%` }}
        >
          <Mascot emotion={emotion} size={72} />
        </div>
        {phase === 'over' ? (
          <div className="splash-game__over">
            <p className="splash-game__over-copy">{t('betaSplash.game.over', { count: view.score })}</p>
            <button
              type="button"
              className="splash-game__again"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={startGame}
            >
              {t('betaSplash.game.again')}
            </button>
          </div>
        ) : null}
      </div>
      {phase === 'playing' ? <p className="splash-game__hint">{t('betaSplash.game.hint')}</p> : null}
    </div>
  );
}
