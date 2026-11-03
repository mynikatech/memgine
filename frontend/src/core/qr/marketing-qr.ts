import { toQR } from "toqr";

export type MarketingQrKind = "ORGANIZATION" | "MEMBERSHIP";

/** Public acquisition URLs only. No payment intent or redemption token. */
export function marketingQrUrl(
  base: string,
  organizationId: string,
  kind: MarketingQrKind,
  productId?: string,
): string {
  const root = new URL(base);
  if (root.protocol !== "https:") {
    throw new Error("The customer website must use HTTPS.");
  }
  if (!organizationId.trim()) throw new Error("Organization is required.");

  if (kind === "ORGANIZATION") {
    root.pathname = `/discover/${encodeURIComponent(organizationId)}`;
    root.search = "";
  } else {
    if (!productId?.trim()) throw new Error("Choose a published membership.");
    root.pathname = "/join";
    root.search = `?organizationId=${encodeURIComponent(organizationId)}&productId=${encodeURIComponent(productId)}`;
  }
  root.hash = "";
  return root.toString();
}

function xml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (ch) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[ch] ?? ch,
  );
}

function linesFor(
  value: string,
  maxLength: number,
  maxLines: number,
): string[] {
  const words = value.trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxLength && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
    if (lines.length >= maxLines) break;
  }
  if (current && lines.length < maxLines) lines.push(current);
  return lines.map((line) => line.slice(0, maxLength));
}

function svgTextLines(
  value: string,
  y: number,
  fontSize: number,
  color: string,
  maxChars: number,
  maxLines = 2,
  bold = false,
): string {
  return linesFor(value, maxChars, maxLines)
    .map(
      (line, index) =>
        `<text x="50%" y="${y + index * (fontSize + 6)}" text-anchor="middle" ` +
        `font-family="Arial,sans-serif" font-size="${fontSize}" ` +
        `font-weight="${bold ? "700" : "400"}" fill="${color}">${xml(line)}</text>`,
    )
    .join("");
}

/** Standalone vector poster with a 4-module white QR quiet zone. */
export function marketingQrSvg(
  url: string,
  businessName: string,
  tagline: string,
  headline: string,
  callToAction = "Scan to explore and join",
): string {
  const matrix = toQR(url);
  const modules = Math.sqrt(matrix.length);
  if (!Number.isInteger(modules)) throw new Error("Unexpected QR matrix.");

  const unit = 8;
  const margin = 4;
  const qrSize = (modules + margin * 2) * unit;
  const width = Math.max(600, qrSize + 64);
  const qrX = Math.floor((width - qrSize) / 2);
  const qrY = 180;
  const height = qrY + qrSize + 135;
  const blocks: string[] = [];

  matrix.forEach((dark, index) => {
    if (!dark) return;
    const x = qrX + ((index % modules) + margin) * unit;
    const y = qrY + (Math.floor(index / modules) + margin) * unit;
    blocks.push(`<rect x="${x}" y="${y}" width="${unit}" height="${unit}"/>`);
  });

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<rect width="100%" height="100%" fill="#ffffff"/>` +
    svgTextLines(businessName, 40, 27, "#172033", 35, 2, true) +
    svgTextLines(tagline, 99, 16, "#475569", 58, 2) +
    svgTextLines(headline, 158, 18, "#172033", 48, 1, true) +
    `<rect x="${qrX}" y="${qrY}" width="${qrSize}" height="${qrSize}" fill="#ffffff"/>` +
    `<g fill="#000000">${blocks.join("")}</g>` +
    svgTextLines(callToAction, qrY + qrSize + 39, 20, "#172033", 45, 2, true) +
    svgTextLines(
      "Powered by Memgine",
      qrY + qrSize + 106,
      14,
      "#475569",
      50,
      1,
    ) +
    `</svg>`
  );
}
