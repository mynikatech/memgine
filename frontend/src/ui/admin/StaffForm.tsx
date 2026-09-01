import { useEffect, useMemo, useState } from "react";

import { Pressable, StyleSheet, View } from "react-native";

import type {
  CountryReference,
  CreateUserInput,
  OrganizationUser,
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

type StaffFormProps = {
  staff: Staff;

  users: User[];

  organizationUsers: OrganizationUser[];

  existingStaff: Staff[];

  stores: Store[];

  staffStatuses: Status[];

  userStatuses: Status[];

  countries: CountryReference[];

  associatedStoreIds?: string[];

  onCreateUser?: (input: CreateUserInput) => Promise<User>;

  onCreateOrganizationUser?: (
    organizationUser: OrganizationUser,
  ) => Promise<OrganizationUser>;

  onSave: (staff: Staff, storeIds: string[]) => Promise<void>;

  onCancel: () => void;
};

type NewUserState = {
  firstName: string;
  middleName: string;
  lastName: string;
  displayName: string;
  primaryEmail: string;
  primaryPhone: PhoneNumber | undefined;
  preferredLanguageId: string;
  userStatusId: string;
};

function generateStaffCode(existingStaff: Staff[]): string {
  const numbers = existingStaff
    .map((item) => item.staffCode?.match(/(\d+)$/)?.[1])
    .filter(Boolean)
    .map(Number);

  const next = Math.max(0, ...numbers) + 1;

  return `STF-${String(next).padStart(4, "0")}`;
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

function getUserDisplayName(user?: User): string {
  if (!user) {
    return "";
  }

  return (
    user.displayName?.trim() ||
    `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() ||
    user.userCode
  );
}

function getUserPhoneDisplay(user?: User): string {
  if (!user?.primaryPhone) {
    return "";
  }

  return `${user.primaryPhone.callingCode ?? ""} ${
    user.primaryPhone.number ?? ""
  }`.trim();
}

export function StaffForm({
  staff,
  users,
  organizationUsers,
  existingStaff,
  stores,
  staffStatuses,
  userStatuses,
  countries,
  associatedStoreIds,
  onCreateUser,
  onCreateOrganizationUser,
  onSave,
  onCancel,
}: StaffFormProps) {
  const theme = useTheme();

  const isNew = !existingStaff.some((item) => item.id === staff.id);

  const activeStaffStatusId =
    staffStatuses.find(
      (status) => status.statusName.trim().toLowerCase() === "active",
    )?.id ?? "staff-status-active";

  const activeUserStatusId =
    userStatuses.find(
      (status) => status.statusName.trim().toLowerCase() === "active",
    )?.id ?? "user-status-active";

  const [form, setForm] = useState<Staff>(() => ({
    ...staff,

    staffCode: staff.staffCode || generateStaffCode(existingStaff),

    staffStatusId: isNew ? activeStaffStatusId : staff.staffStatusId,
  }));

  /*
   * This state exists only while the form is open.
   *
   * It is NOT persisted here.
   *
   * Persistence happens only when Save Staff
   * calls onSave(staff, selectedStoreIds).
   */
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>(
    associatedStoreIds ?? (staff.storeId ? [staff.storeId] : []),
  );

  const [saving, setSaving] = useState(false);

  const [showNewUser, setShowNewUser] = useState(false);

  const [creatingUser, setCreatingUser] = useState(false);

  const [newUserError, setNewUserError] = useState("");

  const [newUser, setNewUser] = useState<NewUserState>(() => ({
    firstName: "",
    middleName: "",
    lastName: "",
    displayName: "",
    primaryEmail: "",
    primaryPhone: createDefaultPhone(countries),
    preferredLanguageId: "",
    userStatusId: activeUserStatusId,
  }));

  useEffect(() => {
    setForm({
      ...staff,

      staffCode: staff.staffCode || generateStaffCode(existingStaff),

      staffStatusId: isNew ? activeStaffStatusId : staff.staffStatusId,
    });

    setSelectedStoreIds(
      associatedStoreIds ?? (staff.storeId ? [staff.storeId] : []),
    );

    setShowNewUser(false);
    setCreatingUser(false);
    setNewUserError("");

    setNewUser({
      firstName: "",
      middleName: "",
      lastName: "",
      displayName: "",
      primaryEmail: "",
      primaryPhone: createDefaultPhone(countries),
      preferredLanguageId: "",
      userStatusId: activeUserStatusId,
    });
  }, [
    staff,
    existingStaff,
    countries,
    associatedStoreIds,
    isNew,
    activeStaffStatusId,
    activeUserStatusId,
  ]);

  const update = <K extends keyof Staff>(field: K, value: Staff[K]) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const selectedOrganizationUser = useMemo(
    () =>
      organizationUsers.find(
        (item) => item.id === form.organizationUserId && !item.isDeleted,
      ),
    [organizationUsers, form.organizationUserId],
  );

  const selectedUser = useMemo(() => {
    if (!selectedOrganizationUser) {
      return undefined;
    }

    return users.find(
      (user) => user.id === selectedOrganizationUser.userId && !user.isDeleted,
    );
  }, [selectedOrganizationUser, users]);

  const availableOrganizationUsers = useMemo(
    () =>
      organizationUsers.filter((organizationUser) => {
        if (organizationUser.isDeleted) {
          return false;
        }

        if (organizationUser.id === form.organizationUserId) {
          return true;
        }

        const eligible =
          organizationUser.organizationUserTypeId === "org-user-type-owner" ||
          organizationUser.organizationUserTypeId ===
            "org-user-type-employee" ||
          organizationUser.organizationUserTypeId === "org-user-type-staff";

        const active =
          organizationUser.organizationUserStatusId === "status-active";

        const alreadyAssigned = existingStaff.some(
          (item) =>
            item.id !== form.id &&
            item.organizationUserId === organizationUser.id &&
            !item.isDeleted,
        );

        return eligible && active && !alreadyAssigned;
      }),
    [organizationUsers, existingStaff, form.id, form.organizationUserId],
  );

  const organizationUserItems: ReferenceDataItem[] =
    availableOrganizationUsers.map((organizationUser) => {
      const user = users.find(
        (item) => item.id === organizationUser.userId && !item.isDeleted,
      );

      return {
        id: organizationUser.id,

        code: user?.userCode ?? "",

        name: getUserDisplayName(user) || `User ${organizationUser.userId}`,

        displayOrder: 0,

        active: !organizationUser.isDeleted,
      };
    });

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
    setSelectedStoreIds((current) => {
      let next: string[];

      if (current.includes(storeId)) {
        /*
         * Do not allow the primary store
         * to disappear while it remains
         * the primary store.
         */
        if (form.storeId === storeId) {
          next = current;
        } else {
          next = current.filter((id) => id !== storeId);
        }
      } else {
        next = [...current, storeId];
      }

      return Array.from(new Set(next));
    });
  };

  const handlePrimaryStoreChange = (value: string) => {
    const primaryStoreId = value || undefined;

    update("storeId", primaryStoreId);

    if (!primaryStoreId) {
      /*
       * If Primary Store is cleared,
       * retain associated stores.
       *
       * Save validation below will
       * prevent saving without a primary.
       */
      return;
    }

    setSelectedStoreIds((current) => {
      const withoutPrimary = current.filter((id) => id !== primaryStoreId);

      /*
       * Primary store is always first.
       */
      return [primaryStoreId, ...withoutPrimary];
    });
  };

  const resetNewUser = () => {
    setNewUser({
      firstName: "",
      middleName: "",
      lastName: "",
      displayName: "",
      primaryEmail: "",
      primaryPhone: createDefaultPhone(countries),
      preferredLanguageId: "",
      userStatusId: activeUserStatusId,
    });

    setNewUserError("");
  };

  const handleCreateUser = async () => {
    if (!onCreateUser) {
      setNewUserError("User creation is not available.");
      return;
    }

    if (!onCreateOrganizationUser) {
      setNewUserError("Organization user creation is not available.");
      return;
    }

    const firstName = newUser.firstName.trim();

    const lastName = newUser.lastName.trim();

    const email = newUser.primaryEmail.trim().toLowerCase();

    const phone = newUser.primaryPhone?.number?.replace(/\D/g, "") ?? "";

    if (!firstName) {
      setNewUserError("First Name is required.");
      return;
    }

    if (!lastName) {
      setNewUserError("Last Name is required.");
      return;
    }

    if (!newUser.primaryPhone) {
      setNewUserError("Primary Phone Number is required.");
      return;
    }

    if (!phone) {
      setNewUserError("Primary Phone Number is required.");
      return;
    }

    const duplicate = users.find((user) => {
      if (user.isDeleted) {
        return false;
      }

      const existingPhone = user.primaryPhone?.number?.replace(/\D/g, "") ?? "";

      const existingEmail = user.primaryEmail?.trim().toLowerCase() ?? "";

      const samePhone = phone.length > 0 && existingPhone === phone;

      const sameEmail = email.length > 0 && existingEmail === email;

      return samePhone || sameEmail;
    });

    if (duplicate) {
      setNewUserError(
        `A user already exists: ${getUserDisplayName(duplicate)}.`,
      );
      return;
    }

    setCreatingUser(true);
    setNewUserError("");

    try {
      const now = new Date().toISOString();

      const createdUser = await onCreateUser({
        firstName,

        middleName: newUser.middleName.trim() || undefined,

        lastName,

        displayName:
          newUser.displayName.trim() || `${firstName} ${lastName}`.trim(),

        primaryEmail: email || undefined,

        primaryPhone: {
          ...newUser.primaryPhone,

          number: newUser.primaryPhone.number.trim(),
        },

        preferredLanguageId: newUser.preferredLanguageId || undefined,

        userStatusId: activeUserStatusId,

        createdBy: "user-system",
      });

      const createdOrganizationUser = await onCreateOrganizationUser({
        id: `org-user-${Date.now()}`,

        organizationId: form.organizationId,

        userId: createdUser.id,

        organizationUserTypeId: "org-user-type-employee",

        organizationUserStatusId: "status-active",

        joiningDate: form.joiningDate,

        createdAt: now,
        createdBy: "user-system",

        updatedAt: now,
        updatedBy: "user-system",

        isDeleted: false,

        versionNo: 1,
      });

      setForm((current) => ({
        ...current,

        organizationUserId: createdOrganizationUser.id,
      }));

      resetNewUser();
      setShowNewUser(false);
    } catch (error) {
      setNewUserError(
        error instanceof Error ? error.message : "Unable to create user.",
      );
    } finally {
      setCreatingUser(false);
    }
  };

  const handleSave = async () => {
    /*
     * User is mandatory.
     */
    if (!form.organizationUserId) {
      return;
    }

    /*
     * Primary Store is mandatory.
     */
    if (!form.storeId) {
      return;
    }

    /*
     * A selected User must exist.
     */
    if (!selectedUser) {
      return;
    }

    /*
     * Primary Store must be an
     * associated store.
     */
    const finalStoreIds = Array.from(
      new Set([form.storeId, ...selectedStoreIds]),
    );

    setSaving(true);

    try {
      await onSave(
        {
          ...form,

          staffCode: form.staffCode || generateStaffCode(existingStaff),

          /*
           * Primary Store is the Staff.storeId.
           */
          storeId: form.storeId,

          staffStatusId: isNew ? activeStaffStatusId : form.staffStatusId,

          relievingDate: isNew ? undefined : form.relievingDate,
        },

        finalStoreIds,
      );
    } finally {
      setSaving(false);
    }
  };

  const canSave =
    !saving &&
    !!form.organizationUserId &&
    !!selectedUser &&
    !!form.storeId &&
    selectedStoreIds.length > 0;

  return (
    <View style={styles.container}>
      {/* ========================================================== */}
      {/* USER                                                        */}
      {/* ========================================================== */}

      <View style={styles.section}>
        <Text variant="title" color="text">
          User
        </Text>

        <Text variant="bodySmall" color="textMuted">
          Select the person who will be associated with this staff record.
        </Text>

        <ReferenceSelect
          label="User *"
          value={form.organizationUserId}
          items={organizationUserItems}
          placeholder="Select user"
          onChange={(value) => update("organizationUserId", value)}
        />

        {!showNewUser ? (
          <Pressable
            onPress={() => {
              setNewUserError("");
              setShowNewUser(true);
            }}
            style={[
              styles.secondaryButton,
              {
                borderColor: theme.colors.border,
              },
            ]}
          >
            <Text variant="body" color="primary">
              + Add New User
            </Text>
          </Pressable>
        ) : (
          <View
            style={[
              styles.newUserCard,
              {
                borderColor: theme.colors.border,

                backgroundColor: theme.colors.surfaceAlt,
              },
            ]}
          >
            <Text variant="title" color="text">
              Add New User
            </Text>

            <Text variant="bodySmall" color="textMuted">
              Create the User first. The new User will then be associated with
              this organization automatically.
            </Text>

            <View style={styles.grid}>
              <View style={styles.field}>
                <Input
                  label="First Name *"
                  value={newUser.firstName}
                  placeholder="Enter first name"
                  onChangeText={(value) =>
                    setNewUser((current) => ({
                      ...current,
                      firstName: value,
                    }))
                  }
                />
              </View>

              <View style={styles.field}>
                <Input
                  label="Middle Name"
                  value={newUser.middleName}
                  placeholder="Enter middle name"
                  onChangeText={(value) =>
                    setNewUser((current) => ({
                      ...current,
                      middleName: value,
                    }))
                  }
                />
              </View>

              <View style={styles.field}>
                <Input
                  label="Last Name *"
                  value={newUser.lastName}
                  placeholder="Enter last name"
                  onChangeText={(value) =>
                    setNewUser((current) => ({
                      ...current,
                      lastName: value,
                    }))
                  }
                />
              </View>

              <View style={styles.field}>
                <Input
                  label="Display Name"
                  value={newUser.displayName}
                  placeholder="Defaults to first + last name"
                  onChangeText={(value) =>
                    setNewUser((current) => ({
                      ...current,
                      displayName: value,
                    }))
                  }
                />
              </View>

              <View style={styles.field}>
                <Input
                  label="Primary Email"
                  value={newUser.primaryEmail}
                  placeholder="Enter email address"
                  onChangeText={(value) =>
                    setNewUser((current) => ({
                      ...current,
                      primaryEmail: value,
                    }))
                  }
                />
              </View>

              <View style={styles.field}>
                <PhoneField
                  label="Primary Phone Number *"
                  value={
                    newUser.primaryPhone ??
                    createDefaultPhone(countries) ?? {
                      countryId: "",
                      callingCode: "",
                      number: "",
                    }
                  }
                  countries={countries}
                  onChange={(value) =>
                    setNewUser((current) => ({
                      ...current,
                      primaryPhone: value,
                    }))
                  }
                  maxDigits={10}
                />
              </View>
            </View>

            <View style={styles.field}>
              <ReferenceSelect
                label="User Status"
                value={activeUserStatusId}
                items={userStatuses}
                disabled
                onChange={() => {}}
              />
            </View>

            {!!newUserError && (
              <Text variant="bodySmall" color="danger">
                {newUserError}
              </Text>
            )}

            <View style={styles.inlineActions}>
              <Pressable
                onPress={() => {
                  resetNewUser();
                  setShowNewUser(false);
                }}
                disabled={creatingUser}
                style={[
                  styles.smallButton,
                  {
                    backgroundColor: theme.colors.surface,

                    opacity: creatingUser ? theme.states.disabledOpacity : 1,
                  },
                ]}
              >
                <Text variant="body" color="text">
                  Cancel
                </Text>
              </Pressable>

              <Pressable
                onPress={handleCreateUser}
                disabled={
                  creatingUser ||
                  !newUser.firstName.trim() ||
                  !newUser.lastName.trim() ||
                  !newUser.primaryPhone?.number.trim()
                }
                style={[
                  styles.smallButton,
                  {
                    backgroundColor: theme.colors.primary,

                    opacity:
                      creatingUser ||
                      !newUser.firstName.trim() ||
                      !newUser.lastName.trim() ||
                      !newUser.primaryPhone?.number.trim()
                        ? theme.states.disabledOpacity
                        : 1,
                  },
                ]}
              >
                <Text variant="body" color="background">
                  {creatingUser ? "Creating..." : "Create User"}
                </Text>
              </Pressable>
            </View>
          </View>
        )}

        {selectedUser ? (
          <View
            style={[
              styles.userDetailsCard,
              {
                borderColor: theme.colors.border,

                backgroundColor: theme.colors.surfaceAlt,
              },
            ]}
          >
            <Text variant="title" color="text">
              User Details
            </Text>

            <View style={styles.grid}>
              <View style={styles.field}>
                <Input
                  label="User Code"
                  value={selectedUser.userCode}
                  editable={false}
                  onChangeText={() => {}}
                />
              </View>

              <View style={styles.field}>
                <Input
                  label="First Name"
                  value={selectedUser.firstName}
                  editable={false}
                  onChangeText={() => {}}
                />
              </View>

              <View style={styles.field}>
                <Input
                  label="Middle Name"
                  value={selectedUser.middleName ?? ""}
                  editable={false}
                  onChangeText={() => {}}
                />
              </View>

              <View style={styles.field}>
                <Input
                  label="Last Name"
                  value={selectedUser.lastName}
                  editable={false}
                  onChangeText={() => {}}
                />
              </View>

              <View style={styles.field}>
                <Input
                  label="Display Name"
                  value={getUserDisplayName(selectedUser)}
                  editable={false}
                  onChangeText={() => {}}
                />
              </View>

              <View style={styles.field}>
                <Input
                  label="Primary Email"
                  value={selectedUser.primaryEmail ?? ""}
                  editable={false}
                  onChangeText={() => {}}
                />
              </View>

              <View style={styles.field}>
                <Input
                  label="Primary Phone Number"
                  value={getUserPhoneDisplay(selectedUser)}
                  editable={false}
                  onChangeText={() => {}}
                />
              </View>
            </View>
          </View>
        ) : null}
      </View>

      {/* ========================================================== */}
      {/* STAFF INFORMATION                                           */}
      {/* ========================================================== */}

      <View style={styles.section}>
        <Text variant="title" color="text">
          Staff Information
        </Text>

        <View style={styles.grid}>
          <View style={styles.field}>
            <Input
              label="Staff Code"
              value={form.staffCode}
              editable={false}
              placeholder="Automatically generated"
              onChangeText={() => {}}
            />
          </View>

          <View style={styles.field}>
            <Input
              label="Designation"
              value={form.designation ?? ""}
              placeholder="e.g. Store Manager"
              onChangeText={(value) =>
                update("designation", value || undefined)
              }
            />
          </View>
        </View>
      </View>

      {/* ========================================================== */}
      {/* STORE ASSIGNMENT                                            */}
      {/* ========================================================== */}

      <View style={styles.section}>
        <Text variant="title" color="text">
          Store Assignment
        </Text>

        <Text variant="bodySmall" color="textMuted">
          Select the Primary Store and any additional Stores where this staff
          member is authorized to operate.
        </Text>

        <ReferenceSelect
          label="Primary Store *"
          value={form.storeId ?? ""}
          items={storeItems}
          placeholder="Select primary store"
          allowClear
          onChange={handlePrimaryStoreChange}
        />

        <Text variant="bodySmall" color="textMuted">
          Associated Stores *
        </Text>

        {activeStores.length === 0 ? (
          <View
            style={[
              styles.emptyStoreCard,
              {
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surfaceAlt,
              },
            ]}
          >
            <Text variant="bodySmall" color="textMuted">
              No stores are available. Add a store first before creating staff.
            </Text>
          </View>
        ) : (
          <View style={styles.storeList}>
            {activeStores.map((store) => {
              const selected = selectedStoreIds.includes(store.id);

              const isPrimary = form.storeId === store.id;

              return (
                <Pressable
                  key={store.id}
                  onPress={() => toggleStore(store.id)}
                  style={[
                    styles.storeOption,
                    {
                      borderColor: selected
                        ? theme.colors.primary
                        : theme.colors.border,

                      backgroundColor: selected
                        ? theme.colors.surfaceAlt
                        : theme.colors.surface,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.checkbox,
                      {
                        borderColor: selected
                          ? theme.colors.primary
                          : theme.colors.border,

                        backgroundColor: selected
                          ? theme.colors.primary
                          : "transparent",
                      },
                    ]}
                  >
                    {selected ? (
                      <Text variant="caption" color="background">
                        ✓
                      </Text>
                    ) : null}
                  </View>

                  <View style={styles.storeOptionText}>
                    <View style={styles.storeNameRow}>
                      <Text variant="body" color="text">
                        {store.name}
                      </Text>

                      {isPrimary ? (
                        <Text variant="caption" color="primary">
                          Primary
                        </Text>
                      ) : null}
                    </View>

                    <Text variant="caption" color="textMuted">
                      {store.storeCode}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        {form.storeId && !selectedStoreIds.includes(form.storeId) ? (
          <Text variant="caption" color="danger">
            Primary Store must be associated with this staff member.
          </Text>
        ) : null}
      </View>

      {/* ========================================================== */}
      {/* ACCESS                                                      */}
      {/* ========================================================== */}

      <View style={styles.section}>
        <Text variant="title" color="text">
          Access
        </Text>

        <View style={styles.grid}>
          <View style={styles.field}>
            <ReferenceSelect
              label="Role"
              value={form.role}
              items={roleItems}
              placeholder="Select role"
              onChange={(value) => {
                const role = value as StaffRole;

                setForm((current) => ({
                  ...current,

                  role,

                  capabilities: DEFAULT_ROLE_CAPABILITIES[role],
                }));
              }}
            />
          </View>

          <View style={styles.field}>
            <ReferenceSelect
              label="Staff Status"
              value={isNew ? activeStaffStatusId : form.staffStatusId}
              items={staffStatuses}
              placeholder="Select status"
              disabled={isNew}
              onChange={(value) => update("staffStatusId", value)}
            />
          </View>
        </View>
      </View>

      {/* ========================================================== */}
      {/* EMPLOYMENT                                                   */}
      {/* ========================================================== */}

      <View style={styles.section}>
        <Text variant="title" color="text">
          Employment
        </Text>

        <View style={styles.grid}>
          <View style={styles.field}>
            <DateInput
              label="Joining Date *"
              value={form.joiningDate}
              required
              onChange={(value) => update("joiningDate", value ?? "")}
            />
          </View>

          <View style={styles.field}>
            <DateInput
              label="Relieving Date"
              value={form.relievingDate}
              disabled={isNew}
              minimumDate={form.joiningDate}
              placeholder={
                isNew ? "Available when staff leaves" : "Select date"
              }
              onChange={(value) => update("relievingDate", value)}
            />
          </View>
        </View>
      </View>

      {/* ========================================================== */}
      {/* ACTIONS                                                      */}
      {/* ========================================================== */}

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
          disabled={!canSave}
          style={[
            styles.button,
            {
              backgroundColor: theme.colors.primary,

              opacity: canSave ? 1 : theme.states.disabledOpacity,
            },
          ]}
        >
          <Text variant="body" color="background">
            {saving ? "Saving..." : "Save Staff"}
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
    gap: 14,
  },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
  },

  field: {
    width: "48%",
    minWidth: 280,
  },

  secondaryButton: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
  },

  newUserCard: {
    padding: 16,
    borderWidth: 1,
    borderRadius: 10,
    gap: 14,
  },

  userDetailsCard: {
    padding: 16,
    borderWidth: 1,
    borderRadius: 10,
    gap: 14,
  },

  inlineActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },

  smallButton: {
    minHeight: 42,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },

  storeList: {
    gap: 8,
  },

  storeOption: {
    minHeight: 56,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 1,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
  },

  storeOptionText: {
    flex: 1,
    gap: 2,
  },

  storeNameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  emptyStoreCard: {
    minHeight: 60,
    padding: 14,
    borderWidth: 1,
    borderRadius: 10,
    justifyContent: "center",
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
