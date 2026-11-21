import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, ScrollView, View } from "react-native";

import { Button, Text } from "@/src/ui";
import { CollectCheckoutLayout } from "@/src/ui/payment/CollectCheckoutLayout";
import { PoyntCollectCardForm } from "@/src/ui/payment/PoyntCollectCardForm";
import { PoyntCollectWallets } from "@/src/ui/payment/PoyntCollectWallets";
import { buildTheme } from "@/src/theme/theme";

import {
  poyntCollectBrowserApi,
  type PoyntCollectBootstrap,
  type PoyntCollectBrowserCheckout,
  type PoyntCollectPaymentMethod,
} from "@/src/data/api/customer-data-api";

import type { PaymentConfirmation } from "@/src/data/api/counter-api";
import { collectCompletion, collectRecoveryUrl, collectReloadUrl, collectReturnUrl, collectStatusMatchesIntent } from "@/src/core/services/fulfillment-collect-navigation";

const money = (minor: number, currency: string) =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
  }).format(minor / 100);

const STATUS_POLL_INTERVAL_MS = 2_000;
const STATUS_POLL_TIMEOUT_MS = 60_000;

type Phase = "ready" | "processing" | "uncertain";
type StatusCheckOutcome = "terminal" | "processing" | "failed";

const isTerminalPaymentStatus = (status: string) =>
  ["SUCCEEDED", "FAILED", "CANCELED", "CANCELLED"].includes(status);

