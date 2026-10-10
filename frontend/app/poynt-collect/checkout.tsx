import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Platform, ScrollView, View } from "react-native";
import { Text, Button } from "@/src/ui";
import { CollectCheckoutLayout } from "@/src/ui/payment/CollectCheckoutLayout";
import { PoyntCollectCardForm } from "@/src/ui/payment/PoyntCollectCardForm";
import {
  poyntCollectBrowserApi,
  type PoyntCollectBootstrap,
  type PoyntCollectBrowserCheckout,
} from "@/src/data/api/customer-data-api";
import type { PaymentConfirmation } from "@/src/data/api/counter-api";

const money = (minor: number, currency: string) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency }).format(minor / 100);

function returnToMemgine() {
  if (typeof window !== "undefined") window.location.assign("memgine://payment-return");
}

export default function PoyntCollectCheckoutScreen() {
  const { session } = useLocalSearchParams<{ session?: string }>();
  const [checkout, setCheckout] = useState<PoyntCollectBrowserCheckout | null>(null);
  const [bootstrap, setBootstrap] = useState<PoyntCollectBootstrap | null>(null);
  const [confirmation, setConfirmation] = useState<PaymentConfirmation | null>(null);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);

  const checkStatus = useCallback(async () => {
    try {
      setError(undefined);
      const value = await poyntCollectBrowserApi.status();
      setConfirmation(value);
      if (value.payment.status === "SUCCEEDED" && value.subscription) returnToMemgine();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to check payment status.");
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
        // Remove the one-time establishment bearer from browser history.
        window.history.replaceState({}, document.title, "/poynt-collect/checkout");
        const config = await poyntCollectBrowserApi.bootstrap();
        if (active) {
          setCheckout(redeemed);
          setBootstrap(config);
        }
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Secure checkout is unavailable.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [session]);

  const confirm = useCallback(async (nonce: string) => {
    if (!checkout) return;
    try {
      setError(undefined);
      const value = await poyntCollectBrowserApi.confirm(nonce, checkout.csrfToken);
      setConfirmation(value);
      if (value.payment.status === "SUCCEEDED" && value.subscription) returnToMemgine();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Payment confirmation is pending.");
      await checkStatus();
    }
  }, [checkStatus, checkout]);

  const amountMinor = checkout ? Math.round(checkout.payment.amount * 100) : 0;
  const terminal = !!confirmation && ["SUCCEEDED", "FAILED", "CANCELED"].includes(confirmation.payment.status);
  const canPay = checkout && bootstrap && !terminal && checkout.payment.status === "PENDING";

  return (
    <ScrollView
      style={{ flex: 1, width: "100%", backgroundColor: "#F7F8FA" }}
      contentContainerStyle={{ flexGrow: 1, alignItems: "center", paddingHorizontal: 16, paddingVertical: 26 }}
      keyboardShouldPersistTaps="handled"
    >
      <CollectCheckoutLayout
        payment={
          <View style={{ gap: 16, minWidth: 0 }}>
            {loading ? <Text variant="body">Preparing secure checkout…</Text> : null}
            {error ? <Text variant="bodySmall" color="danger">{error}</Text> : null}
            {canPay ? (
              <PoyntCollectCardForm
                configuration={bootstrap}
                onNonce={confirm}
                onBack={returnToMemgine}
                payLabel={`Pay ${money(amountMinor, checkout.payment.currencyCode)} & Subscribe`}
              />
            ) : null}
            {checkout && (!terminal || checkout.payment.status === "PROCESSING") ? (
              <Button label="Check Payment Status" variant="secondary" onPress={checkStatus} />
            ) : null}
            {confirmation?.payment.status === "SUCCEEDED" && confirmation.subscription ? (
              <Text variant="bodyStrong">Payment complete. Returning to Memgine…</Text>
            ) : null}
            {terminal && confirmation?.payment.status !== "SUCCEEDED" ? (
              <Text variant="body">The payment was not approved. No membership was created.</Text>
            ) : null}
            {!canPay ? <Button label="Return to Memgine" variant="secondary" onPress={returnToMemgine} /> : null}
          </View>
        }
        summary={
          <View style={{ gap: 14 }}>
            <Text variant="bodyStrong">Memgine membership</Text>
            <Text variant="bodySmall" color="textMuted">Your confirmed payment amount</Text>
            <View style={{ borderTopWidth: 1, borderTopColor: "#E5E7EB", paddingTop: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text variant="bodyStrong">Total due</Text>
              <Text variant="h2">{checkout ? money(amountMinor, checkout.payment.currencyCode) : "—"}</Text>
            </View>
            <Text variant="bodySmall" color="textMuted">Final amount provided by Memgine. Taxes and discounts, if applicable, are already reflected.</Text>
          </View>
        }
      />
    </ScrollView>
  );
}
