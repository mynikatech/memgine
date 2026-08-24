import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import type {
  CountryReference,
  CityReference,
  RegionReference,
  ReferenceDataItem,
  Status,
  Store,
} from "@/src/core";
import { useTheme } from "@/src/providers";

import { Input } from "../Input";
import { ReferenceSelect } from "../ReferenceSelect";
import { Text } from "../Text";
import { AddressForm } from "@/src/ui/AddressForm";

type StoreFormProps = {
  store: Store;
  storeTypes: ReferenceDataItem[];
  storeStatuses: Status[];
  countries: CountryReference[];
  regions: RegionReference[];
  cities: CityReference[];
  onCountryChange: (countryCode: string) => void;
  onRegionChange: (countryCode: string, regionCode: string) => void;
  onSave: (store: Store) => Promise<void>;
  onCancel: () => void;
};

export function StoreForm({
  store,
  storeTypes,
  storeStatuses,
  countries,
  regions,
  cities,
  onCountryChange,
  onRegionChange,
  onSave,
  onCancel,
}: StoreFormProps) {
  const theme = useTheme();

  const [form, setForm] = useState<Store>(store);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(store);
  }, [store]);

  const update = <K extends keyof Store>(field: K, value: Store[K]) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleSave = async () => {
    setSaving(true);

    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Store Information */}
      <View style={styles.section}>
        <Text variant="title" color="text">
          Store Information
        </Text>

        <View style={styles.grid}>
          <View style={styles.field}>
            <Input
              label="Store Code"
              value={form.storeCode}
              placeholder="e.g. MAIN-001"
              onChangeText={(value) => update("storeCode", value)}
            />
          </View>

          <View style={styles.field}>
            <ReferenceSelect
              label="Store Type"
              value={form.storeTypeId}
              items={storeTypes}
              placeholder="Please select"
              onChange={(value) => update("storeTypeId", value)}
            />
          </View>

          <View style={styles.fullWidth}>
            <Input
              label="Store Name"
              value={form.name}
              placeholder="Enter store name"
              onChangeText={(value) => update("name", value)}
            />
          </View>

          <View style={styles.field}>
            <ReferenceSelect
              label="Store Status"
              value={form.storeStatusId}
              items={storeStatuses}
              placeholder="Please select"
              onChange={(value) => update("storeStatusId", value)}
            />
          </View>
        </View>
      </View>

      {/* Contact Information */}
      <View style={styles.section}>
        <Text variant="title" color="text">
          Contact Information
        </Text>

        <View style={styles.grid}>
          <View style={styles.field}>
            <Input
              label="Phone Number"
              value={form.phoneNumber ?? ""}
              placeholder="+1 416 555 0100"
              onChangeText={(value) =>
                update("phoneNumber", value || undefined)
              }
            />
          </View>

          <View style={styles.field}>
            <Input
              label="Email Address"
              value={form.emailAddress ?? ""}
              placeholder="store@example.com"
              onChangeText={(value) =>
                update("emailAddress", value || undefined)
              }
            />
          </View>
        </View>
      </View>

      {/* Address */}
      <AddressForm
        value={form.address}
        countries={countries}
        regions={regions}
        cities={cities}
        onChange={(address) =>
          setForm((current) => ({
            ...current,
            address,
          }))
        }
        onCountryChange={onCountryChange}
        onRegionChange={onRegionChange}
      />

      {/* Operations */}
      <View style={styles.section}>
        <Text variant="title" color="text">
          Operations
        </Text>

        <View style={styles.grid}>
          <View style={styles.field}>
            <Input
              label="Timezone"
              value={form.timezone}
              placeholder="e.g. America/Toronto"
              onChangeText={(value) => update("timezone", value)}
            />
          </View>

          <View style={styles.field}>
            <Input
              label="Opening Date"
              value={form.openingDate ?? ""}
              placeholder="YYYY-MM-DD"
              onChangeText={(value) =>
                update("openingDate", value || undefined)
              }
            />
          </View>

          <View style={styles.field}>
            <Input
              label="Closing Date"
              value={form.closingDate ?? ""}
              placeholder="YYYY-MM-DD"
              onChangeText={(value) =>
                update("closingDate", value || undefined)
              }
            />
          </View>
        </View>
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <Pressable
          onPress={onCancel}
          disabled={saving}
          style={[
            styles.button,
            {
              backgroundColor: theme.colors.surfaceAlt,
              opacity: saving ? theme.states.disabledOpacity : 1,
            },
          ]}
        >
          <Text variant="body" color="text">
            Cancel
          </Text>
        </Pressable>

        <Pressable
          onPress={handleSave}
          disabled={saving}
          style={[
            styles.button,
            {
              backgroundColor: theme.colors.primary,
              opacity: saving ? theme.states.disabledOpacity : 1,
            },
          ]}
        >
          <Text variant="body" color="background">
            {saving ? "Saving..." : "Save"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 24,
  },

  section: {
    gap: 16,
  },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
  },

  field: {
    width: "48%",
  },

  fullWidth: {
    width: "100%",
  },

  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    paddingTop: 8,
  },

  button: {
    minHeight: 44,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
});
