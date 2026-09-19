import { useLocalSearchParams } from "expo-router";

import { createOrgAdminRoutes } from "@/src/constants/navigation";
import { BusinessProvider } from "@/src/providers";
import { AdminShell } from "@/src/ui/admin/AdminShell";
import { AuthGuard } from "@/src/ui/auth/AuthGuard";

export default function OrganizationScopedOrgAdminLayout() {
  const params = useLocalSearchParams<{ organizationId?: string | string[] }>();
  const organizationId = Array.isArray(params.organizationId)
    ? params.organizationId[0]
    : params.organizationId;

  if (!organizationId) return null;

  return (
    <AuthGuard capability="ORG_ADMIN_ACCESS" organizationId={organizationId}>
      <BusinessProvider organizationId={organizationId}>
        <AdminShell
          title="Org Admin"
          subtitle="Business Console"
          icon="business-outline"
          items={createOrgAdminRoutes(organizationId)}
        />
      </BusinessProvider>
    </AuthGuard>
  );
}
