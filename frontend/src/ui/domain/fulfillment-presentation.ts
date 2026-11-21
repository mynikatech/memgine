export const fulfillmentContentWidth = 1120;
export const redemptionContentWidth = 1200;

export function isWideFulfillmentLayout(width: number) {
  return width >= 900;
}

export function activeCounterQrForSelection<T extends { expiresAt: string; items: { itemType: "BENEFIT" | "OFFER"; itemId: string }[] }>(
  qrs: readonly T[], benefitIds: readonly string[], offerIds: readonly string[], now = Date.now(),
) {
  return qrs.find((qr) => Date.parse(qr.expiresAt) > now && qr.items.some(({ itemType, itemId }) =>
    (itemType === "BENEFIT" ? benefitIds : offerIds).includes(itemId)));
}

export function fulfillmentPageGutter(width: number) {
  return width < 600 ? 16 : 24;
}

export function entitlementUnavailableLabel(status: string, reason: string | null | undefined, hasReservation: boolean) {
  if (status === "AVAILABLE" || (status === "LIMIT_REACHED" && hasReservation)) return undefined;
  return reason || "Unavailable";
}

export function reservationLabel(label: string, reference: string) {
  return `Reserved for ${label} ${reference}`;
}

export function receiptLineSubtotals(snapshot?: string) {
  const results = new Map<string, number | null>();
  if (!snapshot) return results;
  try {
    const { lines } = JSON.parse(snapshot);
    if (!Array.isArray(lines)) return results;
    for (const line of lines) {
      if (!line || typeof line.description !== "string" || typeof line.currency !== "string" ||
          !Number.isSafeInteger(line.quantity) || !Number.isSafeInteger(line.unitPriceMinor) ||
          !Number.isSafeInteger(line.subtotalMinor)) continue;
      const key = receiptLineKey(line.description, line.quantity, line.unitPriceMinor, line.currency);
      results.set(key, !results.has(key) || results.get(key) === line.subtotalMinor ? line.subtotalMinor : null);
    }
  } catch { /* Legacy snapshots may not provide line pricing. */ }
  return results;
}

export function receiptLineKey(name: string, quantity: number, unitPrice?: number | null, currency?: string | null) {
  return JSON.stringify([name, quantity, unitPrice, currency]);
}
