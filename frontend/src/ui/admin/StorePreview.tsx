import { StyleSheet, View } from "react-native";

import type {
  CountryReference,
  ReferenceDataItem,
  Status,
  Store,
} from "@/src/core";

import { useTheme } from "@/src/providers";

import { Badge, Card, Section, Text } from "@/src/ui";

type StorePreviewProps = {
  currentStores: Store[];
  proposedStores: Store[];

  storeTypes: ReferenceDataItem[];
  storeStatuses: Status[];
  countries: CountryReference[];
};

type DiffItem = {
  label: string;
  current: string;
  proposed: string;
};

function display(value: string | undefined | null): string {
  const normalized = value?.trim();

  return normalized ? normalized : "—";
}

function getStoreTypeName(
  id: string | undefined,
  storeTypes: ReferenceDataItem[],
): string {
  if (!id) {
    return "—";
  }

  return storeTypes.find((item) => item.id === id)?.name ?? id;
}

function getStoreStatusName(
  id: string | undefined,
  storeStatuses: Status[],
): string {
  if (!id) {
    return "—";
  }

  return storeStatuses.find((item) => item.id === id)?.statusName ?? id;
}

function getCountryName(
  countryCode: string | undefined,
  countries: CountryReference[],
): string {
  if (!countryCode) {
    return "—";
  }

  return (
    countries.find((country) => country.countryCode === countryCode)?.name ??
    countryCode
  );
}

function getPhoneValue(store: Store): string {
  const phone = store.phoneNumber;

  if (!phone?.number?.trim()) {
    return "—";
  }

  return `${phone.callingCode ?? ""} ${phone.number.trim()}`.trim();
}

function getAddressValue(store: Store, countries: CountryReference[]): string {
  const address = store.address;

  const country = getCountryName(address.countryCode, countries);

  const parts = [
    address.line1,
    address.line2,
    address.city,
    address.region,
    address.postalCode,
    country !== "—" ? country : undefined,
  ].filter((value) => value?.trim());

  return parts.length > 0 ? parts.join(", ") : "—";
}

function arePhonesEqual(
  first: Store["phoneNumber"],
  second: Store["phoneNumber"],
): boolean {
  return (
    first?.countryId === second?.countryId &&
    first?.callingCode === second?.callingCode &&
    first?.number === second?.number
  );
}

function areAddressesEqual(
  first: Store["address"],
  second: Store["address"],
): boolean {
  return (
    first.line1 === second.line1 &&
    first.line2 === second.line2 &&
    first.city === second.city &&
    first.region === second.region &&
    first.postalCode === second.postalCode &&
    first.countryCode === second.countryCode
  );
}

