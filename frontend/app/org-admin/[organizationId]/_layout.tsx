import { useLocalSearchParams } from "expo-router";

import { createOrgAdminRoutes } from "@/src/constants/navigation";
import { BusinessProvider } from "@/src/providers";
import { AdminShell } from "@/src/ui/admin/AdminShell";

export default function OrganizationScopedOrgAdminLayout() {
  const params = useLocalSearchParams<{ organizationId?: string | string[] }>();
  const organizationId = Array.isArray(params.organizationId)
    ? params.organizationId[0]
    : params.organizationId;

  if (!organizationId) return null;

  return (
    <BusinessProvider organizationId={organizationId}>
      <AdminShell
        title="Org Admin"
        subtitle="Business Console"
        icon="business-outline"
        items={createOrgAdminRoutes(organizationId)}
      />
    </BusinessProvider>
  );
}
