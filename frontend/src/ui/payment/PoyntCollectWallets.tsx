import { useEffect, useRef, useState } from "react";

import { Platform, View } from "react-native";

import type {
  PoyntCollectBootstrap,
  PoyntCollectPaymentMethod,
} from "@/src/data/api/customer-data-api";

import { Text, Button } from "@/src/ui";

import { loadPoyntCollectSdk } from "./PoyntCollectCardForm";

type WalletMethod = Exclude<PoyntCollectPaymentMethod, "card">;

type WalletEvent = {
  type?: unknown;

  data?: unknown;

  name?: unknown;

  message?: unknown;

  nonce?: unknown;

  source?: unknown;

  complete?: (options?: {
    error: { code: "unknown"; message: string };
  }) => void;
};

type WalletCollect = {
  supportWalletPayments: () => Promise<{
    applePay?: boolean;

    googlePay?: boolean;
  }>;

  mount: (
    id: string,

    document: Document,

    options: {
      paymentMethods: WalletMethod[];

      buttonOptions?: {
        color: string;

        type: string;

        width: string;

        height: string;

        onClick?: (event: { source: string }) => void;
      };
    },
  ) => void;

  unmount: (id: string, document: Document) => void;

  on: (name: string, listener: (event: WalletEvent) => void) => void;

  startGooglePaySession: () => void;

  startApplePaySession: () => void;
};

type WalletConstructor = new (
  businessId: string,

  applicationId: string,

  request: {
    total: { label: string; amount: string };

    country: string;

    currency: string;

    merchantName: string;
    disableWallets?: { paze?: boolean };
  },
) => WalletCollect;

