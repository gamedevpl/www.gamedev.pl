// Lockstep twin: games-repo theme-css.ts
export interface Theme {
  accent?: string;
  canvasBackground?: string;
  canvasBorderColor?: string;
  pixelArt?: boolean;
}

export const DEFAULT_CANVAS_BACKGROUND = '#090d16';
export const DEFAULT_CANVAS_BORDER = '#1e2942';

const CANVAS_BORDER_WIDTH = '2px';
const CANVAS_BORDER_RADIUS = '14px';

export function generateStyleCss(theme: Theme | undefined): string {
  const t = theme ?? {};
  let css = '';

  if (t.accent) {
    css += `.wrap h1 {\n  color: ${t.accent};\n}\n\n`;
  }

  const background = t.canvasBackground || DEFAULT_CANVAS_BACKGROUND;
  const borderColor = t.canvasBorderColor || DEFAULT_CANVAS_BORDER;
  css += `#game {\n  background: ${background};\n  border: ${CANVAS_BORDER_WIDTH} solid ${borderColor};\n  border-radius: ${CANVAS_BORDER_RADIUS};\n}\n`;

  if (t.pixelArt) {
    css += `\n#game {\n  image-rendering: pixelated;\n}\n`;
  }

  return css;
}
