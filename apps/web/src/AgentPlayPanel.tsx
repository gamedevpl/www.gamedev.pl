// The agent play overlay; see docs/agent-play-mode.md.

// Chrome is localized; the grammar and guide stay English by design.

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AGENT_CAPABILITIES,
  AGENT_COMMANDS,
  AGENT_GUIDE,
  formatAffordances,
  formatObservation,
  formatSnapshotText,
} from './agentPlay.js';
import { parseAgentPlan, PlanError } from './agentPlan.js';
import { runAgentPlan, type PlanRunResult } from './agentPlanRunner.js';
import { useAgentPlay, type AgentLogEntry } from './useAgentPlay.js';
import { PixelIcon } from './PixelIcon.js';
import './agent-play.css';

type AgentPlayPanelProps = {
  open: boolean;
  frameRef: MutableRefObject<HTMLIFrameElement | null>;
  onClose: () => void;
};

// Quick verbs, so a human can drive without learning the grammar.
const QUICK_COMMANDS = ['look', 'step 1', 'step 10', 'play 500', 'screenshot'] as const;

// A starting plan, so the box is never a blank page.
const PLAN_EXAMPLE = JSON.stringify(
  {
    fps: 30,
    maxFrames: 600,
    script: [
      { tap: 'Enter' },
      { waitFor: { field: 'state', equals: 'playing', maxFrames: 120 } },
      { capture: 'round-start' },
      { repeat: { times: 3, actions: [{ press: { key: 'ArrowRight', frames: 20 } }, { wait: 10 }] } },
      { capture: 'after-moving' },
    ],
  },
  null,
  1,
);

function logLine(entry: AgentLogEntry): string {
  return `f${entry.frame} ${entry.kind}${entry.detail ? `: ${entry.detail}` : ''}`;
}

