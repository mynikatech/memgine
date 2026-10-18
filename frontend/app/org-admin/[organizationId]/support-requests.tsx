import { SupportRequestsScreen } from "@/src/ui/domain/SupportRequestsScreen";
import { useBusiness } from "@/src/providers";

export default function OrgAdminSupportRequests() {
  const { organization } = useBusiness();
  return <SupportRequestsScreen scope="organization" organizationId={organization.id} />;
}