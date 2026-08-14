import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";

import {
  Address,
  CountryReference,
  ID,
  Organization,
  OrganizationDetails,
  PhoneNumber,
  ReferenceDataItem,
} from "@/src/core";
import { useTheme } from "@/src/providers";
import { Button, Card, Input, ReferenceSelect, Section, Text, TextArea } from "@/src/ui";

type BusinessFormProps = {
  organization: Organization;
  details: OrganizationDetails | null;
  countries: CountryReference[];
  organizationTypes: ReferenceDataItem[];
  organizationStatuses: ReferenceDataItem[];
  onSave: (
    organization: Organization,
    details: OrganizationDetails,
  ) => Promise<void>;
};

const EMPTY_ADDRESS: Address = {
  line1: "",
  line2: "",
  city: "",
  region: "",
  postalCode: "",
  countryCode: "CA",
};

const EMPTY_PHONE = (countryId = "country-ca", callingCode = "+1"): PhoneNumber => ({
  countryId,
  callingCode,
  number: "",
});

function createEmptyDetails(organizationId: ID, createdBy: ID): OrganizationDetails {
  const now = new Date().toISOString();
  return {
    id: `details-${organizationId}`,
    organizationId,
    registrationNumber: "",
    gstNumber: "",
    supportEmail: "",
    supportPhone: EMPTY_PHONE(),
    aboutOrganization: "",
    address: EMPTY_ADDRESS,
    createdAt: now,
    createdBy,
    updatedAt: now,
    updatedBy: createdBy,
    isDeleted: false,
    versionNo: 1,
  };
}

function countryFlag(countryCode: string): string {
  return countryCode
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(char.charCodeAt(0) + 127397));
}

