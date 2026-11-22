import { useLocalSearchParams, useRouter } from "expo-router";
import { APP_ROUTES } from "@/src/constants/navigation";
import { useCounterSession } from "@/src/core/services/counter-session-context";
import { useAuth, useBusiness } from "@/src/providers";
import { StateView } from "@/src/ui";
import { CounterOrdersDashboard } from "@/src/ui/domain/CounterOrdersDashboard";
import { counterOrdersContext } from "@/src/ui/domain/counter-orders-model";

/** Counter-only service desk for existing advance orders: identity verification and payment. */
export default function CounterOrderServiceRoute() {
  const { organization } = useBusiness();
  const { session } = useAuth();
  const { context } = useCounterSession();
  const router = useRouter();
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  const scope = counterOrdersContext(organization.id, context, session?.posContext);
  const openWorkspace = () => router.replace(APP_ROUTES.counter.organization(organization.id) as never);
  if (!scope) return <StateView kind="empty" title="Select a Store in Counter"
    message="Verification and payment require an active Counter Store and staff." actionLabel="Open Counter workspace" onAction={openWorkspace} />;
  return <CounterOrdersDashboard key={JSON.stringify([session?.userId, scope.organizationId, scope.storeId, scope.staffId, orderId])}
    workspaceMode="counter" context={scope} initialOrderId={orderId} onOpenWorkspace={openWorkspace}
    onOpenSupport={() => router.push({ pathname: APP_ROUTES.counter.supportRequests,
      params: { organizationId: scope.organizationId, storeId: scope.storeId, staffId: scope.staffId },
    })} />;
}
