import type { GenerationResult } from 'genaicode';
import { rateForModel, type TokenRate } from './token-prices.js';

export const SEED_TOTAL_TIMEOUT_MS = 120_000;
export const SEED_MAX_USD = 0.15;
export const SEED_TOTAL_OUTPUT_TOKENS = 8192;
export const SEED_CONTEXT_TIMEOUT_MS = 20_000;

type Log = { info: (context: object, message: string) => void };

export class SeedBudget {
  readonly signal: AbortSignal;
  private readonly rate: TokenRate;
  private inputBound = 0;
  private outputUsed = 0;
  private readonly startedAt = Date.now();
  private readonly deadline: number;

  constructor(
    model: string,
    private readonly log?: Log,
    timeoutMs = SEED_TOTAL_TIMEOUT_MS,
  ) {
    const rate = rateForModel(model);
    if (!rate) throw new Error(`seed budget: unpriced model ${model}`);
    this.rate = rate;
    const duration = Math.min(timeoutMs, SEED_TOTAL_TIMEOUT_MS);
    this.deadline = this.startedAt + duration;
    this.signal = AbortSignal.timeout(duration);
  }

  assertAvailable(): void {
    this.signal.throwIfAborted();
    if (Date.now() >= this.deadline) throw new Error('seed deadline exceeded');
  }

  async wait<T>(work: Promise<T>, timeoutMs?: number): Promise<T> {
    const signal = timeoutMs ? AbortSignal.any([this.signal, AbortSignal.timeout(timeoutMs)]) : this.signal;
    signal.throwIfAborted();
    let rejectAbort: () => void;
    const aborted = new Promise<never>((_, reject) => {
      rejectAbort = () => reject(signal.reason);
      signal.addEventListener('abort', rejectAbort, { once: true });
    });
    try {
      const result = await Promise.race([work, aborted]);
      signal.throwIfAborted();
      this.assertAvailable();
      return result;
    } finally {
      signal.removeEventListener('abort', rejectAbort!);
    }
  }

  async call(
    stage: string,
    prompt: string,
    maxOutputTokens: number,
    timeoutMs: number,
    work: (signal: AbortSignal, tokens: number) => Promise<GenerationResult>,
  ): Promise<GenerationResult> {
    this.assertAvailable();
    // Byte fallback bounds text tokens; reserve framing and provider instructions too.
    const input = Buffer.byteLength(prompt, 'utf8') + 1024;
    const inputBound = this.inputBound + input;
    const dollarsLeft =
      SEED_MAX_USD - (inputBound * this.rate.inputPerMTok + this.outputUsed * this.rate.outputPerMTok) / 1e6;
    const tokens = Math.floor(
      Math.min(
        maxOutputTokens,
        SEED_TOTAL_OUTPUT_TOKENS - this.outputUsed,
        (dollarsLeft * 1e6) / this.rate.outputPerMTok,
      ),
    );
    if (tokens < 256) throw new Error('seed budget exhausted before ' + stage);
    this.inputBound = inputBound;
    this.outputUsed += tokens;
    const startedAt = Date.now();
    const signal = AbortSignal.any([this.signal, AbortSignal.timeout(timeoutMs)]);
    this.log?.info(
      { stage, inputBytes: input - 1024, maxOutputTokens: tokens, elapsedMs: startedAt - this.startedAt },
      'seed stage started',
    );
    const result = await this.wait(work(signal, tokens), timeoutMs);
    // Unknown usage cannot fund another call after a paid request.
    const output = result.usage?.outputTokens ?? tokens;
    this.outputUsed -= tokens - output;
    this.log?.info(
      { stage, ms: Date.now() - startedAt, usage: result.usage, outputUsed: this.outputUsed },
      'seed stage complete',
    );
    if (output > tokens || (result.usage?.inputTokens ?? 0) > input)
      throw new Error('seed provider exceeded reserved budget');
    this.assertAvailable();
    return result;
  }
}
