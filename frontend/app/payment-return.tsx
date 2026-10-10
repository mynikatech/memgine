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

/** The deep link is only a signal; join.tsx reads payment status from the API. */
export default function PaymentReturn() {
  const { session } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!session?.userId) {
      router.replace(APP_ROUTES.mobileEntry as never);
      return;
    }
    void storage
      .getItem<PendingCheckout | null>(
        `customer-collect-payment-return:${session.userId}`,
        null,
      )
      .then((pending) => {
        if (pending?.customerUserId === session.userId) {
          router.replace(
            APP_ROUTES.join.membership(pending.organizationId, pending.membershipProductId) as never,
          );
        } else {
          router.replace(APP_ROUTES.customer.cards as never);
        }
      });
  }, [router, session?.userId]);

  return <View />;
}
