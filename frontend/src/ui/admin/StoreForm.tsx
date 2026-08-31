import { useEffect, useState } from "react";

import { Pressable, StyleSheet, View } from "react-native";

import type {
  CityReference,
  CountryReference,
  ReferenceDataItem,
  RegionReference,
  Status,
  Store,
} from "@/src/core";

import { useTheme } from "@/src/providers";

import {
  AddressForm,
  Card,
  Input,
  ReferenceSelect,
  Section,
  Text,
} from "@/src/ui";

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

type ValidationErrors = {
  name?: string;
  storeTypeId?: string;
  storeStatusId?: string;
  timezone?: string;

  addressLine1?: string;
  countryCode?: string;
  region?: string;
  city?: string;

  emailAddress?: string;
};

function validateEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

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
  const [errors, setErrors] = useState<ValidationErrors>({});

  useEffect(() => {
    setForm(store);
    setErrors({});
  }, [store]);

  const update = <K extends keyof Store>(field: K, value: Store[K]) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));

    setErrors((current) => ({
      ...current,
      [field]: undefined,
    }));
  };

  const updateAddress = (address: Store["address"]) => {
    setForm((current) => ({
      ...current,
      address,
    }));

    setErrors((current) => ({
      ...current,
      addressLine1: undefined,
      countryCode: undefined,
      region: undefined,
      city: undefined,
    }));
  };

  const validate = (): boolean => {
    const nextErrors: ValidationErrors = {};

    if (!form.name.trim()) {
      nextErrors.name = "Store name is required.";
    }

    if (!form.storeTypeId) {
      nextErrors.storeTypeId = "Store type is required.";
    }

    if (!form.storeStatusId) {
      nextErrors.storeStatusId = "Store status is required.";
    }

    if (!form.timezone.trim()) {
      nextErrors.timezone = "Timezone is required.";
    }

    if (!form.address.line1.trim()) {
      nextErrors.addressLine1 = "Address Line 1 is required.";
    }

    if (!form.address.countryCode) {
      nextErrors.countryCode = "Country is required.";
    }

    if (!form.address.region?.trim()) {
      nextErrors.region = "State / Province is required.";
    }

    if (!form.address.city.trim()) {
      nextErrors.city = "City is required.";
    }

    if (form.emailAddress?.trim() && !validateEmail(form.emailAddress)) {
      nextErrors.emailAddress = "Please enter a valid email address.";
    }

    setErrors(nextErrors);

    return Object.keys(nextErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) {
      return;
    }

    setSaving(true);

    try {
      await onSave({
        ...form,

        name: form.name.trim(),

        timezone: form.timezone.trim(),

        phoneNumber: form.phoneNumber?.trim() || undefined,

        emailAddress: form.emailAddress?.trim() || undefined,

        address: {
          ...form.address,

          line1: form.address.line1.trim(),

          line2: form.address.line2?.trim() || undefined,

          city: form.address.city.trim(),

          region: form.address.region?.trim() || "",

          postalCode: form.address.postalCode?.trim() || undefined,
        },

        openingDate: form.openingDate?.trim() || undefined,

        closingDate: form.closingDate?.trim() || undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Store Information */}

      <Card padding="lg">
        <Section
          title="Store Information"
          description="Basic information about this customer-facing location."
        >
          <View style={styles.grid}>
            <View style={styles.fullWidth}>
              <Input
                label="Store Code"
                value={form.storeCode}
                editable={false}
                placeholder="Generated automatically"
                onChangeText={() => undefined}
              />

              <Text
                variant="caption"
                color="textMuted"
                style={styles.helperText}
              >
                Store codes are generated automatically and cannot be changed.
              </Text>
            </View>

            <View style={styles.field}>
              <Input
                label="Store Name"
                required
                value={form.name}
                placeholder="e.g. Toronto Mall"
                error={errors.name}
                onChangeText={(value) => update("name", value)}
              />
            </View>

            <View style={styles.field}>
              <ReferenceSelect
                label="Store Type"
                required
                value={form.storeTypeId}
                items={storeTypes}
                placeholder="Please select"
                error={errors.storeTypeId}
                onChange={(value) => update("storeTypeId", value)}
              />
            </View>

            <View style={styles.field}>
              <ReferenceSelect
                label="Store Status"
                required
                value={form.storeStatusId}
                items={storeStatuses}
                placeholder="Please select"
                error={errors.storeStatusId}
                onChange={(value) => update("storeStatusId", value)}
              />
            </View>
          </View>
        </Section>
      </Card>

      {/* Contact */}

      <Card padding="lg">
        <Section
          title="Contact Information"
          description="Optional contact details for this location."
        >
          <View style={styles.grid}>
            <View style={styles.field}>
              <Input
                label="Phone Number"
                value={form.phoneNumber ?? ""}
                placeholder="+1 416 555 0100"
                keyboardType="phone-pad"
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
                error={errors.emailAddress}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={(value) =>
                  update("emailAddress", value || undefined)
                }
              />
            </View>
          </View>
        </Section>
      </Card>

      {/* Address */}

      <Card padding="lg">
        <Section
          title="Store Address"
          description="This address is shown to customers in Profile → Locations."
        >
          <AddressForm
            value={form.address}
            countries={countries}
            regions={regions}
            cities={cities}
            requiredLine1
            requiredCountry
            requiredRegion
            requiredCity
            errors={{
              line1: errors.addressLine1,
              countryCode: errors.countryCode,
              region: errors.region,
              city: errors.city,
            }}
            onChange={updateAddress}
            onCountryChange={onCountryChange}
            onRegionChange={onRegionChange}
          />
        </Section>
      </Card>

      {/* Operations */}

      <Card padding="lg">
        <Section
          title="Operations"
          description="Operating information for this store."
        >
          <View style={styles.grid}>
            <View style={styles.field}>
              <Input
                label="Timezone"
                required
                value={form.timezone}
                placeholder="e.g. America/Toronto"
                error={errors.timezone}
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
        </Section>
      </Card>

      {/* Actions */}

      <View style={styles.actions}>
        <Pressable
          onPress={onCancel}
          disabled={saving}
          style={({ pressed }) => ({
            ...styles.cancelButton,
            backgroundColor: theme.colors.surfaceAlt,
            opacity: saving
              ? theme.states.disabledOpacity
              : pressed
                ? theme.states.pressedOpacity
                : 1,
          })}
        >
          <Text variant="body" color="text">
            Cancel
          </Text>
        </Pressable>

        <Pressable
          onPress={handleSave}
          disabled={saving}
          style={({ pressed }) => ({
            ...styles.saveButton,
            backgroundColor: theme.colors.primary,
            opacity: saving
              ? theme.states.disabledOpacity
              : pressed
                ? theme.states.pressedOpacity
                : 1,
          })}
        >
          <Text variant="body" color="background">
            {saving ? "Saving..." : "Save Store"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 20,
  },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
  },

  field: {
    width: "48%",
    minWidth: 260,
  },

  fullWidth: {
    width: "100%",
  },

  helperText: {
    marginTop: 6,
  },

  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 12,
    paddingTop: 4,
  },

  cancelButton: {
    minHeight: 44,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },

  saveButton: {
    minHeight: 44,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
});
