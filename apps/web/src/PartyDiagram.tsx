import { useTranslation } from 'react-i18next';

// The screen runs the game; phones only ever send it input.
export function PartyDiagram() {
  const { t } = useTranslation();

  return (
    <figure className="party-diagram">
      <svg viewBox="0 0 640 260" role="img" aria-label={t('party.diagramAlt')} xmlns="http://www.w3.org/2000/svg">
        <defs>
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

        <line x1="24" y1="234" x2="616" y2="234" stroke="var(--panel-border)" strokeWidth="1.5" />

        <path
          d="M300,130 L340,130 L352,150 L288,150 Z"
          fill="var(--panel-card)"
          stroke="var(--panel-border)"
          strokeWidth="1.5"
        />
        <rect
          x="286"
          y="150"
          width="68"
          height="8"
          rx="2"
          fill="var(--panel-card)"
          stroke="var(--panel-border)"
          strokeWidth="1.5"
        />

        <rect
          x="200"
          y="10"
          width="240"
          height="124"
          rx="10"
          fill="var(--panel-card)"
          stroke="var(--panel-border)"
          strokeWidth="2"
        />
        <rect x="212" y="22" width="216" height="100" rx="4" fill="#05070a" />
        <line x1="222" y1="104" x2="418" y2="104" stroke="var(--panel-border)" strokeWidth="2" />
        <rect x="248" y="86" width="10" height="10" fill="var(--turquoise)" />
        <rect x="248" y="76" width="10" height="10" fill="var(--turquoise)" />
        <rect x="238" y="86" width="10" height="10" fill="var(--turquoise)" />
        <circle cx="330" cy="90" r="5" fill="var(--accent-blue)" />
        <circle cx="366" cy="98" r="5" fill="var(--accent-blue)" />
        <text
          x="320"
          y="42"
          textAnchor="middle"
          fontSize="11"
          fontWeight="700"
          fill="var(--muted)"
          letterSpacing="0.04em"
        >
          {t('party.diagramScreenLabel')}
        </text>

        {[
          { cx: 120, curve: 'M120,190 C120,150 220,140 296,132' },
          { cx: 320, curve: 'M320,190 L320,136' },
          { cx: 520, curve: 'M520,190 C520,150 420,140 344,132' },
        ].map((phone, i) => (
          <g key={phone.cx}>
            <path
              d={phone.curve}
              fill="none"
              stroke="var(--turquoise)"
              strokeWidth="2"
              strokeDasharray="5 5"
              opacity="0.85"
              markerEnd="url(#partyDiagramArrow)"
            />
            <rect
              x={phone.cx - 23}
              y="190"
              width="46"
              height="82"
              rx="10"
              fill="var(--panel-card)"
              stroke="var(--panel-border)"
              strokeWidth="2"
            />
            <rect x={phone.cx - 15} y="200" width="30" height="54" rx="3" fill="#05070a" />
            <polygon points={`${phone.cx},210 ${phone.cx - 5},219 ${phone.cx + 5},219`} fill="var(--turquoise)" />
            <polygon points={`${phone.cx},246 ${phone.cx - 5},237 ${phone.cx + 5},237`} fill="var(--turquoise)" />
            <polygon
              points={`${phone.cx - 8},228 ${phone.cx - 8 + 9},223 ${phone.cx - 8 + 9},233`}
              fill="var(--turquoise)"
            />
            <polygon
              points={`${phone.cx + 8},228 ${phone.cx + 8 - 9},223 ${phone.cx + 8 - 9},233`}
              fill="var(--turquoise)"
            />
            <circle cx={phone.cx} cy="262" r="2" fill="var(--panel-border)" />
            {i === 1 ? (
              <text x={phone.cx + 34} y="176" fontSize="10.5" fontWeight="700" fill="var(--turquoise)">
                {t('party.diagramInputLabel')}
              </text>
            ) : null}
          </g>
        ))}

        <text
          x="320"
          y="252"
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
