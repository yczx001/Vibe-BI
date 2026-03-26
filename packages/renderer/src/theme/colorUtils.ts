type RgbColor = {
  r: number;
  g: number;
  b: number;
};

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function clampAlpha(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function parseHexColor(color: string): RgbColor | null {
  const normalized = color.trim().replace('#', '');
  if (!/^[0-9a-f]{3}$|^[0-9a-f]{6}$/i.test(normalized)) {
    return null;
  }

  const hex = normalized.length === 3
    ? normalized.split('').map((char) => `${char}${char}`).join('')
    : normalized;

  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  };
}

function parseRgbColor(color: string): RgbColor | null {
  const match = color.trim().match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*[\d.]+\s*)?\)$/i);
  if (!match) {
    return null;
  }

  return {
    r: clampChannel(Number.parseInt(match[1], 10)),
    g: clampChannel(Number.parseInt(match[2], 10)),
    b: clampChannel(Number.parseInt(match[3], 10)),
  };
}

function parseColor(color: string): RgbColor | null {
  return parseHexColor(color) || parseRgbColor(color);
}

export function withAlpha(color: string, alpha: number, fallback = `rgba(15, 23, 42, ${clampAlpha(alpha)})`): string {
  const parsed = parseColor(color);
  if (!parsed) {
    return fallback;
  }

  return `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, ${clampAlpha(alpha)})`;
}

export function mixColors(primary: string, secondary: string, weight = 0.5, fallback = primary): string {
  const from = parseColor(primary);
  const to = parseColor(secondary);
  if (!from || !to) {
    return fallback;
  }

  const normalizedWeight = Math.max(0, Math.min(1, weight));
  const inverse = 1 - normalizedWeight;

  return `rgb(${clampChannel((from.r * normalizedWeight) + (to.r * inverse))}, ${clampChannel((from.g * normalizedWeight) + (to.g * inverse))}, ${clampChannel((from.b * normalizedWeight) + (to.b * inverse))})`;
}
