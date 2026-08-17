import { useTranslation } from 'react-i18next';

const PHONES = [
  { cx: 116, delay: '0s', curve: 'M116,192 C116,148 214,138 296,130' },
  { cx: 320, delay: '0.35s', curve: 'M320,192 L320,134' },
  { cx: 524, delay: '0.7s', curve: 'M524,192 C524,148 426,138 344,130' },
];

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
          <marker
            id="partyDiagramArrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,5 L0,10 Z" fill="var(--turquoise)" />
          </marker>
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
          <line x1="219" y1="118" x2="431" y2="118" stroke="var(--panel-border)" strokeWidth="2" />
          <g className="party-diagram-character">
            <rect x="243" y="98" width="12" height="12" fill="var(--turquoise)" />
            <rect x="243" y="86" width="12" height="12" fill="var(--turquoise)" />
            <rect x="231" y="98" width="12" height="12" fill="var(--turquoise)" />
          </g>
          <circle
            className="party-diagram-collect party-diagram-collect-a"
            cx="330"
            cy="104"
            r="5"
            fill="var(--accent-blue)"
          />
          <circle
            className="party-diagram-collect party-diagram-collect-b"
            cx="372"
            cy="112"
            r="5"
            fill="var(--accent-blue)"
          />
        </g>

        {PHONES.map((phone, i) => (
          <g key={phone.cx}>
            <path
              className="party-diagram-flow"
              d={phone.curve}
              fill="none"
              stroke="var(--turquoise)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray="1 9"
              markerEnd="url(#partyDiagramArrow)"
              style={{ animationDelay: phone.delay }}
            />
            <circle
              className="party-diagram-ripple"
              cx={phone.cx}
              cy="227"
              r="16"
              fill="none"
              stroke="var(--turquoise)"
              strokeWidth="1.5"
              style={{ animationDelay: phone.delay }}
            />
            <rect
              x={phone.cx - 23}
              y="192"
              width="46"
              height="86"
              rx="10"
              fill="url(#pdBezel)"
              stroke="var(--panel-border)"
              strokeWidth="2"
            />
            <rect x={phone.cx - 15} y="202" width="30" height="56" rx="3" fill="#05070a" />
            <polygon
              className="party-diagram-dpad"
              points={`${phone.cx},212 ${phone.cx - 5},221 ${phone.cx + 5},221`}
              fill="var(--turquoise)"
              style={{ animationDelay: phone.delay }}
            />
            <polygon
              className="party-diagram-dpad"
              points={`${phone.cx},250 ${phone.cx - 5},241 ${phone.cx + 5},241`}
              fill="var(--turquoise)"
              style={{ animationDelay: `calc(${phone.delay} + 0.5s)` }}
            />
            <polygon
              className="party-diagram-dpad"
              points={`${phone.cx - 9},231 ${phone.cx},226 ${phone.cx},236`}
              fill="var(--turquoise)"
              style={{ animationDelay: `calc(${phone.delay} + 1s)` }}
            />
            <polygon
              className="party-diagram-dpad"
              points={`${phone.cx + 9},231 ${phone.cx},226 ${phone.cx},236`}
              fill="var(--turquoise)"
              style={{ animationDelay: `calc(${phone.delay} + 1.5s)` }}
            />
            <circle cx={phone.cx} cy="266" r="2" fill="var(--panel-border)" />
            {i === 1 ? (
              <text x={phone.cx + 34} y="176" fontSize="10.5" fontWeight="700" fill="var(--turquoise)">
                {t('party.diagramInputLabel')}
              </text>
            ) : null}
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
