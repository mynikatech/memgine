import { useCounterSession } from "@/src/core/services/counter-session-context";
import { useAuth, useBusiness } from "@/src/providers";
import { CounterOrdersDashboard } from "@/src/ui/domain/CounterOrdersDashboard";

export default function CounterOrdersRoute() {
  const { organization } = useBusiness();
  const { session } = useAuth();
  const { context } = useCounterSession();
  const pos = session?.posContext;
  const preferredStoreId = pos?.storeId ?? (context?.organizationId === organization.id ? context.storeId : undefined);
  return <CounterOrdersDashboard key={`${session?.userId}:${organization.id}`} organizationId={organization.id}
    preferredStoreId={preferredStoreId} />;
}
