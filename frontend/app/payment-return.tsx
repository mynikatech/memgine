import { useRouter } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";

import { useAuth } from "@/src/providers";
import { APP_ROUTES } from "@/src/constants/navigation";
import { services } from "@/src/core";
import { storage } from "@/src/utils/storage";
import { hasActiveNativeCollectReturn } from "@/src/core/services/native-collect-return";

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
  const { session } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!session?.userId) {
      router.replace(APP_ROUTES.mobileEntry as never);
      return;
    }

    let active = true;

    const restoreCheckout = async () => {
      try {
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
  }, [router, session?.userId]);

  return <View />;
}