export default function PoyntCollectCheckoutScreen() {
  const { session, fulfillmentReturn, intent, org, subscription } = useLocalSearchParams<{
    session?: string; fulfillmentReturn?: string; intent?: string; org?: string; subscription?: string;
  }>();
  const returnPlatform = useRef<"web" | "native" | undefined>(
    fulfillmentReturn === "web" || fulfillmentReturn === "native" ? fulfillmentReturn : undefined,
  );
  const checkoutIntent = useRef(typeof intent === "string" ? intent : undefined);

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
  const [counterConflict, setCounterConflict] = useState(false);

  // Never send two charge requests from this browser session.
  const submitted = useRef(false);
  const checking = useRef(false);
  const mounted = useRef(false);
  const pollGeneration = useRef(0);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopStatusPolling = useCallback(() => {
    pollGeneration.current += 1;
    if (pollTimer.current) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stopStatusPolling();
    };
  }, [stopStatusPolling]);

  const checkStatus = useCallback(async (): Promise<StatusCheckOutcome> => {
    if (checking.current) return "processing";

    checking.current = true;
    if (mounted.current) setPhase("processing");

    try {
      const result = await poyntCollectBrowserApi.status();
      if (!mounted.current) return "processing";
      if (checkoutIntent.current && !collectStatusMatchesIntent(result, checkoutIntent.current)) {
        throw new Error("This checkout session has changed.");
      }

      setError(undefined);
      setConfirmation(result);

      if (isTerminalPaymentStatus(result.payment.status)) {
        setPhase("ready");
        return "terminal";
      }

      setPhase("processing");
      return "processing";
    } catch {
      if (mounted.current) {
        setPhase("uncertain");
        setError(
          "We couldn't confirm your payment status. " +
            "You may already have been charged. " +
            "Please check the status again instead of paying again.",
        );
      }
      return "failed";
    } finally {
      checking.current = false;
    }
  }, []);

  const startStatusPolling = useCallback(() => {
    stopStatusPolling();
    const generation = pollGeneration.current;
    const deadline = Date.now() + STATUS_POLL_TIMEOUT_MS;

    const poll = async () => {
      if (!mounted.current || generation !== pollGeneration.current) return;

      const outcome = await checkStatus();
      if (
        !mounted.current ||
        generation !== pollGeneration.current ||
        outcome !== "processing"
      ) {
        return;
      }

      if (Date.now() >= deadline) {
        setPhase("uncertain");
        setError(
          "Your payment is still being confirmed. " +
            "You may already have been charged. Please check its status " +
            "instead of paying again.",
        );
        return;
      }

      pollTimer.current = setTimeout(() => {
        void poll();
      }, STATUS_POLL_INTERVAL_MS);
    };

    void poll();
  }, [checkStatus, stopStatusPolling]);

  const checkPaymentStatus = useCallback(() => {
    void checkStatus().then((outcome) => {
      if (outcome === "processing") startStatusPolling();
    });
  }, [checkStatus, startStatusPolling]);

  useEffect(() => {
    if (Platform.OS !== "web") {
      setError("This secure checkout must be opened in a browser.");
      setLoading(false);
      return;
    }

    let active = true;

    void (async () => {
      try {
        if (!session) {
          if (!returnPlatform.current || !checkoutIntent.current) throw new Error("This secure checkout has expired. Return to Memgine to continue.");
          const existing = await poyntCollectBrowserApi.status();
          if (!existing.payment.fulfillmentCheckout || !collectStatusMatchesIntent(existing, checkoutIntent.current)) {
            throw new Error("This checkout session has changed. Resume your payment in Memgine.");
          }
          if (active) setConfirmation(existing);
          return;
        }
        const redeemed = await poyntCollectBrowserApi.redeem(session);
        if (!active) return;
        if (!redeemed.payment.fulfillmentCheckout && !redeemed.payment.membershipPlanId) {
          throw new Error("Could not identify this checkout. Return to Memgine to recover your payment.");
        }
        setCheckout(redeemed);
        checkoutIntent.current = redeemed.payment.paymentIntentId;

        window.history.replaceState(
          window.history.state,
          document.title,
          collectReloadUrl(returnPlatform.current, redeemed.payment),
        );
        if (redeemed.payment.fulfillmentCheckout && redeemed.payment.status !== "PENDING") {
          setPhase("processing");
          startStatusPolling();
          return;
        }

        const config = await poyntCollectBrowserApi.bootstrap();

        if (!active) return;

        setCheckout(redeemed);
        setBootstrap(config);

        if (redeemed.payment.status !== "PENDING") {
          setPhase("processing");
          startStatusPolling();
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
  }, [session, startStatusPolling]);

  const confirm = useCallback(
    async (
      nonce: string,
      method: PoyntCollectPaymentMethod = "card",
    ): Promise<boolean> => {
      if (!checkout || submitted.current) return false;

      submitted.current = true;
      setPhase("processing");
      setError(undefined);

      try {
        const result = await poyntCollectBrowserApi.confirm(
          nonce,
          checkout.csrfToken,
          method,
        );

        if (!collectStatusMatchesIntent(result, checkout.payment.paymentIntentId)) {
          startStatusPolling();
          return true;
        }

        setConfirmation(result);

        if (collectCompletion(result)) {
          setPhase("ready");
          return true;
        }

        if (
          ["FAILED", "CANCELED", "CANCELLED"].includes(result.payment.status)
        ) {
          setPhase("ready");
          return false;
        }

        startStatusPolling();
        return true;
      } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ACTIVE_COUNTER_REDEMPTION") {
          setCounterConflict(true);
          setPhase("ready");
          return false;
        }
        // A lost response may mean the provider received the charge.
        // Never automatically send the nonce again.
        startStatusPolling();
        return true;
      }
    },
    [checkout, startStatusPolling],
  );

  const payment = confirmation?.payment ?? checkout?.payment;
  const status = payment?.status;
  const fulfillmentPayment = !!payment?.fulfillmentCheckout;
  const checkoutLabel = payment?.fulfillmentCustomerLabel ?? "Order";
  const backToApp = (cancel = false) => {
    if (typeof window === "undefined") return;
    const mode = returnPlatform.current ?? "native";
    const recovery = !payment && returnPlatform.current && typeof org === "string" && typeof subscription === "string"
      ? collectRecoveryUrl(mode, org, subscription, checkoutIntent.current) : undefined;
    if (mode === "web") window.location.replace(fulfillmentPayment ? collectReturnUrl(mode, payment, cancel, counterConflict) : recovery ?? "/customer/cards");
    else window.location.assign(recovery ?? collectReturnUrl(mode, payment, cancel, counterConflict));
  };

  const success = !!collectCompletion(confirmation);
  const fulfillmentPending = fulfillmentPayment && !success &&
    (status === "SUCCEEDED" || !!payment.fulfillmentCheckout?.verifiedCapture);

  const activationPending =
    status === "SUCCEEDED" && !fulfillmentPayment && !confirmation?.subscription;

  const failed = ["FAILED", "CANCELED", "CANCELLED"].includes(status ?? "");

  const processing = phase === "processing";

  const unresolved =
    phase === "uncertain" || status === "PROCESSING" || activationPending || fulfillmentPending;

  const canPay = !!(
    checkout &&
    bootstrap &&
    checkout.payment.status === "PENDING" &&
    !submitted.current &&
    !confirmation &&
    !processing &&
    !unresolved
  );

  const amountMinor = payment ? Math.round(payment.amount * 100) : 0;

  const amountText = payment
    ? money(amountMinor, payment.currencyCode)
    : "—";

  const merchantName = bootstrap?.wallet?.merchantName ?? "Memgine";
  const membershipStatus = success ? "Active" : "Confirmation pending";
  const checkoutTheme = buildTheme(
    bootstrap?.branding
      ? {
          primaryColor: bootstrap.branding.primaryColor ?? undefined,
          secondaryColor: bootstrap.branding.secondaryColor ?? undefined,
          accentColor: bootstrap.branding.accentColor ?? undefined,
        }
      : undefined,
  );

  return (
    <ScrollView
      style={{
        flex: 1,
        width: "100%",
        backgroundColor: fulfillmentPayment ? checkoutTheme.colors.surfaceAlt : checkoutTheme.colors.primarySoft,
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
        branding={bootstrap?.branding}
        merchantName={merchantName}
        checkoutTitle={fulfillmentPayment ? `Secure ${checkoutLabel.toLowerCase()} checkout` : undefined}
        subtitle={fulfillmentPayment ? `Complete payment for your ${checkoutLabel.toLowerCase()}.` : undefined}
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
              <View
                style={{
                  gap: 12,
                  padding: 18,
                  borderRadius: 16,
                  backgroundColor: checkoutTheme.colors.accentSoft,
                }}
              >
                <Text variant="h2" color="primary">
                  {fulfillmentPayment ? `${checkoutLabel} confirmed` : "Payment Successful"}
                </Text>

                {fulfillmentPayment ? null : <Text variant="bodyStrong">Your membership is active.</Text>}

                <Text variant="body">{fulfillmentPayment ? "Your payment is verified." : "We confirmed your payment and activated your membership."}</Text>

                <Text variant="bodySmall">Amount paid: {amountText}</Text>
                {fulfillmentPayment ? null : <Text variant="bodySmall">
                  Membership status: {membershipStatus}
                </Text>}

                <Button
                  label={fulfillmentPayment ? `View ${checkoutLabel}` : "View My Membership"}
                  fullWidth
                  onPress={() => backToApp()}
                />
              </View>
            ) : counterConflict ? (
              <View style={{ gap: 12 }}>
                <Text variant="h2">A Counter redemption is already in progress</Text>
                <Text>Finish the existing Counter redemption before continuing. Open payment recovery to find its QR.</Text>
                <Button label="Open payment recovery" onPress={() => backToApp()} />
              </View>
            ) : fulfillmentPending ? (
              <View style={{ gap: 12 }}>
                <Text variant="h2">Payment received</Text>
                <Text>Your {checkoutLabel.toLowerCase()} is awaiting confirmation. Check its status before paying again.</Text>
                <Button label="Open payment recovery" onPress={() => backToApp()} />
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
                  onPress={checkPaymentStatus}
                />

                <Button
                  label="Return to Memgine"
                  variant="secondary"
                  onPress={() => backToApp()}
                />
              </View>
            ) : failed ? (
              /* CONFIRMED FAILURE */
              <View style={{ gap: 12 }}>
                <Text variant="h2">Payment Not Completed</Text>

                <Text variant="body">
                  {fulfillmentPayment ? "This payment was declined or canceled." : "This payment was declined or canceled. No membership was created for this attempt."}
                </Text>

                <Button
                  label="Return to Memgine"
                  fullWidth
                  onPress={() => backToApp()}
                />
              </View>
            ) : processing || unresolved ? (
              /* PROCESSING / TIMEOUT / UNKNOWN STATUS */
              <View style={{ gap: 12 }}>
                <Text variant="h2">
                  {processing
                    ? "Processing your payment…"
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
                  onPress={checkPaymentStatus}
                />

                <Button
                  label="Return to Memgine"
                  variant="secondary"
                  onPress={() => backToApp()}
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
                    membershipName={fulfillmentPayment ? checkoutLabel : "Memgine membership"}
                    amountText={amountText}
                    onAuthorize={(nonce, method) => confirm(nonce, method)}
                  />
                ) : null}
                {/* CARD PAYMENT */}
                {/* CARD PAYMENT */}
                {canPay && bootstrap ? (
                  <View style={{ gap: 10, minWidth: 0, width: "100%" }}>
                    <Text variant="bodyStrong">Credit or debit card</Text>

                    <PoyntCollectCardForm
                      configuration={bootstrap}
                      onNonce={async (nonce) => {
                        await confirm(nonce, "card");
                      }}
                      onBack={() => backToApp(true)}
                      payLabel={fulfillmentPayment ? `Pay ${amountText}` : `Pay ${amountText} & Subscribe`}
                    />
                  </View>
                ) : null}

                {checkout && !canPay ? (
                  <Button
                    label="Check Payment Status"
                    fullWidth
                    onPress={checkPaymentStatus}
                  />
                ) : null}
              </>
            )}

            {!checkout && !loading && !success && !fulfillmentPending && !failed && !processing && !unresolved ? (
              <Button
                label={fulfillmentPayment ? "Resume in Memgine" : "Return to Memgine"}
                variant="secondary"
                onPress={() => backToApp()}
              />
            ) : null}
          </View>
        }
        summary={
          <View style={{ gap: 14 }}>
            <Text variant="bodyStrong">{fulfillmentPayment ? checkoutLabel : "Memgine Membership"}</Text>

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
              <Text variant="bodyStrong">{fulfillmentPayment && success ? "Amount paid" : "Total Due"}</Text>

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
