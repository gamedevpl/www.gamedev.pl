// Shape and floors for player feedback themes.

// Fewer rows than this: no themes at all. A privacy floor.
export const MIN_FEEDBACK_FOR_THEMES = 3;

// Most recent rows considered. Bounds both prompt size and cost per game.
export const MAX_FEEDBACK_ROWS = 200;

export interface FeedbackTheme {
  // A short phrase describing what several players said. Untrusted text.
  theme: string;
  // How many considered notes support it, clamped to what was read.
  count: number;
}

export interface ThemeExtractor {
  // Returns themes for these notes, or [] when there is too little.
  extract(texts: string[]): Promise<FeedbackTheme[]>;
}

// An extractor that returns nothing, wherever Vertex should not be called.

// No themes reads as "nothing was summarized", never as a broken sweep.
export class NoopThemeExtractor implements ThemeExtractor {
  async extract(): Promise<FeedbackTheme[]> {
    return [];
  }
}
