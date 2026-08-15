import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";

import {
  CityReference,
  CountryReference,
  InMemoryOrganizationService,
  InMemoryReferenceDataService,
  ReferenceDataItem,
  RegionReference,
  Store,
} from "@/src/core";

import { useBusiness } from "@/src/providers";
import { DataTable, DataTableColumn, Modal, Text } from "@/src/ui";

import { StoreForm } from "@/src/ui/admin/StoreForm";

const organizationService = new InMemoryOrganizationService();

const referenceDataService = new InMemoryReferenceDataService();

export default function OrgAdminStores() {
  const { organization } = useBusiness();

  const [stores, setStores] = useState<Store[]>([]);
  const [storeTypes, setStoreTypes] = useState<ReferenceDataItem[]>([]);
  const [storeStatuses, setStoreStatuses] = useState<ReferenceDataItem[]>([]);
  const [countries, setCountries] = useState<CountryReference[]>([]);
  const [regions, setRegions] = useState<RegionReference[]>([]);
  const [cities, setCities] = useState<CityReference[]>([]);

  const [loading, setLoading] = useState(true);
  const [formVisible, setFormVisible] = useState(false);
  const [editingStore, setEditingStore] = useState<Store | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);

      try {
        const [storeList, typeList, statusList, countryList] =
          await Promise.all([
            organizationService.listStores(organization.id),
            referenceDataService.listStoreTypes(),
            referenceDataService.listStoreStatuses(),
            referenceDataService.listCountries(),
          ]);

        if (!mounted) {
          return;
        }

        setStores(storeList);
        setStoreTypes(typeList);
        setStoreStatuses(statusList);
        setCountries(countryList);
      } catch (error) {
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

    load();

    return () => {
      mounted = false;
    };
  }, [organization.id]);

  /**
   * Address reference-data dependencies
   *
   * Country -> Regions
   * Region -> Cities
   */
  const handleCountryChange = async (countryCode: string) => {
    try {
      const regionList = await referenceDataService.listRegions(countryCode);

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
      const cityList = await referenceDataService.listCities(
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

  const getStoreTypeName = (id: string) =>
    storeTypes.find((item) => item.id === id)?.name ?? "Unknown";

  const getStoreStatusName = (id: string) =>
    storeStatuses.find((item) => item.id === id)?.name ?? "Unknown";

  const columns = useMemo<DataTableColumn<Store>[]>(
    () => [
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
        render: (item) => (
          <Text variant="body" color="text">
            {getStoreTypeName(item.storeTypeId)}
          </Text>
        ),
      },
      {
        key: "address.city",
        title: "City",
        width: 140,
        render: (item) => (
          <Text variant="body" color="text">
            {item.address.city || "—"}
          </Text>
        ),
      },
      {
        key: "storeStatusId",
        title: "Status",
        width: 120,
        render: (item) => (
          <Text variant="body" color="text">
            {getStoreStatusName(item.storeStatusId)}
          </Text>
        ),
      },
    ],
    [storeTypes, storeStatuses],
  );

  const createEmptyStore = (): Store => {
    const now = new Date().toISOString();

    return {
      id: `store-${Date.now()}`,
      organizationId: organization.id,

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

      storeStatusId: "store-status-active",

      openingDate: undefined,
      closingDate: undefined,

      createdAt: now,
      createdBy: "user-system",
      updatedAt: now,
      updatedBy: "user-system",

      isDeleted: false,
      versionNo: 1,
    };
  };

  const handleAdd = () => {
    setEditingStore(createEmptyStore());

    /*
     * New store has no country selected,
     * therefore no regions/cities should
     * be displayed initially.
     */
    setRegions([]);
    setCities([]);

    setFormVisible(true);
  };

  const handleEdit = async (store: Store) => {
    setEditingStore(store);

    /*
     * Load dependent reference data for
     * the existing address before opening
     * the edit form.
     */
    if (store.address.countryCode) {
      try {
        const regionList = await referenceDataService.listRegions(
          store.address.countryCode,
        );

        setRegions(regionList);

        if (store.address.region) {
          const cityList = await referenceDataService.listCities(
            store.address.countryCode,
            store.address.region,
          );

          setCities(cityList);
        } else {
          setCities([]);
        }
      } catch (error) {
        Alert.alert(
          "Unable to load address data",
          error instanceof Error
            ? error.message
            : "Unable to load address data.",
        );

        setRegions([]);
        setCities([]);
      }
    } else {
      setRegions([]);
      setCities([]);
    }

    setFormVisible(true);
  };

  const handleSave = async (store: Store) => {
    try {
      const existing = stores.some((item) => item.id === store.id);

      if (existing) {
        const updated = await organizationService.updateStore(
          organization.id,
          store,
        );

        setStores((current) =>
          current.map((item) => (item.id === updated.id ? updated : item)),
        );
      } else {
        const created = await organizationService.createStore(
          organization.id,
          store,
        );

        setStores((current) => [...current, created]);
      }

      setFormVisible(false);
      setEditingStore(null);
      setRegions([]);
      setCities([]);
    } catch (error) {
      Alert.alert(
        "Unable to save store",
        error instanceof Error ? error.message : "Unable to save the store.",
      );
    }
  };

  const handleCloseForm = () => {
    setFormVisible(false);
    setEditingStore(null);
    setRegions([]);
    setCities([]);
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.screen}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text variant="title" color="text">
            Stores
          </Text>

          <Text variant="bodySmall" color="textMuted">
            Manage the locations operated by this organization.
          </Text>
        </View>

        <Pressable
          onPress={handleAdd}
          style={({ pressed }) => [
            styles.addButton,
            {
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
          <Text variant="body" color="background">
            + Add Store
          </Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <Text variant="body" color="textMuted">
            Loading stores...
          </Text>
        </View>
      ) : (
        <DataTable
          columns={columns}
          data={stores}
          keyExtractor={(item) => item.id}
          emptyMessage="No stores configured."
          actions={[
            {
              label: "Edit",
              onPress: handleEdit,
            },
          ]}
        />
      )}

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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },

  screen: {
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
    gap: 4,
  },

  addButton: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0F766E",
  },

  center: {
    minHeight: 160,
    alignItems: "center",
    justifyContent: "center",
  },
});
