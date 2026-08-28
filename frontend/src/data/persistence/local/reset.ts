import AsyncStorage from "@react-native-async-storage/async-storage";
import { activeOrganizationStore } from "../session/active-organization-store";

const ORGANIZATION_KEY_PREFIX = "memgine.organization.";

const ORGANIZATION_LIST_KEY = "memgine.organizations";

/**
 * Development-only helper.
 *
 * Removes locally persisted organization data without touching
 * unrelated AsyncStorage entries such as authentication/session data.
 */
export async function resetLocalOrganizations(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();

  const organizationKeys = keys.filter(
    (key) =>
      key === ORGANIZATION_LIST_KEY || key.startsWith(ORGANIZATION_KEY_PREFIX),
  );

  console.log("[resetLocalOrganizations] all keys:", keys);

  console.log("[resetLocalOrganizations] organization keys:", organizationKeys);

  if (organizationKeys.length === 0) {
    console.log("[resetLocalOrganizations] nothing to remove");
    return;
  }

  if (organizationKeys.length > 0) {
    await AsyncStorage.multiRemove(organizationKeys);
  }
  await activeOrganizationStore.clear();

  console.log("[resetLocalOrganizations] removed:", organizationKeys);
}
