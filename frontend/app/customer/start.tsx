import { Redirect } from "expo-router";
import { View } from "react-native";

import { APP_ROUTES } from "@/src/constants/navigation";
import { useCustomerContext } from "@/src/providers";
import { Text } from "@/src/ui";

export default function CustomerSmartLanding() {
  const { customerId, customersLoading, customersError, landing } =
    useCustomerContext();

  if (customersError) {
    return <Redirect href={APP_ROUTES.customer.cards as never} />;
  }

  if (!customerId || customersLoading || !landing) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <Text>Opening Memgine…</Text>
      </View>
    );
  }

  const businesses = landing.discoverableOrganizations;

  if (businesses.length === 1) {
    return (
      <Redirect
        href={
          APP_ROUTES.discover.organization(
            businesses[0].organizationId,
          ) as never
        }
      />
    );
  }

  return <Redirect href={APP_ROUTES.customer.cards as never} />;
}
