import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, ScrollView, View } from "react-native";

import { Button, Text } from "@/src/ui";
import { CollectCheckoutLayout } from "@/src/ui/payment/CollectCheckoutLayout";
import { PoyntCollectCardForm } from "@/src/ui/payment/PoyntCollectCardForm";
import { PoyntCollectWallets } from "@/src/ui/payment/PoyntCollectWallets";

import {
  poyntCollectBrowserApi,
  type PoyntCollectBootstrap,
  type PoyntCollectBrowserCheckout,
  type PoyntCollectPaymentMethod,
} from "@/src/data/api/customer-data-api";

import type { PaymentConfirmation } from "@/src/data/api/counter-api";

const money = (minor: number, currency: string) =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
  }).format(minor / 100);

const CHECK_TIMEOUT_MS = 20_000;

function returnToMemgine() {
  if (typeof window !== "undefined") {
    window.location.assign("memgine://payment-return");
  }
}

type Phase = "ready" | "submitting" | "checking" | "uncertain";

export default function PoyntCollectCheckoutScreen() {
  const { session } = useLocalSearchParams<{ session?: string }>();

  const [checkout, setCheckout] = useState<PoyntCollectBrowserCheckout | null>(
    null,
  );

  const [bootstrap, setBootstrap] = useState<PoyntCollectBootstrap | null>(
    null,
  );

  const [confirmation, setConfirmation] = useState<PaymentConfirmation | null>(
    null,
  );

  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<Phase>("ready");

  // Never send two charge requests from this browser session.
  const submitted = useRef(false);
  const checking = useRef(false);

  const checkStatus = useCallback(async () => {
    if (checking.current) return;

    checking.current = true;
    setPhase("checking");

    try {
      setError(undefined);

      // Read-only status check. A timeout does not mean decline.
      const result = await Promise.race([
        poyntCollectBrowserApi.status(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("Status check timeout")),
            CHECK_TIMEOUT_MS,
          ),
        ),
      ]);

      setConfirmation(result);

      if (
        ["SUCCEEDED", "FAILED", "CANCELED", "CANCELLED"].includes(
          result.payment.status,
        )
      ) {
        setPhase("ready");
      } else {
        setPhase("uncertain");
      }
    } catch {
      setPhase("uncertain");
      setError(
        "We couldn't confirm your payment status. " +
          "You may already have been charged. " +
          "Please check the status again instead of paying again.",
      );
    } finally {
      checking.current = false;
    }
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web" || !session) {
      setError("This secure checkout must be opened in a browser.");
      setLoading(false);
      return;
    }

    let active = true;

    void (async () => {
      try {
        const redeemed = await poyntCollectBrowserApi.redeem(session);

        window.history.replaceState(
          {},
          document.title,
          "/poynt-collect/checkout",
        );

        const config = await poyntCollectBrowserApi.bootstrap();

        if (!active) return;

        setCheckout(redeemed);
        setBootstrap(config);

        if (redeemed.payment.status !== "PENDING") {
          setPhase("uncertain");
          void checkStatus();
        }
      } catch (reason) {
        if (active) {
          setError(
            reason instanceof Error
              ? reason.message
              : "Secure checkout is unavailable.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [session, checkStatus]);

  const confirm = useCallback(
    async (
      nonce: string,
      method: PoyntCollectPaymentMethod = "card",
    ): Promise<boolean> => {
      if (!checkout || submitted.current) return false;

      submitted.current = true;
      setPhase("submitting");
      setError(undefined);

      try {
        const result = await poyntCollectBrowserApi.confirm(
          nonce,
          checkout.csrfToken,
          method,
        );

        setConfirmation(result);

        if (result.payment.status === "SUCCEEDED" && result.subscription) {
          setPhase("ready");
          return true;
        }

        if (
          ["FAILED", "CANCELED", "CANCELLED"].includes(result.payment.status)
        ) {
          setPhase("ready");
          return false;
        }

        setPhase("uncertain");
        return false;
      } catch {
        // A lost response may mean the provider received the charge.
        // Never automatically send the nonce again.
        setPhase("uncertain");
        void checkStatus();
        return false;
      }
    },
    [checkout, checkStatus],
  );

  const status = confirmation?.payment.status ?? checkout?.payment.status;

  const success = status === "SUCCEEDED" && !!confirmation?.subscription;

  const activationPending =
    status === "SUCCEEDED" && !confirmation?.subscription;

  const failed = ["FAILED", "CANCELED", "CANCELLED"].includes(status ?? "");

  const processing = phase === "submitting" || phase === "checking";

  const unresolved =
    phase === "uncertain" || status === "PROCESSING" || activationPending;

  const canPay = !!(
    checkout &&
    bootstrap &&
    checkout.payment.status === "PENDING" &&
    !submitted.current &&
    !confirmation &&
    !processing &&
    !unresolved
  );

  const amountMinor = checkout ? Math.round(checkout.payment.amount * 100) : 0;

  const amountText = checkout
    ? money(amountMinor, checkout.payment.currencyCode)
    : "—";

  const merchantName = bootstrap?.wallet?.merchantName ?? "Memgine";

  return (
    <ScrollView
      style={{
        flex: 1,
        width: "100%",
        backgroundColor: "#F7F8FA",
      }}
      contentContainerStyle={{
        flexGrow: 1,
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 26,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <CollectCheckoutLayout
        payment={
          <View style={{ gap: 16, minWidth: 0 }}>
            {loading ? (
              <Text variant="body">Preparing secure checkout…</Text>
            ) : null}

            {error ? (
              <Text variant="bodySmall" color="danger">
                {error}
              </Text>
            ) : null}

            {/* SUCCESS — SAME FOR ALL PAYMENT METHODS */}
            {success ? (
              <View style={{ gap: 12 }}>
                <Text variant="h2">Payment Successful!</Text>

                <Text variant="bodyStrong">Thank you for your purchase!</Text>

                <Text variant="body">
                  Your membership is now active. You can start enjoying your
                  membership benefits right away.
                </Text>

                <Text variant="bodySmall">Amount paid: {amountText}</Text>

                <Button
                  label="View My Membership"
                  fullWidth
                  onPress={returnToMemgine}
                />
              </View>
            ) : activationPending ? (
              /* PAYMENT SUCCEEDED, MEMBERSHIP STILL PENDING */
              <View style={{ gap: 12 }}>
                <Text variant="h2">Payment Received</Text>

                <Text variant="body">
                  Thank you for your purchase. Your payment was received, but
                  your membership activation is still being confirmed. Please do
                  not pay again.
                </Text>

                <Button
                  label="Check Membership Status"
                  fullWidth
                  disabled={processing}
                  onPress={() => void checkStatus()}
                />

                <Button
                  label="Return to Memgine"
                  variant="secondary"
                  onPress={returnToMemgine}
                />
              </View>
            ) : failed ? (
              /* CONFIRMED FAILURE */
              <View style={{ gap: 12 }}>
                <Text variant="h2">Payment Not Completed</Text>

                <Text variant="body">
                  This payment was declined or canceled. No membership was
                  created for this attempt.
                </Text>

                <Button
                  label="Return to Memgine"
                  fullWidth
                  onPress={returnToMemgine}
                />
              </View>
            ) : processing || unresolved ? (
              /* PROCESSING / TIMEOUT / UNKNOWN STATUS */
              <View style={{ gap: 12 }}>
                <Text variant="h2">
                  {processing
                    ? "Confirming Your Payment…"
                    : "Payment Status Pending"}
                </Text>

                <Text variant="body">
                  {processing
                    ? "We're checking your payment securely. " +
                      "Please don't make another payment."
                    : "We haven't confirmed the payment result yet. " +
                      "You may already have been charged. " +
                      "Please check your payment status instead of paying again."}
                </Text>

                <Button
                  label="Check Payment Status"
                  fullWidth
                  variant="secondary"
                  disabled={processing}
                  onPress={() => void checkStatus()}
                />

                <Button
                  label="Return to Memgine"
                  variant="secondary"
                  onPress={returnToMemgine}
                />
              </View>
            ) : (
              <>
                {/* GOOGLE PAY AND APPLE PAY REVIEW */}
                {canPay && bootstrap?.wallet ? (
                  <PoyntCollectWallets
                    key={checkout.payment.paymentIntentId}
                    configuration={bootstrap}
                    merchantName={merchantName}
                    membershipName="Memgine membership"
                    amountText={amountText}
                    onAuthorize={(nonce, method) => confirm(nonce, method)}
                  />
                ) : null}
                {/* CARD PAYMENT */}
                {canPay && bootstrap ? (
                  <View style={{ gap: 10 }}>
                    <Text variant="bodyStrong">Credit or debit card</Text>
                    <PoyntCollectCardForm
                      configuration={bootstrap}
                      onNonce={async (nonce) => {
                        await confirm(nonce, "card");
                      }}
                      onBack={returnToMemgine}
                      payLabel={`Pay ${amountText} & Subscribe`}
                    />
                  </View>
                ) : null}

                {checkout && !canPay ? (
                  <Button
                    label="Check Payment Status"
                    fullWidth
                    onPress={() => void checkStatus()}
                  />
                ) : null}
              </>
            )}

            {!checkout && !loading ? (
              <Button
                label="Return to Memgine"
                variant="secondary"
                onPress={returnToMemgine}
              />
            ) : null}
          </View>
        }
        summary={
          <View style={{ gap: 14 }}>
            <Text variant="bodyStrong">Memgine Membership</Text>

            <Text variant="bodySmall" color="textMuted">
              Your confirmed payment amount
            </Text>

            <View
              style={{
                borderTopWidth: 1,
                borderTopColor: "#E5E7EB",
                paddingTop: 16,
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Text variant="bodyStrong">Total Due</Text>

              <Text variant="h2">{amountText}</Text>
            </View>

            <Text variant="bodySmall" color="textMuted">
              Final amount provided by Memgine. Taxes and discounts, if
              applicable, are already reflected.
            </Text>
          </View>
        }
      />
    </ScrollView>
  );
}
