import { ORG_ADMIN_ROUTES } from "@/src/constants/navigation";
import { BusinessThemeScope } from "@/src/providers";
import { baseTheme } from "@/src/theme/theme";
import { AdminShell } from "@/src/ui/admin/AdminShell";

export default function OrgAdminLayout() {
  return (
    <BusinessThemeScope theme={baseTheme}>
      <AdminShell
        title="Org Admin"
        subtitle="Business Console"
        icon="business-outline"
        items={ORG_ADMIN_ROUTES}
      />
    </BusinessThemeScope>
  );
}
