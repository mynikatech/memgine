function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function parseHex(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const num = parseInt(full, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function toHex(rgb: { r: number; g: number; b: number }): string {
  const { r, g, b } = rgb;
  return `#${((1 << 24) + (clampChannel(r) << 16) + (clampChannel(g) << 8) + clampChannel(b))
    .toString(16)
    .slice(1)}`;
}

/** Mix a color toward white. amount 0..1 */
export function tint(hex: string, amount = 0.5): string {
  const { r, g, b } = parseHex(hex);
  return toHex({ r: r + (255 - r) * amount, g: g + (255 - g) * amount, b: b + (255 - b) * amount });
}

/** Mix a color toward black. amount 0..1 */
export function shade(hex: string, amount = 0.2): string {
  const { r, g, b } = parseHex(hex);
  return toHex({ r: r * (1 - amount), g: g * (1 - amount), b: b * (1 - amount) });
}

export function withAlpha(hex: string, alpha: number): string {
  const { r, g, b } = parseHex(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
