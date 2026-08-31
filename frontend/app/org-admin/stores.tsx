import { useEffect, useMemo, useState } from "react";

import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { useRouter } from "expo-router";

import type {
  CityReference,
  CountryReference,
  ReferenceDataItem,
  RegionReference,
  Status,
  Store,
} from "@/src/core";

import { services } from "@/src/core";

import { APP_ROUTES } from "@/src/constants/navigation";
import { useBusiness } from "@/src/providers";

import { Screen } from "@/src/layout";

import { DataTable, Modal, StateView, Text } from "@/src/ui";

import { StoreForm } from "@/src/ui/admin/StoreForm";

type StoreWorkingSession = {
  organizationId: string;
  currentStores: Store[];
  proposedStores: Store[];
};

let storeWorkingSession: StoreWorkingSession | null = null;

function cloneStores(stores: Store[]): Store[] {
  return stores.map((store) => ({
    ...store,
    address: { ...store.address },
    phoneNumber: store.phoneNumber ? { ...store.phoneNumber } : undefined,
  }));
}

export default function OrgAdminStores() {
  const router = useRouter();
  const { organization } = useBusiness();

  // Working state shown in the Stores table / StoreForm.
  const [stores, setStores] = useState<Store[]>([]);

  // Committed baseline used for Current vs Proposed preview.
  // This changes only after the main-page "Save Changes" action.
  const [committedStores, setCommittedStores] = useState<Store[]>([]);

  const [storeTypes, setStoreTypes] = useState<ReferenceDataItem[]>([]);
  const [storeStatuses, setStoreStatuses] = useState<Status[]>([]);

  const [countries, setCountries] = useState<CountryReference[]>([]);
  const [regions, setRegions] = useState<RegionReference[]>([]);
  const [cities, setCities] = useState<CityReference[]>([]);

  const [loading, setLoading] = useState(true);

  const [formVisible, setFormVisible] = useState(false);
  const [editingStore, setEditingStore] = useState<Store | null>(null);

  /* ---------------------------------------------------------------------- */
  /* LOAD                                                                   */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);

      try {
        const [storeList, typeList, statusList, countryList] =
          await Promise.all([
            services.organization.listStores(organization.id),
            services.referenceData.listStoreTypes(),
            services.status.listStoreStatuses(),
            services.referenceData.listCountries(),
          ]);

        if (!mounted) {
          return;
        }

        /*
         * Do not reinitialize the working state when this route remounts.
         *
         * This happens when the administrator:
         *   1. adds Store 1,
         *   2. opens Preview,
         *   3. presses Back.
         *
         * Expo Router can remount this screen. The organization service still
         * contains only committed data because "Save Store" is intentionally
         * session-only. Therefore the working Proposed state must survive the
         * route transition.
         */
        if (
          storeWorkingSession === null ||
          storeWorkingSession.organizationId !== organization.id
        ) {
          const baseline = cloneStores(storeList);

          storeWorkingSession = {
            organizationId: organization.id,
            currentStores: cloneStores(baseline),
            proposedStores: cloneStores(baseline),
          };
        }

        setStores(cloneStores(storeWorkingSession.proposedStores));
        setCommittedStores(cloneStores(storeWorkingSession.currentStores));
        setStoreTypes(typeList);
        setStoreStatuses(statusList);
        setCountries(countryList);
      } catch (error) {
        if (!mounted) {
          return;
        }

        Alert.alert(
          "Unable to load stores",
          error instanceof Error ? error.message : "Unable to load stores.",
        );
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      mounted = false;
    };
  }, [organization.id]);

  /* ---------------------------------------------------------------------- */
  /* ADDRESS REFERENCE DATA                                                 */
  /* ---------------------------------------------------------------------- */

  const handleCountryChange = async (countryCode: string) => {
    try {
      const regionList = await services.referenceData.listRegions(countryCode);

      setRegions(regionList);
      setCities([]);
    } catch (error) {
      Alert.alert(
        "Unable to load regions",
        error instanceof Error ? error.message : "Unable to load regions.",
      );
    }
  };

  const handleRegionChange = async (
    countryCode: string,
    regionCode: string,
  ) => {
    try {
      const cityList = await services.referenceData.listCities(
        countryCode,
        regionCode,
      );

      setCities(cityList);
    } catch (error) {
      Alert.alert(
        "Unable to load cities",
        error instanceof Error ? error.message : "Unable to load cities.",
      );
    }
  };

  /* ---------------------------------------------------------------------- */
  /* DERIVED DATA                                                           */
  /* ---------------------------------------------------------------------- */

  const visibleStores = useMemo(
    () => stores.filter((store) => !store.isDeleted),
    [stores],
  );

  const activeStoreCount = useMemo(
    () =>
      visibleStores.filter((store) => {
        const status = storeStatuses.find(
          (item) => item.id === store.storeStatusId,
        );

        return status?.statusName?.trim().toLowerCase() === "active";
      }).length,
    [visibleStores, storeStatuses],
  );

  const getStoreTypeName = (id: string) =>
    storeTypes.find((item) => item.id === id)?.name ?? "Unknown";

  const getStoreStatusName = (id: string) =>
    storeStatuses.find((item) => item.id === id)?.statusName ?? "Unknown";

  /* ---------------------------------------------------------------------- */
  /* NEW STORE                                                              */
  /* ---------------------------------------------------------------------- */

  const generateStoreCode = (): string => {
    const prefix = "STORE";
    const usedCodes = new Set(
      visibleStores.map((store) => store.storeCode.trim().toUpperCase()),
    );

    let sequence = 1;

    while (usedCodes.has(`${prefix}-${String(sequence).padStart(3, "0")}`)) {
      sequence += 1;
    }

    return `${prefix}-${String(sequence).padStart(3, "0")}`;
  };

  const createEmptyStore = (): Store => {
    const now = new Date().toISOString();

    return {
      id: `store-${Date.now()}`,
      organizationId: organization.id,

      /*
       * Store Code is generated by the Stores screen and persisted with
       * the Store. It is intentionally read-only in StoreForm.
       */
      storeCode: generateStoreCode(),

      name: "",
      storeTypeId: "",

      phoneNumber: undefined,
      emailAddress: undefined,

      address: {
        line1: "",
        line2: undefined,
        city: "",
        region: "",
        postalCode: "",
        countryCode: "",
      },

      timezone: "America/Toronto",

      /*
       * New stores are always Active. StoreForm locks this field on Add.
       */
      storeStatusId:
        storeStatuses.find(
          (status) => status.statusName?.trim().toLowerCase() === "active",
        )?.id ?? "store-status-active",

      openingDate: undefined,
      closingDate: undefined,

      createdAt: now,
      createdBy: organization.updatedBy,

      updatedAt: now,
      updatedBy: organization.updatedBy,

      isDeleted: false,
      versionNo: 1,
    };
  };

  const handleAdd = () => {
    setEditingStore(createEmptyStore());

    setRegions([]);
    setCities([]);

    setFormVisible(true);
  };

  /* ---------------------------------------------------------------------- */
  /* EDIT STORE                                                             */
  /* ---------------------------------------------------------------------- */

  const handleEdit = async (store: Store) => {
    setEditingStore(store);

    const countryCode = store.address.countryCode;
    const regionCode = store.address.region;

    if (!countryCode) {
      setRegions([]);
      setCities([]);
      setFormVisible(true);
      return;
    }

    try {
      const regionList = await services.referenceData.listRegions(countryCode);

      setRegions(regionList);

      if (regionCode) {
        const cityList = await services.referenceData.listCities(
          countryCode,
          regionCode,
        );

        setCities(cityList);
      } else {
        setCities([]);
      }
    } catch (error) {
      Alert.alert(
        "Unable to load address data",
        error instanceof Error ? error.message : "Unable to load address data.",
      );

      setRegions([]);
      setCities([]);
    }

    setFormVisible(true);
  };

  /* ---------------------------------------------------------------------- */
  /* SAVE STORE TO WORKING SESSION                                          */
  /* ---------------------------------------------------------------------- */

  const handleSave = async (store: Store) => {
    /*
     * Save Store means "save this form into the working Proposed state".
     * It deliberately does NOT call the organization persistence service.
     */
    const existing = stores.some((item) => item.id === store.id);

    setStores((current) => {
      const nextStores = existing
        ? current.map((item) => (item.id === store.id ? store : item))
        : [...current, store];

      if (storeWorkingSession) {
        storeWorkingSession = {
          ...storeWorkingSession,
          proposedStores: cloneStores(nextStores),
        };
      }

      return nextStores;
    });

    setFormVisible(false);
    setEditingStore(null);
    setRegions([]);
    setCities([]);

    Alert.alert(
      existing ? "Store updated" : "Store added",
      existing
        ? "The Store has been updated in the working changes. Click Save Changes when you are ready to commit."
        : "The Store has been added to the working changes. Click Save Changes when you are ready to commit.",
    );
  };

  /* ---------------------------------------------------------------------- */
  /* COMMIT WORKING SESSION                                                 */
  /* ---------------------------------------------------------------------- */

  const hasPendingChanges = useMemo(
    () =>
      JSON.stringify(committedStores) !== JSON.stringify(cloneStores(stores)),
    [committedStores, stores],
  );

  const handleSaveChanges = async () => {
    const currentById = new Map(
      committedStores.map((store) => [store.id, store]),
    );
    const proposedById = new Map(stores.map((store) => [store.id, store]));

    const addedStores = stores.filter(
      (store) => !currentById.has(store.id) && !store.isDeleted,
    );

    const updatedStores = stores.filter((store) => {
      const current = currentById.get(store.id);
      if (!current || store.isDeleted) {
        return false;
      }

      return JSON.stringify(current) !== JSON.stringify(store);
    });

    const removedStores = committedStores.filter(
      (store) => !proposedById.has(store.id),
    );

    if (
      addedStores.length === 0 &&
      updatedStores.length === 0 &&
      removedStores.length === 0
    ) {
      Alert.alert("No changes", "There are no Store changes to save.");
      return;
    }

    /*
     * The current Store service contract exposes create/update but no delete
     * operation. Do not pretend a deletion was persisted.
     */
    if (removedStores.length > 0) {
      Alert.alert(
        "Unable to save changes",
        "Store deletion is not supported by the current organization service. Please restore the removed Store before committing.",
      );
      return;
    }

    try {
      const persistedStores = new Map(currentById);

      for (const store of addedStores) {
        const created = await services.organization.createStore(
          organization.id,
          store,
        );
        persistedStores.set(created.id, created);
      }

      for (const store of updatedStores) {
        const updated = await services.organization.updateStore(
          organization.id,
          store,
        );
        persistedStores.set(updated.id, updated);
      }

      const committed = Array.from(persistedStores.values());

      const committedSnapshot = cloneStores(committed);

      setStores(cloneStores(committedSnapshot));
      setCommittedStores(cloneStores(committedSnapshot));

      storeWorkingSession = {
        organizationId: organization.id,
        currentStores: cloneStores(committedSnapshot),
        proposedStores: cloneStores(committedSnapshot),
      };

      Alert.alert(
        "Changes saved",
        "All Store changes have been committed successfully.",
      );
    } catch (error) {
      Alert.alert(
        "Unable to save changes",
        error instanceof Error
          ? error.message
          : "Unable to commit the Store changes.",
      );
    }
  };

  /* ---------------------------------------------------------------------- */
  /* CLOSE FORM                                                             */
  /* ---------------------------------------------------------------------- */

  const handleCloseForm = () => {
    setFormVisible(false);
    setEditingStore(null);
    setRegions([]);
    setCities([]);
  };

  /* ---------------------------------------------------------------------- */
  /* CUSTOMER EXPERIENCE PREVIEW                                            */
  /* ---------------------------------------------------------------------- */

  const handlePreviewCustomerExperience = () => {
    /*
     * IMPORTANT:
     *
     * Stores are part of the customer's Profile / Locations experience.
     *
     * Therefore this must remain the section-specific preview route.
     *
     * The section preview itself is responsible for showing:
     *
     *       CURRENT          PROPOSED
     *       ─────────         ─────────
     *       Profile          Profile
     *       Locations        Locations
     *
     * It should NOT open the complete customer experience containing
     * Membership, Benefits, Offers, Activity, etc.
     */
    router.push({
      pathname: APP_ROUTES.orgAdmin.customerExperienceSection(
        "stores",
      ) as never,
      params: {
        currentStores: JSON.stringify(committedStores),
        proposedStores: JSON.stringify(stores),
      },
    });
  };

  /* ---------------------------------------------------------------------- */
  /* LOADING                                                                */
  /* ---------------------------------------------------------------------- */

  if (loading) {
    return (
      <Screen edges={["top"]}>
        <StateView
          kind="loading"
          title="Loading stores"
          message="Loading organization stores..."
        />
      </Screen>
    );
  }

  /* ---------------------------------------------------------------------- */
  /* RENDER                                                                 */
  /* ---------------------------------------------------------------------- */

  return (
    <Screen edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.page}
        showsVerticalScrollIndicator={false}
      >
        {/* ================================================================ */}
        {/* PAGE HEADER                                                       */}
        {/* ================================================================ */}

        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text variant="h2" color="text">
              Stores
            </Text>

            <Text variant="bodySmall" color="textMuted">
              Manage the physical locations operated by this organization.
            </Text>
          </View>

          <View style={styles.headerActions}>
            <Pressable
              onPress={() => void handleSaveChanges()}
              disabled={!hasPendingChanges}
              style={({ pressed }) => [
                styles.saveChangesButton,
                {
                  opacity: !hasPendingChanges ? 0.45 : pressed ? 0.78 : 1,
                },
              ]}
            >
              <Text variant="body" color="background">
                Save Changes
              </Text>
            </Pressable>

            <Pressable
              onPress={handleAdd}
              style={({ pressed }) => [
                styles.addButton,
                {
                  opacity: pressed ? 0.78 : 1,
                },
              ]}
            >
              <Text variant="body" color="background">
                + Add Store
              </Text>
            </Pressable>
          </View>
        </View>

        {/* ================================================================ */}
        {/* SUMMARY                                                           */}
        {/* ================================================================ */}

        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text variant="caption" color="textMuted">
              LOCATIONS
            </Text>

            <Text variant="h2" color="text">
              {visibleStores.length}
            </Text>

            <Text variant="bodySmall" color="textMuted">
              Customer-facing locations
            </Text>
          </View>

          <View style={styles.summaryCard}>
            <Text variant="caption" color="textMuted">
              ACTIVE
            </Text>

            <Text variant="h2" color="text">
              {activeStoreCount}
            </Text>

            <Text variant="bodySmall" color="textMuted">
              Currently operating
            </Text>
          </View>
        </View>

        {hasPendingChanges ? (
          <View style={styles.pendingChangesBanner}>
            <Text variant="bodySmall" color="text">
              You have unsaved Store changes.
            </Text>
            <Text variant="caption" color="textMuted">
              Save individual stores as you work, then use Save Changes when you
              are ready to commit the complete session.
            </Text>
          </View>
        ) : null}

        {/* ================================================================ */}
        {/* STORE LOCATIONS                                                   */}
        {/* ================================================================ */}

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeaderText}>
              <Text variant="title" color="text">
                Store Locations
              </Text>

              <Text variant="bodySmall" color="textMuted">
                Locations available to customers through Profile → Locations.
              </Text>
            </View>
          </View>

          {/* -------------------------------------------------------------- */}
          {/* CUSTOMER PREVIEW                                               */}
          {/* -------------------------------------------------------------- */}

          <Pressable
            onPress={handlePreviewCustomerExperience}
            accessibilityRole="link"
            style={({ pressed }) => [
              styles.previewLink,
              {
                opacity: pressed ? 0.65 : 1,
              },
            ]}
          >
            <Text variant="body" color="primary" style={styles.previewLinkText}>
              Preview Customer Experience →
            </Text>
          </Pressable>

          {/* -------------------------------------------------------------- */}
          {/* TABLE                                                          */}
          {/* -------------------------------------------------------------- */}

          <DataTable
            columns={[
              {
                key: "storeCode",
                title: "Store Code",
                width: 140,
              },
              {
                key: "name",
                title: "Store Name",
                width: 240,
              },
              {
                key: "storeTypeId",
                title: "Type",
                width: 160,
                render: (item: Store) => (
                  <Text variant="body" color="text">
                    {getStoreTypeName(item.storeTypeId)}
                  </Text>
                ),
              },
              {
                key: "address.city",
                title: "City",
                width: 140,
                render: (item: Store) => (
                  <Text variant="body" color="text">
                    {item.address.city || "—"}
                  </Text>
                ),
              },
              {
                key: "storeStatusId",
                title: "Status",
                width: 120,
                render: (item: Store) => (
                  <Text variant="body" color="text">
                    {getStoreStatusName(item.storeStatusId)}
                  </Text>
                ),
              },
            ]}
            data={visibleStores}
            keyExtractor={(item) => item.id}
            emptyMessage="No stores configured."
            actions={[
              {
                label: "Edit",
                onPress: handleEdit,
              },
            ]}
          />
        </View>
      </ScrollView>

      {/* ================================================================ */}
      {/* STORE FORM                                                        */}
      {/* ================================================================ */}

      <Modal
        visible={formVisible}
        onClose={handleCloseForm}
        title={
          editingStore && stores.some((item) => item.id === editingStore.id)
            ? "Edit Store"
            : "Add Store"
        }
        scrollable
        testID="store-form-modal"
      >
        {editingStore ? (
          <StoreForm
            store={editingStore}
            isNew={!stores.some((item) => item.id === editingStore.id)}
            storeTypes={storeTypes}
            storeStatuses={storeStatuses}
            countries={countries}
            regions={regions}
            cities={cities}
            onCountryChange={handleCountryChange}
            onRegionChange={handleRegionChange}
            onSave={handleSave}
            onCancel={handleCloseForm}
          />
        ) : null}
      </Modal>
    </Screen>
  );
}

/* ========================================================================== */
/* STYLES                                                                     */
/* ========================================================================== */

const styles = StyleSheet.create({
  page: {
    padding: 24,
    gap: 24,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },

  headerText: {
    flex: 1,
    gap: 5,
  },

  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  saveChangesButton: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0F766E",
  },

  addButton: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0F766E",
  },

  summaryRow: {
    flexDirection: "row",
    gap: 16,
  },

  summaryCard: {
    flex: 1,
    minHeight: 116,
    padding: 18,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    gap: 3,
  },

  pendingChangesBanner: {
    padding: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    gap: 3,
  },

  sectionCard: {
    padding: 18,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    gap: 16,
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
  },

  sectionHeaderText: {
    flex: 1,
    gap: 4,
  },

  previewLink: {
    alignSelf: "flex-start",
    minHeight: 32,
    justifyContent: "center",
  },

  previewLinkText: {
    fontWeight: "600",
    textDecorationLine: "underline",
  },
});
