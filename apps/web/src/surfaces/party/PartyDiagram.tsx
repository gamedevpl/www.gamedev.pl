import { useTranslation } from 'react-i18next';

// Each phone drives one character: same color, same pressed direction.
const PLAYERS = [
  {
    id: 'a',
    phoneCx: 116,
    color: 'var(--turquoise)',
    markerId: 'pdArrowA',
    curve: 'M116,192 C116,148 214,138 296,130',
    delay: '0s',
    direction: 'left',
    charX: 245,
  },
  {
    id: 'b',
    phoneCx: 320,
    color: 'var(--accent-blue)',
    markerId: 'pdArrowB',
    curve: 'M320,192 L320,134',
    delay: '0.45s',
    direction: 'up',
    charX: 320,
  },
  {
    id: 'c',
    phoneCx: 524,
    color: 'var(--cat-multiplayer-party)',
    markerId: 'pdArrowC',
    curve: 'M524,192 C524,148 426,138 344,130',
    delay: '0.9s',
    direction: 'right',
    charX: 390,
  },
] as const;

const GROUND_Y = 118;

function Character({ player }: { player: (typeof PLAYERS)[number] }) {
  const { charX, color, direction } = player;
  if (direction === 'up') {
    return (
      <circle
        className={`party-diagram-character party-diagram-move-${direction}`}
        style={{ animationDelay: player.delay }}
        cx={charX}
        cy={GROUND_Y - 8}
        r="8"
        fill={color}
      />
    );
  }
  if (direction === 'right') {
    return (
      <polygon
        className={`party-diagram-character party-diagram-move-${direction}`}
        style={{ animationDelay: player.delay }}
        points={`${charX},${GROUND_Y - 14} ${charX + 7},${GROUND_Y - 7} ${charX},${GROUND_Y} ${charX - 7},${GROUND_Y - 7}`}
        fill={color}
      />
    );
  }
  return (
    <rect
      className={`party-diagram-character party-diagram-move-${direction}`}
      style={{ animationDelay: player.delay }}
      x={charX - 7}
      y={GROUND_Y - 14}
      width="14"
      height="14"
      rx="3"
      fill={color}
    />
  );
}

function DpadGlyph({ player }: { player: (typeof PLAYERS)[number] }) {
  const { phoneCx: cx, color, direction, delay } = player;
  const up = `${cx},212 ${cx - 5},221 ${cx + 5},221`;
  const down = `${cx},250 ${cx - 5},241 ${cx + 5},241`;
  const left = `${cx - 9},231 ${cx},226 ${cx},236`;
  const right = `${cx + 9},231 ${cx},226 ${cx},236`;
  const shapes: Record<string, string> = { up, down, left, right };
  return (
    <>
      {Object.entries(shapes).map(([dir, points]) => (
        <polygon
          key={dir}
          points={points}
          fill={dir === direction ? color : 'var(--muted)'}
          opacity={dir === direction ? undefined : 0.3}
          className={dir === direction ? 'party-diagram-dpad-active' : undefined}
          style={dir === direction ? { animationDelay: delay } : undefined}
        />
      ))}
    </>
  );
}

// The screen runs the game; phones only ever send it input.
export function PartyDiagram() {
  const { t } = useTranslation();

  return (
    <figure className="party-diagram">
      <svg viewBox="0 0 640 300" role="img" aria-label={t('party.diagramAlt')} xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="pdGlow" cx="50%" cy="35%" r="60%">
            <stop offset="0%" stopColor="var(--turquoise)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--turquoise)" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="pdBezel" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--panel-card)" />
            <stop offset="100%" stopColor="var(--panel)" />
          </linearGradient>
          {PLAYERS.map((player) => (
            <marker
              key={player.markerId}
              id={player.markerId}
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L10,5 L0,10 Z" fill={player.color} />
            </marker>
          ))}
        </defs>

        <ellipse className="party-diagram-glow" cx="320" cy="80" rx="150" ry="90" fill="url(#pdGlow)" />
        <ellipse cx="320" cy="286" rx="230" ry="8" fill="#000" opacity="0.28" />
        <line x1="24" y1="278" x2="616" y2="278" stroke="var(--panel-border)" strokeWidth="1.5" />

        <path
          d="M300,150 L340,150 L354,172 L286,172 Z"
          fill="url(#pdBezel)"
          stroke="var(--panel-border)"
          strokeWidth="1.5"
        />
        <rect
          x="282"
          y="172"
          width="76"
          height="8"
          rx="2"
          fill="url(#pdBezel)"
          stroke="var(--panel-border)"
          strokeWidth="1.5"
        />

        <rect
          x="196"
          y="14"
          width="248"
          height="140"
          rx="12"
          fill="url(#pdBezel)"
          stroke="var(--panel-border)"
          strokeWidth="2"
        />
        <circle className="party-diagram-cam" cx="320" cy="27" r="3" fill="var(--turquoise)" />
        <rect x="209" y="38" width="222" height="102" rx="5" fill="#05070a" />

        <g className="party-diagram-scene">
          <line x1="219" y1={GROUND_Y} x2="431" y2={GROUND_Y} stroke="var(--panel-border)" strokeWidth="2" />
          {PLAYERS.map((player) => (
            <Character key={player.id} player={player} />
          ))}
        </g>

        {PLAYERS.map((player) => (
          <g key={player.id}>
            <path
              className="party-diagram-flow"
              d={player.curve}
              fill="none"
              stroke={player.color}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray="1 9"
              markerEnd={`url(#${player.markerId})`}
              style={{ animationDelay: player.delay }}
            />
            <circle
              className="party-diagram-ripple"
              cx={player.phoneCx}
              cy="227"
              r="16"
              fill="none"
              stroke={player.color}
              strokeWidth="1.5"
              style={{ animationDelay: player.delay }}
            />
            <rect
              x={player.phoneCx - 23}
              y="192"
              width="46"
              height="86"
              rx="10"
              fill="url(#pdBezel)"
              stroke="var(--panel-border)"
              strokeWidth="2"
            />
            <rect x={player.phoneCx - 15} y="202" width="30" height="56" rx="3" fill="#05070a" />
            <DpadGlyph player={player} />
            <circle cx={player.phoneCx} cy="266" r="2" fill="var(--panel-border)" />
          </g>
        ))}

        <text
          x="320"
          y="296"
          textAnchor="middle"
          fontSize="11"
          fontWeight="700"
          fill="var(--muted)"
          letterSpacing="0.04em"
        >
          {t('party.diagramPhonesLabel')}
        </text>
      </svg>
      <figcaption>{t('party.diagramCaption')}</figcaption>
    </figure>
  );
}
