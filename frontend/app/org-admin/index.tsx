import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";

import { APP_ROUTES } from "@/src/constants/navigation";
import { useAuth } from "@/src/providers/AuthProvider";

export default function OrgAdminEntry() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  const authorizedOrganizations =
    session?.access.filter(
      (access) =>
        !!access.organizationId &&
        access.capabilities.includes("ORG_ADMIN_ACCESS"),
    ) ?? [];

  if (authorizedOrganizations.length === 1) {
    return (
      <Redirect
        href={
          APP_ROUTES.orgAdmin.organization(
            authorizedOrganizations[0].organizationId!,
          ) as never
        }
      />
    );
  }

  return <Redirect href={APP_ROUTES.workspaces as never} />;
}
