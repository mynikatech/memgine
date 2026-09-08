import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";

import type {
  CountryReference,
  CreateUserInput,
  ID,
  ReferenceDataItem,
  Status,
  Store,
  User,
} from "@/src/core";

import { Input, PhoneField, ReferenceSelect, Text } from "@/src/ui";

export type CustomerFormSubmitResult = {
  user: CreateUserInput;
  userId?: ID;
  sourceStoreId?: string;
};

type CustomerFormProps = {
  organizationId: string;
  stores: Store[];
  countries: CountryReference[];
  userStatuses: Status[];
  activeUserStatusId: string;
  mode?: "add" | "edit";
  initialUser?: User;
  initialSourceStoreId?: string;
  onSave: (result: CustomerFormSubmitResult) => Promise<void>;
  onCancel: () => void;
};

type CustomerDraft = {
  firstName: string;
  middleName: string;
  lastName: string;
  displayName: string;
  primaryEmail: string;
  primaryPhone:
    | {
        countryId: string;
        callingCode: string;
        number: string;
      }
    | undefined;
  userStatusId: string;
  sourceStoreId: string;
};

function createDefaultPhone(
  countries: CountryReference[],
): CustomerDraft["primaryPhone"] {
  const country =
    countries.find((item) => item.countryCode?.trim().toUpperCase() === "CA") ??
    countries[0];

  if (!country) {
    return undefined;
  }

  return {
    countryId: country.id,
    callingCode: country.callingCode ?? "",
    number: "",
  };
}

function createDraft(
  countries: CountryReference[],
  activeUserStatusId: string,
  initialUser?: User,
  initialSourceStoreId?: string,
): CustomerDraft {
  return {
    firstName: initialUser?.firstName ?? "",
    middleName: initialUser?.middleName ?? "",
    lastName: initialUser?.lastName ?? "",
    displayName: initialUser?.displayName ?? "",
    primaryEmail: initialUser?.primaryEmail ?? "",
    primaryPhone: initialUser
      ? {
          countryId: initialUser.primaryPhone.countryId,
          callingCode: initialUser.primaryPhone.callingCode ?? "",
          number: initialUser.primaryPhone.number ?? "",
        }
      : createDefaultPhone(countries),
    userStatusId: initialUser?.userStatusId ?? activeUserStatusId,
    sourceStoreId: initialSourceStoreId ?? "",
  };
}

