const MIGRATION_KEY = "memgine.migration.pdm-status-ids-v1";

/*
 * One-time migration from the original frontend reference/status identifiers
 * to the identifiers now authoritative in the PDM/database.
 *
 * Keep this mapping explicit. Do not attempt to dynamically manufacture IDs.
 */
const ID_REPLACEMENTS: Record<string, string> = {
  // Entity Types
  "entity-type-organization": "entity-type-org",
  "entity-type-organization-user": "entity-type-org-user",
  "entity-type-organization-user-role": "entity-type-org-user-role",
  "entity-type-staff-store-assignment": "entity-type-staff-assignment",
  "entity-type-organization-branding": "entity-type-org-branding",
  "entity-type-notification-configuration": "entity-type-notification-config",
  "entity-type-integration-configuration": "entity-type-integration-config",

  // Organization
  "entity-status-organization-pending": "entity-status-org-pending",
  "entity-status-organization-active": "entity-status-org-active",
  "entity-status-organization-inactive": "entity-status-org-inactive",
  "entity-status-organization-suspended": "entity-status-org-suspended",
  "entity-status-organization-closed": "entity-status-org-closed",

  // Organization User
  "entity-status-organization_user-pending": "entity-status-org-user-pending",
  "entity-status-organization_user-active": "entity-status-org-user-active",
  "entity-status-organization_user-inactive": "entity-status-org-user-inactive",
  "entity-status-organization_user-suspended":
    "entity-status-org-user-suspended",
  "entity-status-organization_user-closed": "entity-status-org-user-closed",

  // Organization User Role
  "entity-status-organization_user_role-pending":
    "entity-status-org-user-role-pending",
  "entity-status-organization_user_role-active":
    "entity-status-org-user-role-active",
  "entity-status-organization_user_role-inactive":
    "entity-status-org-user-role-inactive",
  "entity-status-organization_user_role-revoked":
    "entity-status-org-user-role-revoked",

  // Platform User Role
  "entity-status-platform_user_role-pending":
    "entity-status-platfrm-user-role-pending",
  "entity-status-platform_user_role-active":
    "entity-status-platfrm-user-role-active",
  "entity-status-platform_user_role-inactive":
    "entity-status-platfrm-user-role-inactive",
  "entity-status-platform_user_role-revoked":
    "entity-status-platfrm-user-role-revoked",

  // Membership Product
  "entity-status-membership_product-draft":
    "entity-status-membership-prod-draft",
  "entity-status-membership_product-active":
    "entity-status-membership-prod-active",
  "entity-status-membership_product-inactive":
    "entity-status-membership-prod-inactive",
  "entity-status-membership_product-expired":
    "entity-status-membership-prod-expired",
  "entity-status-membership_product-retired":
    "entity-status-membership-prod-retired",

  // Staff Store Assignment
  "entity-status-staff_store_assignment-pending":
    "entity-status-staff-assignment-pending",
  "entity-status-staff_store_assignment-active":
    "entity-status-staff-assignment-active",
  "entity-status-staff_store_assignment-inactive":
    "entity-status-staff-assignment-inactive",
  "entity-status-staff_store_assignment-revoked":
    "entity-status-staff-assignment-revoked",

  // Organization Branding
  "entity-status-branding-active": "entity-status-org-branding-active",
  "entity-status-organization_branding-draft":
    "entity-status-org-branding-draft",
  "entity-status-organization_branding-active":
    "entity-status-org-branding-active",
  "entity-status-organization_branding-inactive":
    "entity-status-org-branding-inactive",

  // Notification Configuration
  "entity-status-notification_configuration-draft":
    "entity-status-notifiy-config-draft",
  "entity-status-notification_configuration-active":
    "entity-status-notifiy-config-active",
  "entity-status-notification_configuration-inactive":
    "entity-status-notifiy-config-inactive",

  // Integration Configuration
  "entity-status-integration_configuration-draft":
    "entity-status-integrate-config-draft",
  "entity-status-integration_configuration-active":
    "entity-status-integrate-config-active",
  "entity-status-integration_configuration-inactive":
    "entity-status-integrate-config-inactive",
  "entity-status-integration_configuration-suspended":
    "entity-status-integrate-config-suspended",
};
/**
 * Recursively replaces known legacy IDs anywhere inside a LocalStorage value.
 *
 * This deliberately changes only exact string values. It will not perform
 * substring replacement inside arbitrary text.
 */
function migrateValue(value: unknown): {
  value: unknown;
  changed: boolean;
} {
  if (typeof value === "string") {
    const replacement = ID_REPLACEMENTS[value];

    if (replacement) {
      return {
        value: replacement,
        changed: true,
      };
    }

    return {
      value,
      changed: false,
    };
  }

  if (Array.isArray(value)) {
    let changed = false;

    const migrated = value.map((item) => {
      const result = migrateValue(item);

      if (result.changed) {
        changed = true;
      }

      return result.value;
    });

    return {
      value: migrated,
      changed,
    };
  }

  if (value !== null && typeof value === "object") {
    let changed = false;

    const migrated: Record<string, unknown> = {};

    for (const [key, item] of Object.entries(
      value as Record<string, unknown>,
    )) {
      const result = migrateValue(item);

      if (result.changed) {
        changed = true;
      }

      migrated[key] = result.value;
    }

    return {
      value: migrated,
      changed,
    };
  }

  return {
    value,
    changed: false,
  };
}

export function runPdmStatusIdMigrationV1(): void {
  if (
    typeof window === "undefined" ||
    typeof globalThis.localStorage === "undefined"
  ) {
    return;
  }

  const storage = globalThis.localStorage;

  if (storage.getItem(MIGRATION_KEY) === "complete") {
    return;
  }

  const keys = Object.keys(storage).filter(
    (key) => key.startsWith("memgine.") || key.startsWith("memgine:"),
  );

  let migratedEntries = 0;

  for (const key of keys) {
    const rawValue = storage.getItem(key);

    if (rawValue === null) {
      continue;
    }

    try {
      const parsed = JSON.parse(rawValue);
      const result = migrateValue(parsed);

      if (result.changed) {
        storage.setItem(key, JSON.stringify(result.value));

        migratedEntries += 1;
      }
    } catch {
      // Ignore non-JSON LocalStorage entries.
    }
  }

  storage.setItem(MIGRATION_KEY, "complete");

  console.info(
    `[Memgine] PDM status ID migration V1 complete. Updated ${migratedEntries} LocalStorage entries.`,
  );
}
