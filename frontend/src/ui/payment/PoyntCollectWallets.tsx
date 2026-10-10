import { useEffect, useRef, useState } from "react";
import { Platform, View } from "react-native";
import type { PoyntCollectBootstrap, PoyntCollectPaymentMethod } from "@/src/data/api/customer-data-api";
import { Text } from "@/src/ui";
import { loadPoyntCollectSdk } from "./PoyntCollectCardForm";

type WalletMethod = Exclude<PoyntCollectPaymentMethod, "card">;
type WalletEvent = {
  type?: unknown;
  data?: unknown;
  name?: unknown;
  message?: unknown;
  nonce?: unknown;
  source?: unknown;
  complete?: (options?: { error: { code: "unknown"; message: string } }) => void;
};
type WalletCollect = {
  supportWalletPayments: () => Promise<{ applePay?: boolean; googlePay?: boolean }>;
  mount: (id: string, document: Document, options: {
    paymentMethods: WalletMethod[];
    buttonOptions?: { color: string; type: string; width: string; height: string };
  }) => void;
  unmount: (id: string, document: Document) => void;
  on: (name: string, listener: (event: WalletEvent) => void) => void;
};
type WalletConstructor = new (businessId: string, applicationId: string, request: {
  total: { label: string; amount: string };
  country: string;
  currency: string;
  merchantName: string;
}) => WalletCollect;
function isCustomerCancellation(event: WalletEvent): boolean {
  // The SDK has emitted both flat errors and nested {data:{error}} events.
  // Never treat customer dismissal as a payment decline.
  const payload = event.data && typeof event.data === "object"
    ? event.data as Record<string, unknown> : {};
  const nested = payload.error && typeof payload.error === "object"
    ? payload.error as Record<string, unknown> : {};
  const name = event.name ?? payload.name ?? nested.name;
  const message = event.message ?? payload.message ?? nested.message;
  return name === "AbortError" || (
    typeof message === "string" &&
    /user closed the payment request ui|user cancel(?:led|ed)?|payment request (?:was )?cancel(?:led|ed)/i.test(message)
  );
}

/**
 * Poynt's production SDK prints a Google Pay AbortError with console.error when
 * the customer closes the wallet. Expo's development LogBox interprets that
 * expected SDK log as an application error. Only in local development, while a
 * wallet host is mounted, ignore that ONE exact SDK cancellation log. Do not
 * suppress unrelated errors or change payment state.
 *
 * The filter wraps console.error because the log originates inside sdk.js,
 * before the on("error") handler can run. It is reference-counted and restored
 * when the final wallet component unmounts.
 */
let cancelLogUsers = 0;
let originalConsoleError: typeof console.error | undefined;
let cancelLogWrapper: typeof console.error | undefined;

function isExpectedPoyntCancelLog(args: unknown[]): boolean {
  const first = args[0];
  let value: unknown = first;
  if (typeof first === "string") {
    // SDK currently logs JSON.stringify(error), undefined.
    if (!first.includes("User closed the Payment Request UI.")) return false;
    try { value = JSON.parse(first); } catch { return false; }
  }
  if (!value || typeof value !== "object") return false;
  const detail = value as Record<string, unknown>;
  return detail.name === "AbortError" &&
    detail.type === "GOOGLE_PAY" &&
    detail.message === "User closed the Payment Request UI.";
}

function installDevCancellationLogFilter(): () => void {
  if (process.env.NODE_ENV !== "development") return () => {};
  cancelLogUsers += 1;
  if (cancelLogUsers === 1) {
    originalConsoleError = console.error;
    const previous = originalConsoleError;
    cancelLogWrapper = (...args: unknown[]) => {
      if (isExpectedPoyntCancelLog(args)) return;
      previous(...args);
    };
    console.error = cancelLogWrapper;
  }
  return () => {
    cancelLogUsers = Math.max(0, cancelLogUsers - 1);
    if (cancelLogUsers === 0) {
      if (console.error === cancelLogWrapper && originalConsoleError) {
        console.error = originalConsoleError;
      }
      cancelLogWrapper = undefined;
      originalConsoleError = undefined;
    }
  };
}