export function AgentPlayPanel({ open, frameRef, onClose }: AgentPlayPanelProps) {
  const { t } = useTranslation();
  const { hello, state, shot, history, signals, run, clearShot } = useAgentPlay(frameRef, open);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [planDraft, setPlanDraft] = useState(PLAN_EXAMPLE);
  const [planError, setPlanError] = useState<string | null>(null);
  const [planResult, setPlanResult] = useState<PlanRunResult | null>(null);
  const [planProgress, setPlanProgress] = useState<string | null>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // An attempt, not a keypress: full speed, no model in the loop.
  const runPlan = useCallback(async () => {
    setPlanError(null);
    setPlanResult(null);
    try {
      const plan = parseAgentPlan(planDraft);
      setPlanProgress('running…');
      const result = await runAgentPlan(frameRef.current, plan, {
        onProgress: (done, total) => setPlanProgress(`${done}/${total} actions`),
      });
      setPlanResult(result);
    } catch (error) {
      setPlanError(error instanceof PlanError || error instanceof Error ? error.message : 'the plan could not run');
    } finally {
      setPlanProgress(null);
    }
  }, [frameRef, planDraft]);

  const submit = useCallback(
    (line: string) => {
      if (!line.trim()) return;
      run(line);
      clearShot();
    },
    [clearShot, run],
  );

  if (!open) return null;

  const snapshot = state?.snapshot ?? {};
  // The observation is long: its own block, not the state line.
  const { observation, ...numbers } = snapshot;
  const observationText = formatObservation(observation);
  const stateText = formatSnapshotText(state?.frame ?? 0, numbers, state?.hiddenFields ?? null);
  const merged = [...(state?.log ?? []), ...signals].slice(-20);

  return (
    <aside className="agent-play" role="dialog" aria-label={t('player.agent.title')}>
      <header className="agent-play-bar">
        <span className="agent-play-heading">
          <PixelIcon name="gamepad" size={13} /> {t('player.agent.title')}
        </span>
        <span className="agent-play-status" role="status" aria-live="polite">
          {state ? `frame ${state.frame} · ${state.stepped ? 'paused (stepped)' : 'live'}` : t('player.agent.waiting')}
        </span>
        <button type="button" className="secondary-btn" onClick={onClose} aria-label={t('player.agent.close')}>
          <PixelIcon name="close" size={13} />
        </button>
      </header>

      <div className="agent-play-body">
        {hello && !hello.harness ? (
          <p className="agent-play-warn">
            this game exposes no harness — step and press are unavailable, only `play` and `live` work
          </p>
        ) : null}
        {state && state.hiddenFields === null ? (
          <p className="agent-play-warn">
            hiddenFields: none declared by this document — the snapshot below is unredacted, so a game with a hidden
            answer may be leaking it here
          </p>
        ) : null}

        {hello ? (
          <section className="agent-play-block">
            <h3>goal &amp; controls</h3>
            <pre>
              {[
                hello.hint ? `hint: ${hello.hint}` : null,
                ...hello.controlRows.map((row) => `  ${row.keys || '—'} → ${row.action}`),
              ]
                .filter(Boolean)
                .join('\n') || '(this game reported no controls)'}
            </pre>
          </section>
        ) : null}

        <section className="agent-play-block">
          <h3>state</h3>
          <pre aria-live="polite">{stateText}</pre>
        </section>

        {observationText ? (
          <section className="agent-play-block">
            <h3>seen</h3>
            <pre>{observationText}</pre>
          </section>
        ) : null}

        <section className="agent-play-block">
          <h3>ui</h3>
          <pre>{formatAffordances(state?.ui ?? [])}</pre>
        </section>

        {merged.length > 0 ? (
          <section className="agent-play-block">
            <h3>log</h3>
            <pre>{merged.map(logLine).join('\n')}</pre>
          </section>
        ) : null}

        {shot ? (
          <section className="agent-play-block">
            <h3>screenshot</h3>
            <img className="agent-play-shot" src={`data:image/png;base64,${shot}`} alt={t('player.agent.shotAlt')} />
          </section>
        ) : null}

        <section className="agent-play-block">
          <h3>plan</h3>
          <textarea
            className="agent-play-input agent-play-plan"
            rows={8}
            value={planDraft}
            spellCheck={false}
            aria-label={t('player.agent.planLabel')}
            onChange={(event) => setPlanDraft(event.target.value)}
          />
          <div className="agent-play-actions">
            <button
              type="button"
              className="primary-btn agent-play-run-plan"
              onClick={() => void runPlan()}
              disabled={planProgress !== null}
            >
              {planProgress ?? t('player.agent.runPlan')}
            </button>
          </div>
          {planError ? <p className="agent-play-warn">{planError}</p> : null}
        </section>

        {planResult ? (
          <section className="agent-play-block">
            <h3>attempt</h3>
            <pre aria-live="polite">
              {[
                `outcome: ${planResult.outcome}${planResult.note ? ` — ${planResult.note}` : ''}`,
                `frames: ${planResult.frames}`,
                ...planResult.checks.map(
                  (check) => `${check.passed ? 'ok  ' : 'FAIL'} ${check.kind} ${check.text} @f${check.frame}`,
                ),
                '',
                ...planResult.trace.map(
                  (entry) => `f${entry.frame} ${entry.action} · ${formatSnapshotText(entry.frame, entry.snapshot)}`,
                ),
              ].join('\n')}
            </pre>
            {planResult.captures.length > 0 ? (
              <div className="agent-play-strip">
                {planResult.captures.map((shot, index) =>
                  shot.png ? (
                    <figure key={`${shot.name}-${index}`}>
                      <img src={`data:image/png;base64,${shot.png}`} alt={`${shot.name}, frame ${shot.frame}`} />
                      <figcaption>
                        {shot.name} · f{shot.frame}
                      </figcaption>
                    </figure>
                  ) : null,
                )}
              </div>
            ) : null}
          </section>
        ) : null}

        <section className="agent-play-block">
          <h3>command</h3>
          <textarea
            ref={inputRef}
            className="agent-play-input agent-play-command-input"
            rows={2}
            value={draft}
            spellCheck={false}
            aria-label={t('player.agent.inputLabel')}
            placeholder="press right 12"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              // Enter runs; Shift+Enter is a newline.
              if (event.key !== 'Enter' || event.shiftKey) return;
              event.preventDefault();
              submit(draft);
              setDraft('');
            }}
          />
          <div className="agent-play-actions">
            <button
              type="button"
              className="primary-btn agent-play-run"
              onClick={() => {
                submit(draft);
                setDraft('');
              }}
            >
              {t('player.agent.run')}
            </button>
            {QUICK_COMMANDS.map((command) => (
              <button key={command} type="button" className="secondary-btn" onClick={() => submit(command)}>
                {command}
              </button>
            ))}
          </div>
        </section>

        {history.length > 0 ? (
          <section className="agent-play-block">
            <h3>history</h3>
            <ol className="agent-play-history" aria-live="polite">
              {history.map((entry) => (
                <li key={entry.n} className={entry.ok ? '' : 'is-error'}>
                  <code>&gt; {entry.command}</code>
                  <span>{entry.output}</span>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        <details className="agent-play-guide">
          <summary>{t('player.agent.guide')}</summary>
          <pre>{AGENT_GUIDE}</pre>
          <pre>{AGENT_COMMANDS.join('\n')}</pre>
          <pre>{JSON.stringify(AGENT_CAPABILITIES, null, 1)}</pre>
        </details>
      </div>
    </aside>
  );
}
