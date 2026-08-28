export type HexColorMatch = {
  color: string;
  from: number;
  to: number;
};

const HEX_COLOR = /#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})(?![0-9a-f])/gi;

export function findHexColors(source: string): HexColorMatch[] {
  return [...source.matchAll(HEX_COLOR)].map((match) => ({
    color: match[0],
    from: match.index ?? 0,
    to: (match.index ?? 0) + match[0].length,
  }));
}

export function expandHexColor(color: string): string {
  if (color.length === 4) {
    return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`.toLowerCase();
  }
  if (color.length === 5) {
    return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}${color[4]}${color[4]}`.toLowerCase();
  }
  return color.toLowerCase();
}

export function colorForPicker(color: string): string {
  return expandHexColor(color).slice(0, 7);
}

export function colorFromPicker(original: string, picked: string): string {
  const expanded = expandHexColor(original);
  return expanded.length === 9 ? `${picked}${expanded.slice(7)}` : picked;
}

export function replaceHexColor(source: string, from: number, to: number, color: string): string {
  return `${source.slice(0, from)}${color}${source.slice(to)}`;
}