let walletIdCounter = 0;
const WalletHost = "div" as any;

/** Never displays unverified wallet buttons. Poynt provides the genuine branded controls. */
export function PoyntCollectWallets({ configuration, onAuthorize }: {
  configuration: PoyntCollectBootstrap;
  onAuthorize: (nonce: string, method: WalletMethod) => Promise<boolean>;
}) {
  const hostId = useRef(`memgine-poynt-wallet-${++walletIdCounter}`).current;
  const [available, setAvailable] = useState(false);
  const callback = useRef(onAuthorize);
  callback.current = onAuthorize;
  useEffect(() => {
    if (Platform.OS !== "web" || !configuration.wallet) return;
    const restoreCancelLog = installDevCancellationLogFilter();
    let active = true;
    let collect: WalletCollect | null = null;
    const setup = async () => {
      try {
        await loadPoyntCollectSdk(configuration.sdkUrl);
        if (!active || !configuration.wallet) return;
        const Constructor = (window as Window & { TokenizeJs?: WalletConstructor }).TokenizeJs;
        if (!Constructor) return;
        const config = configuration.wallet;
        // Backend supplies the authoritative intent amount and merchant context.
        collect = new Constructor(configuration.businessId, configuration.applicationId, {
          total: { label: "Membership payment", amount: config.amount },
          country: config.country,
          currency: config.currency,
          merchantName: config.merchantName,
        });
        const walletInstance = collect;
        // A customer closing the Google Pay / Apple Pay sheet is normal.
        // Do not call onAuthorize, fail the intent, or show a checkout error.
        walletInstance.on("error", (event) => {
          if (!active || isCustomerCancellation(event)) return;
          // Other SDK errors are handled by Poynt's own UI; the card fallback stays usable.
          // Do not log the raw event: SDK payloads might contain payment data.
        });
        walletInstance.on("payment_authorized", (event) => {
          if (!active) return;
          const method = event.source;
          if ((method !== "apple_pay" && method !== "google_pay") ||
              typeof event.nonce !== "string" || !event.nonce) {
            event.complete?.({ error: { code: "unknown", message: "Wallet payment could not be verified." } });
            return;
          }
          // Don't close the wallet sheet until confirmed by backend.
          void callback.current(event.nonce, method).then((success) => {
            // Complete even if the parent navigated after successful confirmation.
            if (success) event.complete?.();
            else event.complete?.({ error: { code: "unknown", message: "Payment could not be confirmed. Check payment status before retrying." } });
          }).catch(() => {
            event.complete?.({ error: { code: "unknown", message: "Payment status is uncertain. Check status before retrying." } });
          });
        });
        const supported = await walletInstance.supportWalletPayments();
        if (!active) return;
        const methods: WalletMethod[] = [];
        if (supported.applePay) methods.push("apple_pay");
        if (supported.googlePay) methods.push("google_pay");
        if (!methods.length) return;
        walletInstance.mount(hostId, document, {
          paymentMethods: methods,
          buttonOptions: { color: "black", type: "pay", width: "100%", height: "48px" },
        });
        setAvailable(true);
      } catch {
        // On incompatible browsers/merchant setups, leave the working card form visible.
      }
    };
    void setup();
    return () => {
      active = false;
      try { collect?.unmount(hostId, document); } catch { /* SDK may not have mounted */ }
      restoreCancelLog();
    };
  }, [configuration.sdkUrl, configuration.businessId, configuration.applicationId,
      configuration.wallet?.country, configuration.wallet?.currency,
      configuration.wallet?.merchantName, configuration.wallet?.amount, hostId]);

  if (Platform.OS !== "web" || !configuration.wallet) return null;
  return (
    <View style={{ width: "100%", gap: 12 }}>
      <WalletHost id={hostId} aria-label="Express checkout" style={{ width: "100%", minHeight: available ? 52 : 0 }} />
      {available ? (
        <View style={{ alignItems: "center", marginVertical: 5 }}>
          <Text variant="bodySmall" color="textMuted">OR PAY BY CARD</Text>
        </View>
      ) : null}
    </View>
  );
}
