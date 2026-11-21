import { useRouter } from "expo-router";
import { APP_ROUTES } from "@/src/constants/navigation";
import { useCounterSession } from "@/src/core/services/counter-session-context";
import { useAuth, useBusiness } from "@/src/providers";
import { StateView } from "@/src/ui";
import { CounterOrdersDashboard } from "@/src/ui/domain/CounterOrdersDashboard";
import { counterOrdersContext } from "@/src/ui/domain/counter-orders-model";

export default function CounterOrdersRoute() {
  const { organization } = useBusiness();
  const { session } = useAuth();
  const { context } = useCounterSession();
  const router = useRouter();
  const scope = counterOrdersContext(organization.id, context, session?.posContext);
  const openWorkspace = () => router.replace(APP_ROUTES.counter.organization(organization.id) as never);
  if (!scope) return <StateView kind="empty" title="Select a Store in Counter"
    message="Orders use the active Store and staff from the Counter workspace." actionLabel="Open Counter workspace" onAction={openWorkspace} />;
  return <CounterOrdersDashboard key={JSON.stringify([session?.userId, scope.organizationId, scope.storeId, scope.staffId])}
    context={scope} onOpenWorkspace={openWorkspace} />;
}
