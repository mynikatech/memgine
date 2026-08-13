import { ORG_ADMIN_ROUTES } from "@/src/constants/navigation";
import { AdminShell } from "@/src/ui/admin/AdminShell";

export default function OrgAdminLayout() {
  return (
    <AdminShell
      title="Org Admin"
      subtitle="Business Console"
      icon="business-outline"
      items={ORG_ADMIN_ROUTES}
    />
  );
}
