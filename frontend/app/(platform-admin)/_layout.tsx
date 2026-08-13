import { PLATFORM_ADMIN_ROUTES } from "@/src/constants/navigation";
import { AdminShell } from "@/src/ui/admin/AdminShell";

export default function PlatformAdminLayout() {
  return (
    <AdminShell
      title="Platform Admin"
      subtitle="Memgine Console"
      icon="shield-checkmark-outline"
      items={PLATFORM_ADMIN_ROUTES}
    />
  );
}
