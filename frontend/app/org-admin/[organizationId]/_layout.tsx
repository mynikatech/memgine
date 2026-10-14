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

  console.log("[ORG ADMIN LAYOUT]", {
    organizationId,
    params,
  });
  if (!organizationId) return null;
  console.log("[ORG ADMIN LAYOUT RENDER]", {
    organizationId,
    pathname: "/org-admin/" + organizationId,
  });

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
