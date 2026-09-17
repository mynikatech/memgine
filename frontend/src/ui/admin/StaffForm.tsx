import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import type {
  CountryReference,
  PhoneNumber,
  ReferenceDataItem,
  Status,
  Staff,
  Store,
  User,
} from "@/src/core";

import { DEFAULT_ROLE_CAPABILITIES, StaffRole } from "@/src/core";

import { useTheme } from "@/src/providers";

import { DateInput, Input, PhoneField, ReferenceSelect, Text } from "@/src/ui";

export type StaffPersonInput = {
  firstName: string;
  middleName?: string;
  lastName: string;
  displayName?: string;
  primaryEmail?: string;
  primaryPhone: PhoneNumber;
  preferredLanguageId?: string;
};

type StaffFormProps = {
  staff: Staff;
  readOnly?: boolean;

  existingStaff: Staff[];
  stores: Store[];
  staffStatuses: Status[];
  countries: CountryReference[];

  /*
   * Existing persisted User for Edit mode.
   *
   * Undefined for Add mode.
   */
  user?: User;

  associatedStoreIds?: string[];

  onSave: (
    staff: Staff,
    person: StaffPersonInput,
    storeIds: string[],
  ) => Promise<void>;

  onCancel: () => void;
};

function generateStaffCode(
  existingStaff: Staff[],
  primaryStoreCode?: string,
): string {
  if (!primaryStoreCode) {
    return "";
  }

  const numbers = existingStaff
    .map((item) => item.staffCode?.match(/(\d+)$/)?.[1])
    .filter(Boolean)
    .map(Number);

  const next = Math.max(0, ...numbers) + 1;

  /*
   * Store code already contains the organization prefix.
   *
   * Example:
   * ORG-TORONTO-STORE-001-STAFF-001
   */
  return `${primaryStoreCode}-STAFF-${String(next).padStart(3, "0")}`;
}

