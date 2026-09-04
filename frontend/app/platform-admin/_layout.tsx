import { PLATFORM_ADMIN_ROUTES } from "@/src/constants/navigation";

import { BusinessThemeScope } from "@/src/providers";

import { baseTheme } from "@/src/theme/theme";

import { AdminShell } from "@/src/ui/admin/AdminShell";

export default function PlatformAdminLayout() {
  return (
    <BusinessThemeScope theme={baseTheme}>
      <AdminShell
        title="Platform Admin"
        subtitle="Memgine Console"
        icon="shield-checkmark-outline"
        items={PLATFORM_ADMIN_ROUTES}
      />
    </BusinessThemeScope>
  );
}
