import { useTranslation } from 'react-i18next';

/**
 * What the creator asks the agent to build: a flat 2D game, or one using the
 * `gfx3d` GameKit module. Mirrored by `DimensionSchema` in `apps/api/src/submissions.ts`.
 */
export type GameDimension = '2d' | '3d';

export const DEFAULT_DIMENSION: GameDimension = '2d';

interface DimensionToggleProps {
  value: GameDimension;
  onChange: (next: GameDimension) => void;
  disabled?: boolean;
}

/**
 * 2D ⇄ 3D, shaped as a physical switch rather than two segments.
 *
 * `role="switch"`, not `radiogroup`: the two options are not peers. 2D is the
 * default and the light path; 3D is an opt-in onto the heavier one — the agent has
 * to select `gfx3d`, which carries its own byte reserve on top of the author budget
 * (see `apps/api/src/games-repo-contract.ts`). A screen reader saying "3D graphics,
 * off" describes that honestly; "2D selected, one of two" would not. The knob only
 * colours up on 3D for the same reason: the accent marks the opt-in, not the state.
 *
 * The side labels are pointer-only shortcuts — `aria-hidden` and out of the tab
 * order — because they are visual duplicates of the switch's own label. Adding them
 * as real tab stops would give one control three, and a screen reader "2D, 3D, 3D
 * graphics off" reads as three separate things rather than one.
 */
export function DimensionToggle({ value, onChange, disabled = false }: DimensionToggleProps) {
  const { t } = useTranslation();
  const is3d = value === '3d';

  return (
    <span className="dimension-toggle">
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        disabled={disabled}
        className={`dimension-side${is3d ? '' : ' is-on'}`}
        onClick={() => onChange('2d')}
      >
        {t('hero.dimension2d')}
      </button>

      <button
        type="button"
        role="switch"
        aria-checked={is3d}
        aria-label={t('hero.dimensionSwitchLabel')}
        disabled={disabled}
        className="dimension-switch"
        onClick={() => onChange(is3d ? '2d' : '3d')}
        onKeyDown={(event) => {
          // Space and Enter come free with <button>. Arrows are added because the
          // control reads as left/right on screen, and reaching for them is the
          // first thing anyone does with a two-position switch.
          if (event.key === 'ArrowLeft') {
            event.preventDefault();
            onChange('2d');
          } else if (event.key === 'ArrowRight') {
            event.preventDefault();
            onChange('3d');
          }
        }}
      >
        <span className="dimension-track">
          <span className="dimension-knob" />
        </span>
      </button>

      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        disabled={disabled}
        className={`dimension-side${is3d ? ' is-on' : ''}`}
        onClick={() => onChange('3d')}
      >
        {t('hero.dimension3d')}
      </button>
    </span>
  );
}