function buildDiffs(
  currentStores: Store[],
  proposedStores: Store[],
  storeTypes: ReferenceDataItem[],
  storeStatuses: Status[],
  countries: CountryReference[],
): DiffItem[] {
  const diffs: DiffItem[] = [];

  const currentById = new Map(currentStores.map((store) => [store.id, store]));

  const proposedById = new Map(
    proposedStores.map((store) => [store.id, store]),
  );

  /*
   * ------------------------------------------------------------------------
   * NEW STORES
   * ------------------------------------------------------------------------
   */

  for (const proposed of proposedStores) {
    if (!currentById.has(proposed.id)) {
      diffs.push({
        label: `New Store: ${display(proposed.name)}`,
        current: "Not configured",
        proposed: display(proposed.name),
      });
    }
  }

  /*
   * ------------------------------------------------------------------------
   * REMOVED STORES
   * ------------------------------------------------------------------------
   */

  for (const current of currentStores) {
    if (!proposedById.has(current.id)) {
      diffs.push({
        label: `Removed Store: ${display(current.name)}`,
        current: display(current.name),
        proposed: "Removed",
      });
    }
  }

  /*
   * ------------------------------------------------------------------------
   * MODIFIED STORES
   * ------------------------------------------------------------------------
   */

  for (const proposed of proposedStores) {
    const current = currentById.get(proposed.id);

    if (!current) {
      continue;
    }

    const storeLabel = display(proposed.name || current.name);

    if (current.storeCode !== proposed.storeCode) {
      diffs.push({
        label: `${storeLabel} — Store Code`,
        current: display(current.storeCode),
        proposed: display(proposed.storeCode),
      });
    }

    if (current.name !== proposed.name) {
      diffs.push({
        label: `${storeLabel} — Store Name`,
        current: display(current.name),
        proposed: display(proposed.name),
      });
    }

    if (current.storeTypeId !== proposed.storeTypeId) {
      diffs.push({
        label: `${storeLabel} — Store Type`,
        current: getStoreTypeName(current.storeTypeId, storeTypes),
        proposed: getStoreTypeName(proposed.storeTypeId, storeTypes),
      });
    }

    if (current.storeStatusId !== proposed.storeStatusId) {
      diffs.push({
        label: `${storeLabel} — Status`,
        current: getStoreStatusName(current.storeStatusId, storeStatuses),
        proposed: getStoreStatusName(proposed.storeStatusId, storeStatuses),
      });
    }

    if (!areAddressesEqual(current.address, proposed.address)) {
      diffs.push({
        label: `${storeLabel} — Address`,
        current: getAddressValue(current, countries),
        proposed: getAddressValue(proposed, countries),
      });
    }

    if (!arePhonesEqual(current.phoneNumber, proposed.phoneNumber)) {
      diffs.push({
        label: `${storeLabel} — Phone`,
        current: getPhoneValue(current),
        proposed: getPhoneValue(proposed),
      });
    }

    if (current.emailAddress !== proposed.emailAddress) {
      diffs.push({
        label: `${storeLabel} — Email`,
        current: display(current.emailAddress),
        proposed: display(proposed.emailAddress),
      });
    }

    if (current.timezone !== proposed.timezone) {
      diffs.push({
        label: `${storeLabel} — Timezone`,
        current: display(current.timezone),
        proposed: display(proposed.timezone),
      });
    }

    if (current.openingDate !== proposed.openingDate) {
      diffs.push({
        label: `${storeLabel} — Opening Date`,
        current: display(current.openingDate),
        proposed: display(proposed.openingDate),
      });
    }

    if (current.closingDate !== proposed.closingDate) {
      diffs.push({
        label: `${storeLabel} — Closing Date`,
        current: display(current.closingDate),
        proposed: display(proposed.closingDate),
      });
    }
  }

  return diffs;
}

/* -------------------------------------------------------------------------- */
/* CUSTOMER LOCATION VIEW                                                     */
/* -------------------------------------------------------------------------- */

