import { useEffect } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";

import { APP_ROUTES } from "@/src/constants/navigation";
import { useCounterSession } from "@/src/core/services/counter-session-context";
import { useBusiness } from "@/src/providers";
import { CounterSupportRequestsScreen } from "@/src/ui/domain/CounterSupportRequestsScreen";

export default function CounterSupportRequestsRoute() {
  const router = useRouter();
  const { organization } = useBusiness();
  const { context } = useCounterSession();
  const params = useLocalSearchParams<{
    organizationId?: string;
    storeId?: string;
    staffId?: string;
  }>();
  const organizationId = params.organizationId ?? organization.id;
  const validContext =
    context?.organizationId === organizationId &&
    (!params.storeId || context.storeId === params.storeId) &&
    (!params.staffId || context.staffId === params.staffId)
      ? context
      : null;

  useEffect(() => {
    if (!validContext) {
      router.replace(APP_ROUTES.counter.organization(organizationId) as never);
    }
  }, [organizationId, router, validContext]);

  return validContext ? <CounterSupportRequestsScreen context={validContext} /> : null;
}
