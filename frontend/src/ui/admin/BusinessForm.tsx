import { useEffect, useState } from "react";

import {
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";

import {
  CityReference,
  CountryReference,
  ID,
  Organization,
  OrganizationDetails,
  PhoneNumber,
  ReferenceDataItem,
  RegionReference,
  Status,
} from "@/src/core";

import { useTheme } from "@/src/providers";

import {
  AddressForm,
  Button,
  Card,
  Input,
  ReferenceSelect,
  Section,
  Text,
  TextArea,
} from "@/src/ui";

import { BusinessPreview } from "./BusinessPreview";

type BusinessFormProps = {
  organization: Organization;
  details: OrganizationDetails | null;

  countries: CountryReference[];
  regions: RegionReference[];
  cities: CityReference[];
  organizationTypes: ReferenceDataItem[];
  organizationStatuses: Status[];

  onCountryChange?: (countryCode: string) => void;
  onRegionChange?: (countryCode: string, regionCode: string) => void;

  onSave: (
    organization: Organization,
    details: OrganizationDetails,
  ) => Promise<void>;
};

const EMPTY_ADDRESS = {
  line1: "",
  line2: "",
  city: "",
  region: "",
  postalCode: "",
  countryCode: "CA",
};

const EMPTY_PHONE = (
  countryId = "country-ca",
  callingCode = "+1",
): PhoneNumber => ({
  countryId,
  callingCode,
  number: "",
});

function createEmptyDetails(
  organizationId: ID,
  createdBy: ID,
): OrganizationDetails {
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

type ValidationErrors = {
  name?: string;
  organizationTypeId?: string;
  primaryEmail?: string;
  primaryPhone?: string;
};

function validateEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function validatePhone(value: string): boolean {
  const digits = value.replace(/\D/g, "");

  return digits.length === 10;
}

export function BusinessForm({
  organization,
  details,
  countries,
  organizationTypes,
  organizationStatuses,
  regions,
  cities,
  onCountryChange,
  onRegionChange,
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

  const [touched, setTouched] = useState({
    name: false,
    organizationTypeId: false,
    primaryEmail: false,
    primaryPhone: false,
  });

  useEffect(() => {
    setForm(organization);

    setDetailForm(
      details ?? createEmptyDetails(organization.id, organization.updatedBy),
    );

    setTouched({
      name: false,
      organizationTypeId: false,
      primaryEmail: false,
      primaryPhone: false,
    });
  }, [organization, details]);

  const updateOrganization = <K extends keyof Organization>(
    field: K,
    value: Organization[K],
  ) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const updateDetails = <K extends keyof OrganizationDetails>(
    field: K,
    value: OrganizationDetails[K],
  ) => {
    setDetailForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const updatePhone = (
    field: "primaryPhone" | "supportPhone",
    phone: PhoneNumber,
  ) => {
    if (field === "primaryPhone") {
      setForm((current) => ({
        ...current,
        primaryPhone: phone,
      }));
    } else {
      setDetailForm((current) => ({
        ...current,
        supportPhone: phone,
      }));
    }
  };

  const errors: ValidationErrors = {
    name:
      touched.name && !form.name.trim()
        ? "Business name is required."
        : touched.name && form.name.trim().length < 2
          ? "Business name must contain at least 2 characters."
          : touched.name && form.name.trim().length > 200
            ? "Business name must not exceed 200 characters."
            : undefined,

    organizationTypeId:
      touched.organizationTypeId && !form.organizationTypeId
        ? "Business type is required."
        : undefined,

    primaryEmail:
      touched.primaryEmail && !form.primaryEmail.trim()
        ? "Primary email is required."
        : touched.primaryEmail && !validateEmail(form.primaryEmail)
          ? "Enter a valid email address."
          : undefined,

    primaryPhone:
      touched.primaryPhone && !form.primaryPhone.number.trim()
        ? "Primary phone number is required."
        : touched.primaryPhone && !validatePhone(form.primaryPhone.number)
          ? "Enter a 10-digit phone number."
          : undefined,
  };

  const validateBeforeSave = (): boolean => {
    const nextTouched = {
      name: true,
      organizationTypeId: true,
      primaryEmail: true,
      primaryPhone: true,
    };

    setTouched(nextTouched);

    return !(
      !form.name.trim() ||
      form.name.trim().length < 2 ||
      form.name.trim().length > 200 ||
      !form.organizationTypeId ||
      !form.primaryEmail.trim() ||
      !validateEmail(form.primaryEmail) ||
      !form.primaryPhone.number.trim() ||
      !validatePhone(form.primaryPhone.number)
    );
  };

  const save = async () => {
    if (!validateBeforeSave()) {
      return;
    }

    setSaving(true);

    try {
      await onSave(
        {
          ...form,

          name: form.name.trim(),

          displayName: form.displayName.trim() || form.name.trim(),

          legalName: form.legalName?.trim() || undefined,

          primaryEmail: form.primaryEmail.trim(),

          website: form.website?.trim() || undefined,

          primaryPhone: {
            ...form.primaryPhone,
            number: form.primaryPhone.number.trim(),
          },
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

          supportPhone: {
            ...detailForm.supportPhone,
            number: detailForm.supportPhone.number.trim(),
          },
        },
      );
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setForm(organization);

    setDetailForm(
      details ?? createEmptyDetails(organization.id, organization.updatedBy),
    );

    setTouched({
      name: false,
      organizationTypeId: false,
      primaryEmail: false,
      primaryPhone: false,
    });
  };

  const phoneField = (
    label: string,
    phone: PhoneNumber,
    onChange: (phone: PhoneNumber) => void,
    testID: string,
    required = false,
    error?: string,
  ) => {
    const selectedCountry = countries.find(
      (country) => country.id === phone.countryId,
    );

    return (
      <View style={styles.phoneFieldGroup}>
        <View style={[styles.phoneRow, compact && styles.phoneRowCompact]}>
          <View style={compact ? styles.fullWidth : styles.phoneCountry}>
            <ReferenceSelect
              label={`${label} — Country / ISD`}
              required={required}
              value={phone.countryId}
              items={countries}
              onChange={(countryId) => {
                const country = countries.find((item) => item.id === countryId);

                if (!country) {
                  return;
                }

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

                return `${countryFlag(country.countryCode)} ${
                  country.name
                } (${country.callingCode})`;
              }}
            />
          </View>

          <View style={compact ? styles.fullWidth : styles.phoneNumber}>
            <Input
              label={`${label} Number`}
              required={required}
              value={phone.number}
              onChangeText={(number) =>
                onChange({
                  ...phone,
                  number: number.replace(/\D/g, "").slice(0, 10),
                })
              }
              keyboardType="phone-pad"
              placeholder={
                selectedCountry
                  ? `${selectedCountry.callingCode} phone number`
                  : "Phone number"
              }
              maxLength={10}
              error={error}
              testID={`${testID}-number`}
            />
          </View>
        </View>
      </View>
    );
  };

  return (
    <ScrollView
      style={[
        styles.screen,
        {
          backgroundColor: theme.colors.background,
        },
      ]}
      contentContainerStyle={[
        styles.content,
        {
          padding: narrow ? theme.spacing.md : theme.spacing.xl,
        },
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {/* ------------------------------------------------------------------ */}
      {/* Page header                                                        */}
      {/* ------------------------------------------------------------------ */}

      <View
        style={[
          styles.pageHeader,
          {
            borderBottomColor: theme.colors.border,
          },
        ]}
      >
        <View style={styles.pageHeaderText}>
          <Text variant="h1" color="text">
            Business
          </Text>

          <Text variant="body" color="textSecondary">
            Manage your organization&apos;s identity, contact details and
            business information.
          </Text>
        </View>

        <View
          style={[
            styles.headerBadge,
            {
              backgroundColor: theme.colors.surfaceAlt,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Text variant="caption" color="textMuted">
            ORGANIZATION
          </Text>
        </View>
      </View>

      {/* ------------------------------------------------------------------ */}
      {/* Business information                                               */}
      {/* ------------------------------------------------------------------ */}

      <Card
        padding={narrow ? "md" : "lg"}
        elevation="sm"
        style={[
          styles.sectionCard,
          {
            borderColor: theme.colors.border,
          },
        ]}
      >
        <Section
          title="Business Information"
          description="Core information used throughout the Memgine platform and customer experience."
        >
          <View style={styles.formBlock}>
            <View style={styles.grid}>
              <View style={compact ? styles.fullWidth : styles.halfWidth}>
                <Input
                  label="Business Name"
                  required
                  value={form.name}
                  onChangeText={(value) => updateOrganization("name", value)}
                  onBlur={() =>
                    setTouched((current) => ({
                      ...current,
                      name: true,
                    }))
                  }
                  placeholder="Enter business name"
                  maxLength={200}
                  error={errors.name}
                />
              </View>

              <View style={compact ? styles.fullWidth : styles.halfWidth}>
                <Input
                  label="Display Name"
                  value={form.displayName}
                  onChangeText={(value) =>
                    updateOrganization("displayName", value)
                  }
                  placeholder="Customer-facing business name"
                  maxLength={100}
                />
              </View>

              <View style={compact ? styles.fullWidth : styles.halfWidth}>
                <Input
                  label="Legal Name"
                  value={form.legalName ?? ""}
                  onChangeText={(value) =>
                    updateOrganization("legalName", value)
                  }
                  placeholder="Legal business name"
                  maxLength={250}
                />
              </View>

              <View style={compact ? styles.fullWidth : styles.halfWidth}>
                <ReferenceSelect
                  label="Business Type"
                  required
                  value={form.organizationTypeId}
                  items={organizationTypes}
                  onChange={() => undefined}
                  placeholder="Select business type"
                  disabled
                  error={errors.organizationTypeId}
                />
              </View>

              <View style={compact ? styles.fullWidth : styles.halfWidth}>
                <Input
                  label="Primary Email"
                  required
                  value={form.primaryEmail}
                  onChangeText={(value) =>
                    updateOrganization("primaryEmail", value)
                  }
                  onBlur={() =>
                    setTouched((current) => ({
                      ...current,
                      primaryEmail: true,
                    }))
                  }
                  keyboardType="email-address"
                  placeholder="business@example.com"
                  maxLength={254}
                  error={errors.primaryEmail}
                />
              </View>

              <View style={compact ? styles.fullWidth : styles.halfWidth}>
                <ReferenceSelect
                  label="Status"
                  value={form.organizationStatusId}
                  items={organizationStatuses}
                  onChange={() => undefined}
                  placeholder="Select status"
                  disabled
                />
              </View>

              <View style={styles.fullWidth}>
                {phoneField(
                  "Primary Phone",
                  form.primaryPhone,
                  (phone) => updatePhone("primaryPhone", phone),
                  "business-primary-phone",
                  true,
                  errors.primaryPhone,
                )}
              </View>

              <View style={styles.fullWidth}>
                <Input
                  label="Website"
                  value={form.website ?? ""}
                  onChangeText={(value) => updateOrganization("website", value)}
                  keyboardType="url"
                  placeholder="https://example.com"
                  maxLength={300}
                />
              </View>
            </View>
          </View>
        </Section>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Business details                                                   */}
      {/* ------------------------------------------------------------------ */}

      <Card
        padding={narrow ? "md" : "lg"}
        elevation="sm"
        style={[
          styles.sectionCard,
          {
            borderColor: theme.colors.border,
          },
        ]}
      >
        <Section
          title="Business Details"
          description="Additional business, support and location information."
        >
          <View style={styles.formBlock}>
            <View style={styles.grid}>
              <View style={compact ? styles.fullWidth : styles.halfWidth}>
                <Input
                  label="Registration Number"
                  value={detailForm.registrationNumber}
                  onChangeText={(value) =>
                    updateDetails("registrationNumber", value)
                  }
                  placeholder="Registration number"
                  maxLength={50}
                />
              </View>

              <View style={compact ? styles.fullWidth : styles.halfWidth}>
                <Input
                  label="GST / Tax Number"
                  value={detailForm.gstNumber}
                  onChangeText={(value) => updateDetails("gstNumber", value)}
                  placeholder="GST / tax number"
                  maxLength={20}
                />
              </View>

              <View style={compact ? styles.fullWidth : styles.halfWidth}>
                <Input
                  label="Support Email"
                  value={detailForm.supportEmail}
                  onChangeText={(value) => updateDetails("supportEmail", value)}
                  keyboardType="email-address"
                  placeholder="support@example.com"
                  maxLength={150}
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
          </View>

          <View style={styles.subSection}>
            <View
              style={[
                styles.subSectionHeader,
                {
                  borderBottomColor: theme.colors.border,
                },
              ]}
            >
              <Text variant="h2" color="text">
                Business Address
              </Text>

              <Text variant="bodySmall" color="textSecondary">
                Primary location for this organization.
              </Text>
            </View>

            <AddressForm
              value={detailForm.address}
              countries={countries}
              regions={regions}
              cities={cities}
              onChange={(address) =>
                setDetailForm((current) => ({
                  ...current,
                  address,
                }))
              }
              onCountryChange={onCountryChange}
              onRegionChange={onRegionChange}
            />
          </View>

          <View style={styles.subSection}>
            <View
              style={[
                styles.subSectionHeader,
                {
                  borderBottomColor: theme.colors.border,
                },
              ]}
            >
              <Text variant="h2" color="text">
                About the Organization
              </Text>

              <Text variant="bodySmall" color="textSecondary">
                Customer-facing description of the business.
              </Text>
            </View>

            <TextArea
              label="About Organization"
              value={detailForm.aboutOrganization}
              onChangeText={(value) =>
                updateDetails("aboutOrganization", value)
              }
              placeholder="Tell customers about your business"
              maxLength={1000}
            />
          </View>
        </Section>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Customer experience preview                                        */}
      {/* ------------------------------------------------------------------ */}

      <View style={styles.previewSection}>
        <View style={styles.previewHeader}>
          <View style={styles.previewHeaderText}>
            <Text variant="h2" color="text">
              Customer Experience Preview
            </Text>

            <Text variant="bodySmall" color="textSecondary">
              See how the current organization information appears in the
              customer-facing experience.
            </Text>
          </View>
        </View>

        <BusinessPreview
          currentOrganization={organization}
          currentDetails={details}
          proposedOrganization={form}
          proposedDetails={detailForm}
          organizationTypes={organizationTypes}
          organizationStatuses={organizationStatuses}
          countries={countries}
        />
      </View>

      {/* ------------------------------------------------------------------ */}
      {/* Actions                                                            */}
      {/* ------------------------------------------------------------------ */}

      <View
        style={[
          styles.actionsContainer,
          {
            backgroundColor: theme.colors.card,
            borderColor: theme.colors.border,
          },
        ]}
      >
        <View style={styles.actionText}>
          <Text variant="bodyStrong" color="text">
            Ready to save?
          </Text>

          <Text variant="caption" color="textSecondary">
            Your changes will be applied to this organization.
          </Text>
        </View>

        <View style={[styles.actions, compact && styles.actionsCompact]}>
          <Button
            label="Cancel"
            variant="outline"
            disabled={saving}
            onPress={resetForm}
            fullWidth={compact}
          />

          <Button
            label={saving ? "Saving..." : "Save Changes"}
            onPress={save}
            disabled={saving}
            fullWidth={compact}
          />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },

  content: {
    width: "100%",
    maxWidth: 1120,
    alignSelf: "center",
    gap: 20,
    paddingBottom: 40,
  },

  pageHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
  },

  pageHeaderText: {
    flex: 1,
    gap: 6,
  },

  headerBadge: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },

  sectionCard: {
    borderWidth: 1,
  },

  formBlock: {
    gap: 20,
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

  phoneFieldGroup: {
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

  subSection: {
    gap: 16,
    marginTop: 8,
  },

  subSectionHeader: {
    gap: 4,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },

  previewSection: {
    gap: 14,
  },

  previewHeader: {
    paddingHorizontal: 2,
  },

  previewHeaderText: {
    gap: 4,
  },

  actionsContainer: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 20,
  },

  actionText: {
    flex: 1,
    gap: 3,
  },

  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },

  actionsCompact: {
    flexDirection: "column-reverse",
    width: "100%",
  },
});
