import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Mascot, type MascotEmotion, type MascotLook } from './Mascot.js';
import {
  GLANCE_EVERY_MS,
  POKE_REACTION,
  SETTLE_MS,
  SPARK_MS,
  STEP_KEYS,
  STEP_MASCOT,
  STEP_SCENES,
  WIN_HOLD_MS,
  WIN_REACTION,
  applyPoke,
  chainFrom,
  type StepScene,
} from './create-step-play.js';
import './create-step-play.css';

const POKE_LABEL: Record<StepScene, 'pokeQa' | 'pokeCode' | 'pokePlay' | 'pokeLive'> = {
  qa: 'pokeQa',
  code: 'pokeCode',
  play: 'pokePlay',
  live: 'pokeLive',
};

const LOOK_DOWN: MascotLook = { x: 0.15, y: 0.85 };
const LOOK_UP: MascotLook = { x: 0.1, y: -0.85 };

function emptyLooks(): Array<MascotLook | undefined> {
  return [undefined, undefined, undefined, undefined];
}

function emptyEmotions(): Array<MascotEmotion | null> {
  return [null, null, null, null];
}

export function CreateStepsList() {
  const { t } = useTranslation();
  const [emotions, setEmotions] = useState(emptyEmotions);
  const [looks, setLooks] = useState(emptyLooks);
  const [throwing, setThrowing] = useState<number | null>(null);
  const [catching, setCatching] = useState<number | null>(null);
  const [missAt, setMissAt] = useState<number | null>(null);
  const [won, setWon] = useState(false);
  const [comboNext, setComboNext] = useState(0);
  const comboRef = useRef(0);
  const busy = useRef(false);
  const timers = useRef<number[]>([]);

  const clearTimers = () => {
    for (const id of timers.current) window.clearTimeout(id);
    timers.current = [];
  };

  const later = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  useEffect(() => () => clearTimers(), []);

  useEffect(() => {
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    let glanceId = 0;
    const tick = () => {
      if (busy.current || document.hidden) return;
      const i = Math.floor(Math.random() * 3);
      setLooks((prev) => {
        const next = prev.slice();
        next[i] = LOOK_DOWN;
        next[i + 1] = LOOK_UP;
        return next;
      });
      window.clearTimeout(glanceId);
      glanceId = window.setTimeout(() => {
        if (!busy.current) setLooks(emptyLooks());
      }, 900);
    };
    const id = window.setInterval(tick, GLANCE_EVERY_MS);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(glanceId);
    };
  }, []);

  const poke = (index: number) => {
    clearTimers();
    busy.current = true;
    const result = applyPoke(comboRef.current, index);
    comboRef.current = result.comboNext;
    setComboNext(result.comboNext);
    setWon(result.won);
    setMissAt(result.miss ? index : null);

    const chain = result.miss ? [index] : result.won ? [0, 1, 2, 3] : chainFrom(index);
    const nextEmotions = emptyEmotions();
    const nextLooks = emptyLooks();
    setEmotions(nextEmotions);
    setLooks(nextLooks);
    setThrowing(null);
    setCatching(null);

    chain.forEach((n, k) => {
      later(k * SPARK_MS, () => {
        const scene = STEP_SCENES[n] ?? 'qa';
        setThrowing(k === 0 ? null : (chain[k - 1] ?? null));
        setCatching(n);
        setEmotions((prev) => {
          const copy = prev.slice();
          copy[n] = result.miss ? 'confused' : result.won ? WIN_REACTION[scene] : POKE_REACTION[scene];
          return copy;
        });
        setLooks((prev) => {
          const copy = prev.slice();
          if (k > 0) copy[chain[k - 1] ?? n] = LOOK_DOWN;
          copy[n] = k === 0 ? STEP_MASCOT[scene].look : LOOK_UP;
          return copy;
        });
      });
    });

    later(chain.length * SPARK_MS + SETTLE_MS, () => {
      if (result.won) return;
      busy.current = false;
      setThrowing(null);
      setCatching(null);
      setMissAt(null);
      setEmotions(emptyEmotions());
      setLooks(emptyLooks());
    });

    if (result.won) {
      later(chain.length * SPARK_MS + WIN_HOLD_MS, () => {
        busy.current = false;
        setWon(false);
        setThrowing(null);
        setCatching(null);
        setEmotions(emptyEmotions());
        setLooks(emptyLooks());
      });
    }
  };

  return (
    <>
      <ol className={`create-steps-list${won ? ' is-won' : ''}`} data-combo-next={comboNext}>
        {STEP_KEYS.map((key, index) => {
          const scene = STEP_SCENES[index] ?? 'qa';
          const pose = STEP_MASCOT[scene];
          const emotion = emotions[index] ?? pose.emotion;
          const look = looks[index] ?? pose.look;
          const classes = [
            'create-step-scene',
            `is-${scene}`,
            throwing === index ? 'is-throwing' : null,
            catching === index ? 'is-catching' : null,
            missAt === index ? 'is-miss' : null,
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <li
              key={key}
              className={[
                'create-step',
                throwing === index ? 'is-throwing' : null,
                catching === index ? 'is-catching' : null,
                missAt === index ? 'is-miss' : null,
              ]
                .filter(Boolean)
                .join(' ')}
              aria-current={catching === index ? 'step' : undefined}
            >
              <span className="create-step-index" aria-hidden="true" onClick={() => poke(index)}>
                <span className="create-step-n">{String(index + 1).padStart(2, '0')}</span>
              </span>
              <div className="create-step-card">
                <div className="create-step-body" onClick={() => poke(index)}>
                  <h3 className="create-step-title">{t(`create.${key}Title`)}</h3>
                  <p className="create-step-detail">{t(`create.${key}Detail`)}</p>
                </div>
                <button
                  type="button"
                  className={classes}
                  aria-label={t(`create.${POKE_LABEL[scene]}`)}
                  onClick={() => poke(index)}
                >
                  <span className="create-step-spark" aria-hidden="true" />
                  <Mascot emotion={emotion} look={look} size={48} />
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      <span className="create-step-status" role="status">
        {won ? t('create.comboBuilt') : ''}
      </span>
    </>
  );
}