export function BusinessForm({
  organization,
  details,
  countries,
  organizationTypes,
  organizationStatuses,
  onSave,
}: BusinessFormProps) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const compact = width < 760;
  const narrow = width < 520;

  const [form, setForm] = useState<Organization>(organization);
  const [detailForm, setDetailForm] = useState<OrganizationDetails>(
    details ?? createEmptyDetails(organization.id, organization.updatedBy),
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(organization);
    setDetailForm(
      details ?? createEmptyDetails(organization.id, organization.updatedBy),
    );
  }, [organization, details]);

  const updateOrganization = <K extends keyof Organization>(
    field: K,
    value: Organization[K],
  ) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const updateDetails = <K extends keyof OrganizationDetails>(
    field: K,
    value: OrganizationDetails[K],
  ) => {
    setDetailForm((current) => ({ ...current, [field]: value }));
  };

  const updatePhone = (
    field: "primaryPhone" | "supportPhone",
    phone: PhoneNumber,
  ) => {
    if (field === "primaryPhone") {
      setForm((current) => ({ ...current, primaryPhone: phone }));
    } else {
      setDetailForm((current) => ({ ...current, supportPhone: phone }));
    }
  };

  const updateAddress = <K extends keyof Address>(field: K, value: Address[K]) => {
    setDetailForm((current) => ({
      ...current,
      address: { ...current.address, [field]: value },
    }));
  };

  const countryForPhone = (phone: PhoneNumber) =>
    countries.find((country) => country.id === phone.countryId);

  const countryForAddress = countries.find(
    (country) => country.countryCode === detailForm.address.countryCode,
  );

  const save = async () => {
    setSaving(true);
    try {
      await onSave(
        {
          ...form,
          name: form.name.trim(),
          displayName: form.displayName.trim(),
          legalName: form.legalName?.trim() || undefined,
          primaryEmail: form.primaryEmail.trim(),
          website: form.website?.trim() || undefined,
        },
        {
          ...detailForm,
          registrationNumber: detailForm.registrationNumber.trim(),
          gstNumber: detailForm.gstNumber.trim(),
          supportEmail: detailForm.supportEmail.trim(),
          aboutOrganization: detailForm.aboutOrganization.trim(),
          address: {
            ...detailForm.address,
            line1: detailForm.address.line1.trim(),
            line2: detailForm.address.line2?.trim() || undefined,
            city: detailForm.address.city.trim(),
            region: detailForm.address.region?.trim() || undefined,
            postalCode: detailForm.address.postalCode?.trim() || undefined,
          },
        },
      );
    } finally {
      setSaving(false);
    }
  };

  const phoneField = (
    label: string,
    phone: PhoneNumber,
    onChange: (phone: PhoneNumber) => void,
    testID: string,
  ) => {
    const selectedCountry = countryForPhone(phone);
    return (
      <View style={[styles.phoneRow, compact && styles.phoneRowCompact]}>
        <View style={compact ? styles.fullWidth : styles.phoneCountry}>
          <ReferenceSelect
            label={`${label} — Country / ISD`}
            value={phone.countryId}
            items={countries}
            onChange={(countryId) => {
              const country = countries.find((item) => item.id === countryId);
              if (!country) return;
              onChange({
                ...phone,
                countryId: country.id,
                callingCode: country.callingCode,
              });
            }}
            placeholder="Select country"
            testID={`${testID}-country`}
            renderItemLabel={(item) => {
              const country = item as CountryReference;
              return `${countryFlag(country.countryCode)} ${country.name} (${country.callingCode})`;
            }}
          />
        </View>
        <View style={compact ? styles.fullWidth : styles.phoneNumber}>
          <Input
            label={`${label} Number`}
            value={phone.number}
            onChangeText={(number) => onChange({ ...phone, number })}
            keyboardType="phone-pad"
            placeholder={selectedCountry ? `${selectedCountry.callingCode} phone number` : "Phone number"}
            testID={`${testID}-number`}
          />
        </View>
      </View>
    );
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { padding: narrow ? theme.spacing.md : theme.spacing.xl },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="h1" color="text">
          Business
        </Text>
        <Text variant="bodySmall" color="textSecondary">
          Manage your organization&apos;s business information and contact details.
        </Text>
      </View>

      <Card padding={narrow ? "md" : "lg"} elevation="sm">
        <Section title="Business Information">
          <View style={styles.grid}>
            <View style={compact ? styles.fullWidth : styles.halfWidth}>
              <Input
                label="Business Name"
                value={form.name}
                onChangeText={(value) => updateOrganization("name", value)}
                placeholder="Enter business name"
              />
            </View>
            <View style={compact ? styles.fullWidth : styles.halfWidth}>
              <Input
                label="Display Name"
                value={form.displayName}
                onChangeText={(value) => updateOrganization("displayName", value)}
                placeholder="Customer-facing business name"
              />
            </View>
            <View style={compact ? styles.fullWidth : styles.halfWidth}>
              <Input
                label="Legal Name"
                value={form.legalName ?? ""}
                onChangeText={(value) => updateOrganization("legalName", value)}
                placeholder="Legal business name"
              />
            </View>
            <View style={compact ? styles.fullWidth : styles.halfWidth}>
              <ReferenceSelect
                label="Business Type"
                value={form.organizationTypeId}
                items={organizationTypes}
                onChange={(value) => updateOrganization("organizationTypeId", value)}
                placeholder="Select business type"
              />
            </View>
            <View style={compact ? styles.fullWidth : styles.halfWidth}>
              <Input
                label="Primary Email"
                value={form.primaryEmail}
                onChangeText={(value) => updateOrganization("primaryEmail", value)}
                keyboardType="email-address"
                placeholder="business@example.com"
              />
            </View>
            <View style={compact ? styles.fullWidth : styles.halfWidth}>
              <ReferenceSelect
                label="Status"
                value={form.organizationStatusId}
                items={organizationStatuses}
                onChange={(value) => updateOrganization("organizationStatusId", value)}
                placeholder="Select status"
              />
            </View>
            <View style={styles.fullWidth}>
              {phoneField(
                "Primary Phone",
                form.primaryPhone,
                (phone) => updatePhone("primaryPhone", phone),
                "business-primary-phone",
              )}
            </View>
            <View style={styles.fullWidth}>
              <Input
                label="Website"
                value={form.website ?? ""}
                onChangeText={(value) => updateOrganization("website", value)}
                keyboardType="url"
                placeholder="https://example.com"
              />
            </View>
          </View>
        </Section>
      </Card>

      <Card padding={narrow ? "md" : "lg"} elevation="sm">
        <Section title="Business Details">
          <View style={styles.grid}>
            <View style={compact ? styles.fullWidth : styles.halfWidth}>
              <Input
                label="Registration Number"
                value={detailForm.registrationNumber}
                onChangeText={(value) => updateDetails("registrationNumber", value)}
                placeholder="Registration number"
              />
            </View>
            <View style={compact ? styles.fullWidth : styles.halfWidth}>
              <Input
                label="GST / Tax Number"
                value={detailForm.gstNumber}
                onChangeText={(value) => updateDetails("gstNumber", value)}
                placeholder="GST / tax number"
              />
            </View>
            <View style={compact ? styles.fullWidth : styles.halfWidth}>
              <Input
                label="Support Email"
                value={detailForm.supportEmail}
                onChangeText={(value) => updateDetails("supportEmail", value)}
                keyboardType="email-address"
                placeholder="support@example.com"
              />
            </View>
            <View style={styles.fullWidth}>
              {phoneField(
                "Support Phone",
                detailForm.supportPhone,
                (phone) => updatePhone("supportPhone", phone),
                "business-support-phone",
              )}
            </View>
          </View>

          <View style={{ gap: theme.spacing.md }}>
            <Text variant="label" color="textSecondary">
              Address
            </Text>

            <View style={styles.grid}>
              <View style={styles.fullWidth}>
                <Input
                  label="Address Line 1"
                  value={detailForm.address.line1}
                  onChangeText={(value) => updateAddress("line1", value)}
                  placeholder="Street address"
                />
              </View>
              <View style={styles.fullWidth}>
                <Input
                  label="Address Line 2"
                  value={detailForm.address.line2 ?? ""}
                  onChangeText={(value) => updateAddress("line2", value)}
                  placeholder="Suite, unit, floor, etc."
                />
              </View>
              <View style={compact ? styles.fullWidth : styles.halfWidth}>
                <Input
                  label="City"
                  value={detailForm.address.city}
                  onChangeText={(value) => updateAddress("city", value)}
                  placeholder="Toronto"
                />
              </View>
              <View style={compact ? styles.fullWidth : styles.halfWidth}>
                <Input
                  label="State / Province"
                  value={detailForm.address.region ?? ""}
                  onChangeText={(value) => updateAddress("region", value)}
                  placeholder="Ontario"
                />
              </View>
              <View style={compact ? styles.fullWidth : styles.halfWidth}>
                <Input
                  label="Postal / ZIP Code"
                  value={detailForm.address.postalCode ?? ""}
                  onChangeText={(value) => updateAddress("postalCode", value)}
                  placeholder="M5V 1A1"
                />
              </View>
              <View style={compact ? styles.fullWidth : styles.halfWidth}>
                <ReferenceSelect
                  label="Country"
                  value={countryForAddress?.id ?? ""}
                  items={countries}
                  onChange={(countryId) => {
                    const country = countries.find((item) => item.id === countryId);
                    if (country) updateAddress("countryCode", country.countryCode);
                  }}
                  placeholder="Select country"
                  renderItemLabel={(item) => {
                    const country = item as CountryReference;
                    return `${countryFlag(country.countryCode)} ${country.name}`;
                  }}
                />
              </View>
            </View>
          </View>

          <TextArea
            label="About Organization"
            value={detailForm.aboutOrganization}
            onChangeText={(value) => updateDetails("aboutOrganization", value)}
            placeholder="Tell customers about your business"
          />
        </Section>
      </Card>

      <View
        style={[
          styles.actions,
          compact && styles.actionsCompact,
          { borderTopColor: theme.colors.border },
        ]}
      >
        <Button
          label="Cancel"
          variant="outline"
          disabled={saving}
          onPress={() => {
            setForm(organization);
            setDetailForm(
              details ?? createEmptyDetails(organization.id, organization.updatedBy),
            );
          }}
          fullWidth={compact}
        />
        <Button
          label={saving ? "Saving..." : "Save Changes"}
          onPress={save}
          disabled={saving}
          fullWidth={compact}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: 1000,
    alignSelf: "center",
    gap: 16,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
  },
  halfWidth: {
    flexGrow: 1,
    flexBasis: 320,
  },
  fullWidth: {
    width: "100%",
  },
  phoneRow: {
    flexDirection: "row",
    gap: 16,
  },
  phoneRowCompact: {
    flexDirection: "column",
  },
  phoneCountry: {
    width: 300,
  },
  phoneNumber: {
    flex: 1,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    paddingTop: 16,
    borderTopWidth: 1,
  },
  actionsCompact: {
    flexDirection: "column-reverse",
  },
});
