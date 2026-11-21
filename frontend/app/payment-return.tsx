import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";
import { Text } from "@/src/ui";

import { useAuth } from "@/src/providers";
import { APP_ROUTES } from "@/src/constants/navigation";
import { services } from "@/src/core";
import { storage } from "@/src/utils/storage";
import { fulfillmentCollectReturnKey, hasActiveNativeCollectReturn, type FulfillmentCollectReturn } from "@/src/core/services/native-collect-return";
import { CustomerDataApi } from "@/src/data/api/customer-data-api";
import { fulfillmentRoute, verifiedFulfillmentDestination } from "@/src/core/services/fulfillment-collect-navigation";

const api = new CustomerDataApi();

type PendingCheckout = {
  organizationId: string;
  customerUserId: string;
  membershipProductId: string;
  paymentIntentId: string;
};

/**
 * The deep link is only a return signal.
 *
 * Never infer payment success from the deep link.
 * join.tsx must restore the original payment intent and
 * obtain its authoritative status from the backend.
 */
export default function PaymentReturn() {
  const { session, loading } = useAuth();
  const router = useRouter();
  const { cancelPayment, fulfillmentPayment, org, subscription, intent, view, counterConflict } = useLocalSearchParams<{
    cancelPayment?: string | string[];
    fulfillmentPayment?: string;
    org?: string; subscription?: string; intent?: string; view?: string; counterConflict?: string;
  }>();
  const cancellationRequested =
    (Array.isArray(cancelPayment) ? cancelPayment[0] : cancelPayment) === "1";

  useEffect(() => {
    if (loading) return;
    if (!session?.userId) {
      if (fulfillmentPayment === "1") {
        const params = new URLSearchParams({ fulfillmentPayment: "1" });
        if (typeof org === "string") params.set("org", org);
        if (typeof subscription === "string") params.set("subscription", subscription);
        if (typeof intent === "string") params.set("intent", intent);
        if (view === "details") params.set("view", view);
        if (counterConflict === "1") params.set("counterConflict", "1");
        router.replace({ pathname: APP_ROUTES.customerLogin, params: { returnTo: `${APP_ROUTES.paymentReturn}?${params}` } });
      } else router.replace(APP_ROUTES.mobileEntry as never);
      return;
    }

    let active = true;

    const restoreCheckout = async () => {
      try {
        if (fulfillmentPayment === "1") {
          const checkout = await storage.getItem<FulfillmentCollectReturn | null>(
            fulfillmentCollectReturnKey(session.userId), null,
          );
          if (!active) return;
          const saved = checkout?.customerUserId === session.userId && checkout.organizationId && checkout.subscriptionId && checkout.paymentIntentId
            ? checkout : undefined;
          const proposed = typeof org === "string" && typeof intent === "string" && typeof subscription === "string" && org && intent && subscription
            ? { organizationId: org, paymentIntentId: intent, subscriptionId: subscription } : undefined;
          const context = proposed ?? saved;
          if (!context) {
            router.replace(APP_ROUTES.customer.cards as never);
            return;
          }
          const sameCheckout = saved?.paymentIntentId === context.paymentIntentId && saved.organizationId === context.organizationId;
          if (sameCheckout && hasActiveNativeCollectReturn(`fulfillment:${session.userId}`) && router.canGoBack()) {
            router.back();
            return;
          }
          // The URL identifies an intent to look up. Only the authenticated response can identify an accepted fulfillment.
          let destination;
          try {
            const result = await api.reconcileFulfillmentPayment(context.organizationId, context.paymentIntentId);
            if (result.success) destination = verifiedFulfillmentDestination(result.data, context.organizationId,
              context.paymentIntentId, view === "details" ? "details" : "confirmation", true);
          } catch {
            // Leave the exact intent available for recovery after a transient failure.
          }
          if (active) {
            const route = destination ?? fulfillmentRoute(context.organizationId, context.subscriptionId, "payment", context.paymentIntentId);
            router.replace(counterConflict === "1" && route.params.view === "payment"
              ? { ...route, params: { ...route.params, counterConflict: "1" } } : route);
          }
          return;
        }
        const pending = await storage.getItem<PendingCheckout | null>(
          `customer-collect-payment-return:${session.userId}`,
          null,
        );

        if (!active) return;

        const validCheckout =
          pending?.customerUserId === session.userId &&
          typeof pending.organizationId === "string" &&
          pending.organizationId.trim().length > 0 &&
          typeof pending.membershipProductId === "string" &&
          pending.membershipProductId.trim().length > 0 &&
          typeof pending.paymentIntentId === "string" &&
          pending.paymentIntentId.trim().length > 0;

        if (validCheckout && pending) {
          if (
            hasActiveNativeCollectReturn(session.userId) &&
            router.canGoBack()
          ) {
            // An original native checkout is still active.
            // Return to that existing JoinFlow rather than mounting another
            // JoinFlow or independently performing success navigation.
            //
            // The original browser-session continuation checks the saved
            // payment intent and handles its verified completion.
            router.back();
            return;
          }
          if (cancellationRequested) {
            try {
              const canceled = await services.customerData.cancelPayment(
                pending.organizationId,
                pending.paymentIntentId,
              );
              if (!active) return;

              if (["CANCELED", "CANCELLED"].includes(canceled.status)) {
                await Promise.all([
                  storage.removeItem(
                    `customer-collect-payment:${pending.organizationId}:${session.userId}`,
                  ),
                  storage.removeItem(
                    `customer-payment-start:${pending.organizationId}:${session.userId}`,
                  ),
                  storage.removeItem(
                    `customer-collect-payment-return:${session.userId}`,
                  ),
                ]);
                if (!active) return;
                router.replace(
                  APP_ROUTES.join.membership(
                    pending.organizationId,
                    pending.membershipProductId,
                  ) as never,
                );
                return;
              }
            } catch {
              // Cancellation can lose a race with a provider claim. Preserve
              // recovery state and continue with the authoritative lookup.
            }
          }
          // On native, Expo Router may receive the same custom-scheme redirect
          // that completes openAuthSessionAsync. Treat it only as a signal and
          // ask the backend whether this existing intent was fulfilled before
          // restoring the checkout screen.
          try {
            const confirmation = await services.customerData.paymentStatus(
              pending.organizationId,
              pending.paymentIntentId,
            );

            if (!active) return;

            if (
              confirmation.payment.providerCode === "POYNT_COLLECT" &&
              confirmation.payment.status === "SUCCEEDED" &&
              confirmation.subscription
            ) {
              router.replace(APP_ROUTES.customer.cards as never);
              return;
            }
          } catch {
            // Preserve the saved intent and restore checkout recovery. A
            // status-read failure never authorizes another payment attempt.
          }

          router.replace(
            APP_ROUTES.join.membership(
              pending.organizationId,
              pending.membershipProductId,
            ) as never,
          );
          return;
        }

        router.replace(APP_ROUTES.customer.cards as never);
      } catch {
        if (!active) return;

        // Storage could not be read. Do not create another payment.
        router.replace(APP_ROUTES.customer.cards as never);
      }
    };

    void restoreCheckout();

    return () => {
      active = false;
    };
  }, [cancellationRequested, counterConflict, fulfillmentPayment, intent, loading, org, router, session?.userId, subscription, view]);

  return fulfillmentPayment === "1" ? (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 16 }}>
      <Text accessibilityLiveRegion="polite">Checking payment status…</Text>
    </View>
  ) : <View />;
}