export function CustomerForm({
  organizationId: _organizationId,
  stores,
  countries,
  userStatuses,
  activeUserStatusId,
  mode = "add",
  initialUser,
  initialSourceStoreId,
  onSave,
  onCancel,
}: CustomerFormProps) {
  const [draft, setDraft] = useState<CustomerDraft>(() =>
    createDraft(
      countries,
      activeUserStatusId,
      initialUser,
      initialSourceStoreId,
    ),
  );

  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(
      createDraft(
        countries,
        activeUserStatusId,
        initialUser,
        initialSourceStoreId,
      ),
    );
    setValidationError(null);
  }, [
    activeUserStatusId,
    countries,
    initialSourceStoreId,
    initialUser?.id,
    mode,
  ]);

  const storeItems = useMemo<ReferenceDataItem[]>(
    () =>
      stores
        .filter((store) => !store.isDeleted)
        .map((store) => ({
          id: store.id,
          code: store.storeCode,
          name: store.name,
          displayOrder: 0,
          active: true,
        })),
    [stores],
  );

  const update = <K extends keyof CustomerDraft>(
    field: K,
    value: CustomerDraft[K],
  ) => {
    setDraft((current) => ({
      ...current,
      [field]: value,
    }));

    if (validationError) {
      setValidationError(null);
    }
  };

  const validate = (): string | null => {
    const firstName = draft.firstName.trim();
    const lastName = draft.lastName.trim();

    if (!firstName) {
      return "First Name is required.";
    }

    if (!lastName) {
      return "Last Name is required.";
    }

    if (!draft.primaryPhone) {
      return "Primary Phone Number is required.";
    }

    const phoneDigits = draft.primaryPhone.number.replace(/\D/g, "");

    if (!phoneDigits) {
      return "Primary Phone Number is required.";
    }

    if (phoneDigits.length !== 10) {
      return "Primary Phone Number must contain 10 digits.";
    }

    const email = draft.primaryEmail.trim();

    if (email) {
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (!emailPattern.test(email)) {
        return "Please enter a valid email address.";
      }
    }

    return null;
  };

  const handleSave = async () => {
    const error = validate();

    if (error) {
      setValidationError(error);
      Alert.alert("Invalid Customer", error);
      return;
    }

    if (!draft.primaryPhone) {
      return;
    }

    setSaving(true);
    setValidationError(null);

    try {
      const firstName = draft.firstName.trim();
      const lastName = draft.lastName.trim();

      const displayName =
        draft.displayName.trim() || `${firstName} ${lastName}`.trim();

      const user: CreateUserInput = {
        firstName,
        middleName: draft.middleName.trim() || undefined,
        lastName,
        displayName,
        primaryEmail: draft.primaryEmail.trim().toLowerCase() || undefined,
        primaryPhone: {
          countryId: draft.primaryPhone.countryId,
          callingCode: draft.primaryPhone.callingCode,
          number: draft.primaryPhone.number.replace(/\D/g, ""),
        },
        userStatusId:
          mode === "edit" && initialUser
            ? draft.userStatusId
            : activeUserStatusId,
        createdBy: initialUser?.createdBy ?? "user-system",
      };

      await onSave({
        user,
        userId: initialUser?.id,
        sourceStoreId:
          mode === "edit"
            ? initialSourceStoreId || undefined
            : draft.sourceStoreId || undefined,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to add prospective customer.";

      setValidationError(message);

      Alert.alert("Unable to add prospective customer", message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.form}>
      <View style={styles.intro}>
        <Text variant="title" color="text">
          {mode === "edit"
            ? "Edit Prospective Customer"
            : "Add Customer Prospective"}
        </Text>

        <Text variant="bodySmall" color="textMuted">
          {mode === "edit"
            ? "Update the prospective customer's information. Changes are staged until you select Save Changes."
            : "Add a prospective customer who can later purchase a membership, receive promotions and offers, or become an active customer."}
        </Text>
      </View>

      {validationError ? (
        <View style={styles.validationBox}>
          <Text variant="bodySmall" color="danger">
            {validationError}
          </Text>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text variant="bodyStrong" color="text">
          Customer Information
        </Text>

        <Input
          label="First Name"
          required
          value={draft.firstName}
          onChangeText={(value) => update("firstName", value)}
          placeholder="e.g. John"
          autoCapitalize="words"
          autoCorrect={false}
          maxLength={100}
          error={
            validationError === "First Name is required."
              ? validationError
              : undefined
          }
        />

        <Input
          label="Middle Name"
          value={draft.middleName}
          onChangeText={(value) => update("middleName", value)}
          placeholder="e.g. Michael"
          autoCapitalize="words"
          autoCorrect={false}
          maxLength={100}
        />

        <Input
          label="Last Name"
          required
          value={draft.lastName}
          onChangeText={(value) => update("lastName", value)}
          placeholder="e.g. Smith"
          autoCapitalize="words"
          autoCorrect={false}
          maxLength={100}
          error={
            validationError === "Last Name is required."
              ? validationError
              : undefined
          }
        />

        <Input
          label="Display Name"
          value={draft.displayName}
          onChangeText={(value) => update("displayName", value)}
          placeholder="e.g. John Smith"
          maxLength={150}
        />

        <Input
          label="Primary Email"
          value={draft.primaryEmail}
          onChangeText={(value) => update("primaryEmail", value)}
          placeholder="e.g. john@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={254}
          error={
            validationError === "Please enter a valid email address."
              ? validationError
              : undefined
          }
        />

        {draft.primaryPhone ? (
          <PhoneField
            label="Primary Phone Number"
            required
            value={draft.primaryPhone}
            countries={countries}
            maxDigits={10}
            onChange={(value) => update("primaryPhone", value)}
          />
        ) : (
          <Text variant="bodySmall" color="danger">
            No country reference data is available for the phone number.
          </Text>
        )}

        <ReferenceSelect
          label="User Status"
          required
          value={draft.userStatusId}
          items={userStatuses}
          disabled={mode === "add"}
          placeholder="Select status"
          renderItemLabel={(status) => status.statusName}
          onChange={(value) => update("userStatusId", value)}
        />
      </View>

      <View style={styles.section}>
        <Text variant="bodyStrong" color="text">
          Acquisition
        </Text>

        <ReferenceSelect
          label="Source Store"
          value={draft.sourceStoreId}
          items={storeItems}
          allowClear={mode === "add"}
          disabled={mode === "edit"}
          placeholder="Select source store"
          onChange={(value) => update("sourceStoreId", value)}
        />

        <View style={styles.infoBox}>
          <Text variant="caption" color="textMuted">
            Source: Org Admin
          </Text>

          <Text variant="caption" color="textMuted">
            Channel: Admin UI
          </Text>

          <Text variant="caption" color="textMuted">
            User Type: Customer
          </Text>

          <Text variant="caption" color="textMuted">
            Membership: Not yet purchased
          </Text>

          {mode === "edit" ? (
            <Text variant="caption" color="textMuted">
              Acquisition information is read-only.
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={onCancel}
          disabled={saving}
          style={({ pressed }) => [
            styles.secondaryButton,
            {
              opacity: pressed || saving ? 0.7 : 1,
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
          style={({ pressed }) => [
            styles.primaryButton,
            {
              opacity: pressed || saving ? 0.7 : 1,
            },
          ]}
        >
          <Text variant="body" color="background">
            {saving
              ? mode === "edit"
                ? "Saving..."
                : "Adding..."
              : mode === "edit"
                ? "Save Customer"
                : "Add Prospect"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: 24,
  },

  intro: {
    gap: 6,
  },

  section: {
    gap: 16,
  },

  validationBox: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FCA5A5",
    backgroundColor: "#FEF2F2",
  },

  infoBox: {
    padding: 12,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    gap: 4,
    backgroundColor: "#F9FAFB",
  },

  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 8,
  },

  primaryButton: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0F766E",
  },

  secondaryButton: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#D1D5DB",
  },
});
