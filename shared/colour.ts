/** Brand colour helpers: keep text readable whatever colour a client picks. */

export function isHexColour(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colours (1–21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** White or near-black, whichever reads better on the given background. */
export function inkFor(background: string): string {
  return contrastRatio(background, '#ffffff') >= contrastRatio(background, '#16181b') ? '#ffffff' : '#16181b';
}

/** Mix a colour toward black (amount 0–1). */
export function darken(hex: string, amount: number): string {
  return rgbToHex(hexToRgb(hex).map((v) => v * (1 - amount)) as [number, number, number]);
}

/** Mix a colour toward white (amount 0–1). */
export function lighten(hex: string, amount: number): string {
  return rgbToHex(hexToRgb(hex).map((v) => v + (255 - v) * amount) as [number, number, number]);
}

/** The brand colour darkened just enough to be readable as text on white (4.5:1). */
export function readableOnWhite(hex: string): string {
  let colour = hex;
  for (let step = 0; step < 20 && contrastRatio(colour, '#ffffff') < 4.5; step++) {
    colour = darken(colour, 0.08);
  }
  return colour;
}

/** CSS custom properties for a brand colour. */
export function brandVariables(hex: string): Record<string, string> {
  const brand = isHexColour(hex) ? hex : '#1f5f8b';
  return {
    '--brand': brand,
    '--brand-ink': inkFor(brand),
    '--brand-text': readableOnWhite(brand),
    '--brand-strong': darken(brand, 0.18),
    '--brand-soft': lighten(brand, 0.9),
    '--brand-softer': lighten(brand, 0.95),
  };
}
