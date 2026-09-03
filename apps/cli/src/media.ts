export type GraphicsKind = 'kitty' | 'iterm2' | 'sixel' | 'none';

export function probeGraphics(env: NodeJS.ProcessEnv, tty: boolean): GraphicsKind {
  if (!tty) return 'none';
  if (env.KITTY_WINDOW_ID || env.TERM === 'xterm-kitty') return 'kitty';
  if (env.ITERM_SESSION_ID) return 'iterm2';
  if (env.TERM && /sixel/i.test(env.TERM)) return 'sixel';
  return 'none';
}

export function placeholderFor(url: string): string {
  return `┌ still ┐\n│ o open ${url}\n└───────┘`;
}