function isCustomerCancellation(event: WalletEvent): boolean {
  // The SDK has emitted both flat errors and nested {data:{error}} events.

  // Never treat customer dismissal as a payment decline.

  const payload =
    event.data && typeof event.data === "object"
      ? (event.data as Record<string, unknown>)
      : {};

  const nested =
    payload.error && typeof payload.error === "object"
      ? (payload.error as Record<string, unknown>)
      : {};

  const name = event.name ?? payload.name ?? nested.name;

  const message = event.message ?? payload.message ?? nested.message;

  return (
    name === "AbortError" ||
    (typeof message === "string" &&
      /user closed the payment request ui|user cancel(?:led|ed)?|payment request (?:was )?cancel(?:led|ed)/i.test(
        message,
      ))
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

    try {
      value = JSON.parse(first);
    } catch {
      return false;
    }
  }

  if (!value || typeof value !== "object") return false;

  const detail = value as Record<string, unknown>;

  return (
    detail.name === "AbortError" &&
    detail.type === "GOOGLE_PAY" &&
    detail.message === "User closed the Payment Request UI."
  );
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

export function PoyntCollectWallets({
  configuration,

  merchantName,

  membershipName,

  amountText,

  onAuthorize,
}: {
  configuration: PoyntCollectBootstrap;

  merchantName: string;

  membershipName: string;

  amountText: string;

  onAuthorize: (nonce: string, method: WalletMethod) => Promise<boolean>;
}) {
  const hostId = useRef(`memgine-poynt-wallet-${++walletIdCounter}`).current;

  const [available, setAvailable] = useState(false);

  const [selectedWallet, setSelectedWallet] = useState<WalletMethod | null>(
    null,
  );

  const [launching, setLaunching] = useState(false);

  const [walletError, setWalletError] = useState<string>();

  const collectRef = useRef<WalletCollect | null>(null);

  const authorizationInFlight = useRef(false);

  const walletSessionStarting = useRef(false);

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

        const Constructor = (
          window as Window & { TokenizeJs?: WalletConstructor }
        ).TokenizeJs;

        if (!Constructor) return;

        const walletConfig = configuration.wallet;

        collect = new Constructor(
          configuration.businessId,

          configuration.applicationId,

          {
            total: {
              label: "Membership payment",

              amount: walletConfig.amount,
            },

            country: walletConfig.country,

            currency: walletConfig.currency,

            merchantName: walletConfig.merchantName,
            // Skip Paze discovery in this Google Pay / Apple Pay component.
            disableWallets: { paze: true },
          },
        );

        const walletInstance = collect;

        collectRef.current = walletInstance;

        walletInstance.on("error", (event) => {
          if (!active) return;

          if (isCustomerCancellation(event)) {
            // Wallet dismissed without an authorized nonce.

            // The customer can choose Google Pay or Apple Pay again.

            if (!authorizationInFlight.current) {
              walletSessionStarting.current = false;

              setWalletError(undefined);

              setSelectedWallet(null);
            }

            return;
          }

          if (!authorizationInFlight.current) {
            walletSessionStarting.current = false;
          }

          setWalletError(
            "The wallet could not complete this operation. " +
              "Please check your payment status before trying again.",
          );
        });

        walletInstance.on("payment_authorized", (event) => {
          if (!active) return;

          const method = event.source;

          if (
            (method !== "google_pay" && method !== "apple_pay") ||
            typeof event.nonce !== "string" ||
            !event.nonce
          ) {
            event.complete?.({
              error: {
                code: "unknown",

                message: "Wallet authorization could not be verified.",
              },
            });

            return;
          }

          // Protect against duplicate wallet authorization events.

          if (authorizationInFlight.current) {
            event.complete?.({
              error: {
                code: "unknown",

                message:
                  "This payment is already being confirmed. " +
                  "Please check its status.",
              },
            });

            return;
          }

          authorizationInFlight.current = true;

          // Preserve the original single-submission behavior.

          // Wallet authorization has already occurred at this point.

          void callback

            .current(event.nonce, method)

            .then((success) => {
              if (success) {
                event.complete?.();
              } else {
                event.complete?.({
                  error: {
                    code: "unknown",

                    message:
                      "Payment status could not be confirmed. " +
                      "Please check your payment status.",
                  },
                });
              }
            })

            .catch(() => {
              event.complete?.({
                error: {
                  code: "unknown",

                  message:
                    "Payment status is uncertain. " +
                    "Please check before retrying.",
                },
              });
            });
        });

        const supported = await walletInstance.supportWalletPayments();

        if (!active) return;

        const methods: WalletMethod[] = [];

        if (supported.googlePay) methods.push("google_pay");

        if (supported.applePay) methods.push("apple_pay");

        if (!methods.length) return;

        walletInstance.mount(hostId, document, {
          paymentMethods: methods,

          buttonOptions: {
            color: "black",

            type: "pay",

            width: "100%",

            height: "48px",

            // This is the REAL Poynt wallet button click.

            // Do not open Google Pay / Apple Pay yet.

            onClick: (event) => {
              if (
                !active ||
                authorizationInFlight.current ||
                walletSessionStarting.current
              ) {
                return;
              }

              if (
                event.source !== "google_pay" &&
                event.source !== "apple_pay"
              ) {
                return;
              }

              setWalletError(undefined);

              setSelectedWallet(event.source);
            },
          },
        });

        setAvailable(true);
      } catch {
        if (active) {
          setWalletError("Wallet payments are unavailable on this device.");
        }
      }
    };

    void setup();

    return () => {
      active = false;

      try {
        collect?.unmount(hostId, document);
      } catch {
        // The SDK may not have mounted.
      }

      collectRef.current = null;

      restoreCancelLog();
    };
  }, [
    configuration.sdkUrl,

    configuration.businessId,

    configuration.applicationId,

    configuration.wallet?.country,

    configuration.wallet?.currency,

    configuration.wallet?.merchantName,

    configuration.wallet?.amount,

    hostId,
  ]);

  const continueToWallet = () => {
    if (
      !selectedWallet ||
      !collectRef.current ||
      walletSessionStarting.current ||
      authorizationInFlight.current
    ) {
      return;
    }

    walletSessionStarting.current = true;

    setLaunching(true);

    setWalletError(undefined);

    const method = selectedWallet;

    // Close the Memgine review before opening the wallet sheet.

    setSelectedWallet(null);

    try {
      if (method === "google_pay") {
        collectRef.current.startGooglePaySession();
      } else {
        collectRef.current.startApplePaySession();
      }
    } catch {
      walletSessionStarting.current = false;

      setWalletError(
        "Unable to open the wallet. No new payment " +
          "has been submitted by this action.",
      );
    } finally {
      setLaunching(false);
    }
  };

  const cancelReview = () => {
    if (launching || authorizationInFlight.current) return;

    setSelectedWallet(null);
  };

  const selectedWalletName =
    selectedWallet === "google_pay" ? "Google Pay" : "Apple Pay";

  if (Platform.OS !== "web" || !configuration.wallet) {
    return null;
  }

  return (
    <View style={{ width: "100%", gap: 12 }}>
      <WalletHost
        id={hostId}
        aria-label="Secure wallet checkout"
        style={{
          width: "100%",

          minHeight: available ? 52 : 0,

          display: selectedWallet ? "none" : "block",
        }}
      />

      {selectedWallet ? (
        <View
          style={{
            width: "100%",

            gap: 12,

            padding: 16,

            borderWidth: 1,

            borderColor: "#E5E7EB",

            borderRadius: 12,

            backgroundColor: "#FFFFFF",
          }}
        >
          <Text variant="h2">Confirm Your {selectedWalletName} Purchase</Text>

          <Text variant="body">Merchant: {merchantName}</Text>

          <Text variant="body">Membership: {membershipName}</Text>

          <Text variant="bodyStrong">Total payable: {amountText}</Text>

          <Text variant="bodySmall" color="textMuted">
            Continue to review your payment method and authorize this purchase
            securely with
            {` ${selectedWalletName}`}.
          </Text>

          <Button
            label={`Continue to ${selectedWalletName}`}
            fullWidth
            disabled={launching}
            onPress={continueToWallet}
          />

          <Button
            label="Cancel"
            variant="secondary"
            fullWidth
            disabled={launching}
            onPress={cancelReview}
          />
        </View>
      ) : null}

      {walletError ? (
        <Text variant="bodySmall" color="danger">
          {walletError}
        </Text>
      ) : null}

      {available && !selectedWallet ? (
        <View
          style={{
            alignItems: "center",

            marginVertical: 5,
          }}
        >
          <Text variant="bodySmall" color="textMuted">
            OR PAY BY CARD
          </Text>
        </View>
      ) : null}
    </View>
  );
}