function createDefaultPhone(
  countries: CountryReference[],
): PhoneNumber | undefined {
  const country =
    countries.find((item) => item.countryCode?.toUpperCase() === "CA") ??
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

function createPersonFromUser(
  user: User | undefined,
  countries: CountryReference[],
): StaffPersonInput {
  if (user) {
    return {
      firstName: user.firstName ?? "",
      middleName: user.middleName,
      lastName: user.lastName ?? "",
      displayName: user.displayName,
      primaryEmail: user.primaryEmail,
      primaryPhone: user.primaryPhone ??
        createDefaultPhone(countries) ?? {
          countryId: "",
          callingCode: "",
          number: "",
        },
      preferredLanguageId: user.preferredLanguageId,
    };
  }

  return {
    firstName: "",
    middleName: undefined,
    lastName: "",
    displayName: undefined,
    primaryEmail: undefined,
    primaryPhone: createDefaultPhone(countries) ?? {
      countryId: "",
      callingCode: "",
      number: "",
    },
    preferredLanguageId: undefined,
  };
}

export function StaffForm({
  staff,
  readOnly = false,
  existingStaff,
  stores,
  staffStatuses,
  countries,
  user,
  associatedStoreIds,
  onSave,
  onCancel,
}: StaffFormProps) {
  const theme = useTheme();

  const isNew = !existingStaff.some((item) => item.id === staff.id);

  const activeStaffStatusId =
    staffStatuses.find(
      (status) => status.statusName.trim().toLowerCase() === "active",
    )?.id ?? "status-active";

  const [form, setForm] = useState<Staff>(() => ({
    ...staff,
    staffCode: staff.staffCode || "",
    staffStatusId: isNew ? activeStaffStatusId : staff.staffStatusId,
  }));

  const [person, setPerson] = useState<StaffPersonInput>(() =>
    createPersonFromUser(user, countries),
  );

  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>(
    associatedStoreIds ?? (staff.storeId ? [staff.storeId] : []),
  );

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    setForm({
      ...staff,
      staffCode: staff.staffCode || "",
      staffStatusId: isNew ? activeStaffStatusId : staff.staffStatusId,
    });

    setPerson(createPersonFromUser(user, countries));

    setSelectedStoreIds(
      associatedStoreIds ?? (staff.storeId ? [staff.storeId] : []),
    );

    setSaveError("");
  }, [staff, user, countries, associatedStoreIds, isNew, activeStaffStatusId]);

  const updateStaff = <K extends keyof Staff>(field: K, value: Staff[K]) => {
    if (readOnly) {
      return;
    }

    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const updatePerson = <K extends keyof StaffPersonInput>(
    field: K,
    value: StaffPersonInput[K],
  ) => {
    if (readOnly) {
      return;
    }

    setPerson((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const roleItems: ReferenceDataItem[] = [
    {
      id: StaffRole.OWNER,
      code: StaffRole.OWNER,
      name: "Owner",
      displayOrder: 1,
      active: true,
    },
    {
      id: StaffRole.MANAGER,
      code: StaffRole.MANAGER,
      name: "Manager",
      displayOrder: 2,
      active: true,
    },
    {
      id: StaffRole.STAFF,
      code: StaffRole.STAFF,
      name: "Staff",
      displayOrder: 3,
      active: true,
    },
  ];

  const activeStores = useMemo(
    () => stores.filter((store) => !store.isDeleted),
    [stores],
  );

  const storeItems: ReferenceDataItem[] = activeStores.map((store) => ({
    id: store.id,
    code: store.storeCode,
    name: store.name,
    displayOrder: 0,
    active: true,
  }));

  const toggleStore = (storeId: string) => {
    if (readOnly) {
      return;
    }
    setSelectedStoreIds((current) => {
      if (current.includes(storeId)) {
        /*
         * Primary Store must always remain associated.
         */
        if (form.storeId === storeId) {
          return current;
        }

        return current.filter((id) => id !== storeId);
      }

      return Array.from(new Set([...current, storeId]));
    });
  };

  const handlePrimaryStoreChange = (value: string) => {
    const primaryStoreId = value || undefined;

    const primaryStore = stores.find((store) => store.id === primaryStoreId);

    updateStaff("storeId", primaryStoreId);

    if (isNew) {
      updateStaff(
        "staffCode",
        generateStaffCode(existingStaff, primaryStore?.storeCode),
      );
    }

    setSelectedStoreIds((current) => {
      if (!primaryStoreId) {
        return current;
      }

      return [primaryStoreId, ...current.filter((id) => id !== primaryStoreId)];
    });
  };

  const handleSave = async () => {
    setSaveError("");

    const firstName = person.firstName.trim();

    const lastName = person.lastName.trim();

    const phone = person.primaryPhone?.number?.replace(/\D/g, "") ?? "";

    if (!firstName) {
      setSaveError("First Name is required.");
      return;
    }

    if (!lastName) {
      setSaveError("Last Name is required.");
      return;
    }

    if (!person.primaryPhone || !phone) {
      setSaveError("Primary Phone Number is required.");
      return;
    }

    if (!form.storeId) {
      setSaveError("Please select a Primary Store.");
      return;
    }

    if (!form.staffCode.trim()) {
      setSaveError("Staff Code is required.");
      return;
    }

    const finalStoreIds = Array.from(
      new Set([form.storeId, ...selectedStoreIds]),
    );

    setSaving(true);

    try {
      await onSave(
        {
          ...form,

          staffCode: form.staffCode.trim(),

          staffStatusId: isNew ? activeStaffStatusId : form.staffStatusId,

          relievingDate: isNew ? undefined : form.relievingDate,

          capabilities: [...DEFAULT_ROLE_CAPABILITIES[form.role]],
        },
        {
          firstName,
          middleName: person.middleName?.trim() || undefined,
          lastName,
          displayName:
            person.displayName?.trim() || `${firstName} ${lastName}`.trim(),
          primaryEmail: person.primaryEmail?.trim().toLowerCase() || undefined,
          primaryPhone: {
            ...person.primaryPhone,
            number: person.primaryPhone.number.trim(),
          },
          preferredLanguageId: person.preferredLanguageId || undefined,
        },
        finalStoreIds,
      );
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Unable to save staff.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text variant="title" color="text">
        {isNew ? "Add Staff" : readOnly ? "View Staff" : "Edit Staff"}
      </Text>

      <Text variant="bodySmall" color="textMuted">
        {isNew
          ? "Create the staff member's user profile, staff role and store assignments."
          : readOnly
            ? "View the staff member's profile, role and store assignments."
            : "Update the staff member's profile, role and store assignments."}
      </Text>

      <View style={styles.section}>
        <Text variant="h3" color="text">
          Personal Information
        </Text>

        <Input
          label="First Name"
          value={person.firstName}
          editable={!readOnly}
          onChangeText={(value) => updatePerson("firstName", value)}
        />

        <Input
          label="Middle Name"
          value={person.middleName ?? ""}
          editable={!readOnly}
          onChangeText={(value) =>
            updatePerson("middleName", value || undefined)
          }
        />

        <Input
          label="Last Name"
          value={person.lastName}
          editable={!readOnly}
          onChangeText={(value) => updatePerson("lastName", value)}
        />

        <Input
          label="Display Name"
          value={person.displayName ?? ""}
          editable={!readOnly}
          onChangeText={(value) =>
            updatePerson("displayName", value || undefined)
          }
        />

        <Input
          label="Email"
          value={person.primaryEmail ?? ""}
          editable={!readOnly}
          onChangeText={(value) =>
            updatePerson("primaryEmail", value || undefined)
          }
          autoCapitalize="none"
        />

        <PhoneField
          label="Primary Phone"
          value={person.primaryPhone}
          countries={countries}
          onChange={(value) => updatePerson("primaryPhone", value)}
        />
      </View>

      <View style={styles.section}>
        <Text variant="h3" color="text">
          Staff Information
        </Text>

        <Input
          label="Staff Code"
          value={form.staffCode}
          editable={!readOnly && !isNew}
          onChangeText={(value) => updateStaff("staffCode", value)}
        />

        <Input
          label="Designation"
          value={form.designation ?? ""}
          editable={!readOnly}
          onChangeText={(value) =>
            updateStaff("designation", value || undefined)
          }
        />

        <ReferenceSelect
          label="Role"
          value={form.role}
          items={roleItems}
          onChange={(value) => updateStaff("role", value as StaffRole)}
        />

        <ReferenceSelect
          label="Primary Store"
          value={form.storeId ?? ""}
          items={storeItems}
          onChange={handlePrimaryStoreChange}
        />

        <DateInput
          label="Joining Date"
          value={form.joiningDate}
          onChange={(value) => {
            if (value) {
              updateStaff("joiningDate", value);
            }
          }}
        />

        {!isNew && (
          <DateInput
            label="Relieving Date"
            value={form.relievingDate ?? ""}
            onChange={(value) =>
              updateStaff("relievingDate", value || undefined)
            }
          />
        )}
      </View>

      <View style={styles.section}>
        <Text variant="h3" color="text">
          Associated Stores
        </Text>

        {activeStores.map((store) => {
          const selected = selectedStoreIds.includes(store.id);

          const primary = form.storeId === store.id;

          return (
            <Pressable
              key={store.id}
              onPress={() => toggleStore(store.id)}
              style={[
                styles.storeRow,
                {
                  borderColor: selected
                    ? theme.colors.primary
                    : theme.colors.border,
                },
              ]}
            >
              <Text variant="body" color="text">
                {selected ? "✓ " : ""}
                {store.name}
                {primary ? " (Primary)" : ""}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {!isNew && (
        <View style={styles.section}>
          <ReferenceSelect
            label="Status"
            value={form.staffStatusId}
            items={staffStatuses.map((status) => ({
              id: status.id,
              code: status.statusCode,
              name: status.statusName,
              displayOrder: status.displayOrder,
              active: status.isActive,
            }))}
            onChange={(value) => updateStaff("staffStatusId", value)}
          />
        </View>
      )}

      {saveError ? (
        <Text variant="bodySmall" color="text">
          {saveError}
        </Text>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          onPress={onCancel}
          disabled={saving}
          style={[
            styles.button,
            {
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Text variant="body" color="text">
            {readOnly ? "Close" : "Cancel"}
          </Text>
        </Pressable>

        {!readOnly && (
          <Pressable
            onPress={() => {
              void handleSave();
            }}
            disabled={saving}
            style={[
              styles.button,
              {
                backgroundColor: theme.colors.primary,
                opacity: saving ? 0.6 : 1,
              },
            ]}
          >
            <Text variant="body" color="background">
              {saving ? "Saving..." : "Save Staff"}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },

  section: {
    gap: 12,
  },

  storeRow: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 8,
  },

  button: {
    minWidth: 110,
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
});
