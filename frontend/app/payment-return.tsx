import { useRouter } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";

import { useAuth } from "@/src/providers";
import { APP_ROUTES } from "@/src/constants/navigation";
import { storage } from "@/src/utils/storage";

type PendingCheckout = {
  organizationId: string;
  customerUserId: string;
  membershipProductId: string;
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
          pending.membershipProductId.trim().length > 0;

        if (validCheckout && pending) {
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
