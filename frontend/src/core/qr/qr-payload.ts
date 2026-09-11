import { QRCodeType } from "@/src/core";

export const QR_PAYLOAD_VERSION = "1";

export type QRPayload = {
  version: typeof QR_PAYLOAD_VERSION;
  token: string;
};

export function buildQRPayload(token: string): QRPayload {
  const normalizedToken = token.trim();
  if (!normalizedToken) throw new Error("QR code token is required");
  return { version: QR_PAYLOAD_VERSION, token: normalizedToken };
}

export function buildQRCodeUrl(baseUrl: string, token: string): string {
  const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "");
  if (!normalizedBaseUrl) throw new Error("QR code base URL is required");
  const payload = buildQRPayload(token);
  return `${normalizedBaseUrl}/qr/${encodeURIComponent(payload.token)}`;
}

export function parseQRCodeUrl(
  value: string,
  baseUrl?: string,
): QRPayload | null {
  const input = value.trim();
  if (!input) return null;

  let pathname: string;
  try {
    const url = new URL(input);
    if (baseUrl) {
      const expectedOrigin = new URL(baseUrl.trim()).origin;
      if (url.origin !== expectedOrigin) return null;
    }
    pathname = url.pathname;
  } catch {
    return null;
  }

  const match = pathname.match(/^\/qr\/([^/]+)\/?$/);
  if (!match?.[1]) return null;

  try {
    return buildQRPayload(decodeURIComponent(match[1]));
  } catch {
    return null;
  }
}

export function isSupportedQRCodeType(value: string): value is QRCodeType {
  return Object.values(QRCodeType).includes(value as QRCodeType);
}
