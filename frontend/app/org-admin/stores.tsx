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

export default function OrgAdminStores() {
  const router = useRouter();
  const { organization } = useBusiness();

  const [stores, setStores] = useState<Store[]>([]);
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

        setStores(storeList);
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
      visibleStores.filter(
        (store) => store.storeStatusId === "store-status-active",
      ).length,
    [visibleStores],
  );

  const getStoreTypeName = (id: string) =>
    storeTypes.find((item) => item.id === id)?.name ?? "Unknown";

  const getStoreStatusName = (id: string) =>
    storeStatuses.find((item) => item.id === id)?.statusName ?? "Unknown";

  /* ---------------------------------------------------------------------- */
  /* NEW STORE                                                              */
  /* ---------------------------------------------------------------------- */

  const createEmptyStore = (): Store => {
    const now = new Date().toISOString();

    return {
      id: `store-${Date.now()}`,
      organizationId: organization.id,

      /*
       * Store Code is intentionally blank.
       *
       * The organization administrator enters it manually.
       * StoreForm validates it as mandatory.
       */
      storeCode: "",

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
       * New stores are Active by default.
       * The administrator can change the status in StoreForm.
       */
      storeStatusId: "store-status-active",

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
  /* SAVE STORE                                                             */
  /* ---------------------------------------------------------------------- */

  const handleSave = async (store: Store) => {
    try {
      const existing = stores.some((item) => item.id === store.id);

      if (existing) {
        const updated = await services.organization.updateStore(
          organization.id,
          store,
        );

        setStores((current) =>
          current.map((item) => (item.id === updated.id ? updated : item)),
        );
      } else {
        const created = await services.organization.createStore(
          organization.id,
          store,
        );

        setStores((current) => [...current, created]);
      }

      setFormVisible(false);
      setEditingStore(null);
      setRegions([]);
      setCities([]);

      Alert.alert(
        "Store saved",
        existing ? "The store has been updated." : "The store has been added.",
      );
    } catch (error) {
      Alert.alert(
        "Unable to save store",
        error instanceof Error ? error.message : "Unable to save the store.",
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
    router.push(
      APP_ROUTES.orgAdmin.customerExperienceSection("stores") as never,
    );
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