function CustomerLocations({
  stores,
  mode,
  countries,
}: {
  stores: Store[];
  mode: "current" | "proposed";
  countries: CountryReference[];
}) {
  const theme = useTheme();

  return (
    <View style={styles.customerFrame}>
      <View style={styles.customerHeader}>
        <View style={styles.customerHeaderText}>
          <Text variant="h3" color="text">
            Locations
          </Text>

          <Text variant="bodySmall" color="textSecondary">
            Customer Profile → Locations
          </Text>
        </View>

        <Badge
          label={mode === "current" ? "CURRENT" : "PROPOSED"}
          tone={mode === "current" ? "neutral" : "brand"}
        />
      </View>

      {stores.length === 0 ? (
        <View
          style={[
            styles.emptyState,
            {
              backgroundColor: theme.colors.surfaceAlt,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Text variant="body" color="textSecondary">
            No locations are currently available.
          </Text>
        </View>
      ) : (
        <View style={styles.storeList}>
          {stores.map((store) => (
            <View
              key={store.id}
              style={[
                styles.storeCard,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surface,
                },
              ]}
            >
              <View style={styles.storeCardHeader}>
                <View style={styles.storeCardHeaderText}>
                  <Text variant="title" color="text">
                    {display(store.name)}
                  </Text>

                  {store.storeCode ? (
                    <Text variant="caption" color="textMuted">
                      {store.storeCode}
                    </Text>
                  ) : null}
                </View>
              </View>

              <Text variant="bodySmall" color="textSecondary">
                {getAddressValue(store, countries)}
              </Text>

              {getPhoneValue(store) !== "—" ? (
                <Text variant="bodySmall" color="textSecondary">
                  {getPhoneValue(store)}
                </Text>
              ) : null}

              {store.emailAddress ? (
                <Text variant="bodySmall" color="textSecondary">
                  {store.emailAddress}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* PREVIEW                                                                    */
/* -------------------------------------------------------------------------- */

export function StorePreview({
  currentStores,
  proposedStores,
  storeTypes,
  storeStatuses,
  countries,
}: StorePreviewProps) {
  const theme = useTheme();

  const current = currentStores.filter((store) => !store.isDeleted);
  const proposed = proposedStores.filter((store) => !store.isDeleted);

  const diffs = buildDiffs(
    current,
    proposed,
    storeTypes,
    storeStatuses,
    countries,
  );

  return (
    <Card padding="lg" elevation="sm">
      <Section
        title="Customer Preview"
        description="Compare how the current locations appear with the proposed locations after these changes."
      >
        <View style={styles.compareGrid}>
          <View style={styles.compareColumn}>
            <CustomerLocations
              stores={current}
              mode="current"
              countries={countries}
            />
          </View>

          <View style={styles.compareColumn}>
            <CustomerLocations
              stores={proposed}
              mode="proposed"
              countries={countries}
            />
          </View>
        </View>

        <View
          style={[
            styles.changesSection,
            {
              borderTopColor: theme.colors.border,
            },
          ]}
        >
          <View style={styles.changesHeader}>
            <Text variant="title" color="text">
              Changes in this update
            </Text>

            <Text variant="bodySmall" color="textSecondary">
              {diffs.length === 0
                ? "There are no changes."
                : `${diffs.length} ${
                    diffs.length === 1 ? "change" : "changes"
                  } detected.`}
            </Text>
          </View>

          {diffs.length === 0 ? (
            <View
              style={[
                styles.noChanges,
                {
                  backgroundColor: theme.colors.surfaceAlt,
                },
              ]}
            >
              <Text variant="body" color="textSecondary">
                No changes have been made.
              </Text>
            </View>
          ) : (
            <View style={styles.diffList}>
              {diffs.map((diff) => (
                <View
                  key={`${diff.label}-${diff.current}-${diff.proposed}`}
                  style={[
                    styles.diffRow,
                    {
                      borderColor: theme.colors.border,
                    },
                  ]}
                >
                  <Text variant="label" color="text">
                    {diff.label}
                  </Text>

                  <View style={styles.diffValues}>
                    <View style={styles.diffValue}>
                      <Text variant="caption" color="textMuted">
                        Current
                      </Text>

                      <Text variant="bodySmall" color="textSecondary">
                        {diff.current}
                      </Text>
                    </View>

                    <Text variant="body" color="textMuted">
                      →
                    </Text>

                    <View style={styles.diffValue}>
                      <Text variant="caption" color="textMuted">
                        Proposed
                      </Text>

                      <Text variant="bodySmall" color="text">
                        {diff.proposed}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </Section>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* STYLES                                                                     */
/* -------------------------------------------------------------------------- */

const styles = StyleSheet.create({
  compareGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    marginTop: 16,
  },

  compareColumn: {
    flex: 1,
    minWidth: 360,
  },

  customerFrame: {
    minHeight: 420,
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
    gap: 18,
  },

  customerHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },

  customerHeaderText: {
    flex: 1,
    gap: 3,
  },

  storeList: {
    gap: 12,
  },

  storeCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 6,
  },

  storeCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
  },

  storeCardHeaderText: {
    gap: 2,
  },

  emptyState: {
    minHeight: 120,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },

  changesSection: {
    marginTop: 24,
    paddingTop: 24,
    borderTopWidth: 1,
  },

  changesHeader: {
    gap: 3,
    marginBottom: 14,
  },

  noChanges: {
    minHeight: 80,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },

  diffList: {
    gap: 10,
  },

  diffRow: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },

  diffValues: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  diffValue: {
    flex: 1,
    gap: 3,
  },
});
