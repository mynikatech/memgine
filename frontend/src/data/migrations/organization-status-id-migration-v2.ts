const MIGRATION_KEY = "memgine.migration.organization-status-id-v2";

export function runOrganizationStatusIdMigrationV2(): void {
  if (typeof window === "undefined") {
    return;
  }

  if (localStorage.getItem(MIGRATION_KEY) === "complete") {
    return;
  }

  const keys = Object.keys(localStorage).filter(
    (key) => key.startsWith("memgine.") || key.startsWith("memgine:"),
  );

  let migratedEntries = 0;

  for (const key of keys) {
    const rawValue = localStorage.getItem(key);

    if (rawValue === null) {
      continue;
    }

    try {
      const parsed = JSON.parse(rawValue);
      const result = migrateOrganizationStatus(parsed);

      if (result.changed) {
        localStorage.setItem(key, JSON.stringify(result.value));
        migratedEntries += 1;
      }
    } catch {
      // Ignore non-JSON LocalStorage entries.
    }
  }

  localStorage.setItem(MIGRATION_KEY, "complete");

  console.info(
    `[Memgine] Organization status ID migration V2 complete. Updated ${migratedEntries} LocalStorage entries.`,
  );
}

function migrateOrganizationStatus(value: unknown): {
  value: unknown;
  changed: boolean;
} {
  if (Array.isArray(value)) {
    let changed = false;

    const migrated = value.map((item) => {
      const result = migrateOrganizationStatus(item);
      changed ||= result.changed;
      return result.value;
    });

    return { value: migrated, changed };
  }

  if (value !== null && typeof value === "object") {
    let changed = false;
    const migrated: Record<string, unknown> = {};

    for (const [key, item] of Object.entries(
      value as Record<string, unknown>,
    )) {
      if (key === "organizationStatusId" && item === "status-active") {
        migrated[key] = "entity-status-org-active";
        changed = true;
        continue;
      }

      const result = migrateOrganizationStatus(item);
      migrated[key] = result.value;
      changed ||= result.changed;
    }

    return { value: migrated, changed };
  }

  return { value, changed: false };
}
