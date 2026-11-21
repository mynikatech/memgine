export function pickupQrReference(input: string) {
  const value = input.trim();
  return /^MEMGINE_PICKUP:[A-Za-z0-9_-]{43}$/.test(value) ? value : undefined;
}

export function pickupOrderReference(input: string) {
  const value = input.trim().replace(/^#/, "");
  return /^[A-Za-z0-9_-]{1,64}$/.test(value) ? value : undefined;
}

export function pickupLookupMessage(code: string) {
  switch (code) {
    case "EXPIRED": return "This pickup QR has expired. Ask the customer to open a new QR in their order.";
    case "REVOKED": return "This pickup QR was replaced or revoked. Ask for the latest pickup QR.";
    case "USED": return "This pickup QR has already been used.";
    case "WRONG_STORE": return "This pickup QR belongs to another Store.";
    case "ORDER_UNAVAILABLE": return "This order is no longer eligible for pickup verification.";
    case "NOT_FOUND": return "No order with that reference is available at this Store.";
    case "INVALID": return "This pickup QR is invalid. Use the QR from the customer's order.";
    case "FORBIDDEN": case "UNAUTHORIZED": case "HTTP_401": case "HTTP_403":
      return "Pickup lookup is unavailable for your current Counter access. Return to Counter to check your Store.";
    default: return "Could not complete pickup lookup. Try again.";
  }
}

export async function requestPickupCameraAccess(
  web: boolean, supportsWebCamera: boolean,
  permission: { granted: boolean; canAskAgain: boolean } | null,
  request: () => Promise<{ granted: boolean }>,
): Promise<"granted" | "denied" | "unavailable"> {
  if (web && !supportsWebCamera) return "unavailable";
  if (permission?.granted) return "granted";
  if (permission?.canAskAgain === false) return "denied";
  try {
    return (await request()).granted ? "granted" : "denied";
  } catch {
    return "unavailable";
  }
}

export function createPickupAttemptGate() {
  let busy = false;
  let cameraArmed = false;
  return {
    armCamera() { cameraArmed = true; },
    disarmCamera() { cameraArmed = false; },
    begin(source: "camera" | "manual") {
      if (busy || (source === "camera" && !cameraArmed)) return false;
      busy = true;
      cameraArmed = false;
      return true;
    },
    finish() { busy = false; },
  };
}
