import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Platform, View } from "react-native";
import { Card, Text, Button } from "@/src/ui";
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
        // The establishment bearer must not remain in browser history after exchange.
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
      if (value.payment.status === "SUCCEEDED" && value.subscription) {
        returnToMemgine();
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Payment confirmation is pending.");
      await checkStatus();
    }
  }, [checkStatus, checkout]);

  const amountMinor = checkout ? Math.round(checkout.payment.amount * 100) : 0;
  const terminal = confirmation && ["SUCCEEDED", "FAILED", "CANCELED"].includes(confirmation.payment.status);

  return (
    <View style={{ flex: 1, padding: 24, justifyContent: "center", maxWidth: 560, width: "100%", alignSelf: "center" }}>
      <Card padding="lg">
        <View style={{ gap: 16 }}>
          <Text variant="h2">Secure membership payment</Text>
          {loading ? <Text variant="body">Preparing secure checkout…</Text> : null}
          {checkout ? <Text variant="bodyStrong">Amount due: {money(amountMinor, checkout.payment.currencyCode)}</Text> : null}
          {error ? <Text variant="bodySmall" color="danger">{error}</Text> : null}
          {checkout && bootstrap && !terminal && checkout.payment.status === "PENDING" ? (
            <PoyntCollectCardForm
              configuration={bootstrap}
              onNonce={confirm}
              onBack={returnToMemgine}
              payLabel={`Pay ${money(amountMinor, checkout.payment.currencyCode)}`}
            />
          ) : null}
          {checkout && (!terminal || checkout.payment.status === "PROCESSING") ? (
            <Button label="Check Payment Status" onPress={checkStatus} />
          ) : null}
          {confirmation?.payment.status === "SUCCEEDED" && confirmation.subscription ? (
            <Text variant="bodyStrong">Payment complete. Returning to Memgine…</Text>
          ) : null}
          {terminal && confirmation?.payment.status !== "SUCCEEDED" ? (
            <Text variant="body">The payment was not approved. No membership was created.</Text>
          ) : null}
          <Button label="Return to Memgine" variant="secondary" onPress={returnToMemgine} />
        </View>
      </Card>
    </View>
  );
}
