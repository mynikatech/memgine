import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import type {
  OrganizationUser,
  ReferenceDataItem,
  Staff,
  Store,
} from "@/src/core";
import { StaffRole, DEFAULT_ROLE_CAPABILITIES } from "@/src/core";
import { useTheme } from "@/src/providers";

import { Input } from "../Input";
import { ReferenceSelect } from "../ReferenceSelect";
import { Text } from "../Text";

type StaffFormProps = {
  staff: Staff;

  organizationUsers: OrganizationUser[];
  existingStaff: Staff[];

  stores: Store[];

  staffStatuses: ReferenceDataItem[];

  onCreateOrganizationUser?: (
    user: OrganizationUser,
  ) => Promise<OrganizationUser>;

  onSave: (staff: Staff) => Promise<void>;
  onCancel: () => void;
};

export function StaffForm({
  staff,
  organizationUsers,
  existingStaff,
  stores,
  staffStatuses,
  onCreateOrganizationUser,
  onSave,
  onCancel,
}: StaffFormProps) {
  const theme = useTheme();

  const [form, setForm] = useState<Staff>(staff);
  const [saving, setSaving] = useState(false);

  const [showNewUser, setShowNewUser] = useState(false);

  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPhone, setNewUserPhone] = useState("");

  useEffect(() => {
    setForm(staff);
    setShowNewUser(false);
  }, [staff]);

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

  const update = <K extends keyof Staff>(field: K, value: Staff[K]) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  /*
   * Organization Users available for Staff assignment.
   *
   * Add:
   * - only OWNER / EMPLOYEE
   * - ACTIVE
   * - not deleted
   * - not already assigned to another Staff
   *
   * Edit:
   * - always retain the currently selected Organization User
   */
  const availableOrganizationUsers = useMemo(() => {
    return organizationUsers.filter((user) => {
      if (user.isDeleted) {
        return false;
      }

      const isCurrentUser = user.id === form.organizationUserId;

      const isEligibleType =
        user.organizationUserTypeId === "org-user-type-owner" ||
        user.organizationUserTypeId === "org-user-type-employee";

      const isActive = user.organizationUserStatusId === "status-active";

      const assignedToAnotherStaff = existingStaff.some(
        (item) =>
          item.id !== form.id &&
          item.organizationUserId === user.id &&
          !item.isDeleted,
      );

      if (isCurrentUser) {
        return true;
      }

      return isEligibleType && isActive && !assignedToAnotherStaff;
    });
  }, [organizationUsers, existingStaff, form.id, form.organizationUserId]);

  const selectedOrganizationUser = organizationUsers.find(
    (user) => user.id === form.organizationUserId,
  );

  /*
   * We don't currently have a global User entity in the mock layer.
   * For the demo, display the Staff name alongside the selected
   * Organization User.
   */
  const getOrganizationUserLabel = (user: OrganizationUser) => {
    if (user.id === form.organizationUserId) {
      return form.fullName;
    }

    return user.id;
  };

  const getStoreName = (storeId?: string) => {
    if (!storeId) {
      return "";
    }

    return stores.find((store) => store.id === storeId)?.name ?? "";
  };

  const handleCreateUser = async () => {
    if (!newUserName.trim()) {
      return;
    }

    if (!onCreateOrganizationUser) {
      return;
    }

    const now = new Date().toISOString();

    const newOrganizationUser: OrganizationUser = {
      id: `org-user-${Date.now()}`,
      organizationId: form.organizationId,
      userId: `user-${Date.now()}`,

      organizationUserTypeId: "org-user-type-employee",
      organizationUserStatusId: "status-active",

      joiningDate: form.joiningDate || now.substring(0, 10),

      createdAt: now,
      createdBy: "user-system",
      updatedAt: now,
      updatedBy: "user-system",

      isDeleted: false,
      versionNo: 1,
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

    const created = await onCreateOrganizationUser(newOrganizationUser);

    /*
     * The name belongs to the global User model eventually.
     * For the current mock implementation, Staff keeps the
     * display name as defined by the current Staff contract.
     */
    setForm((current) => ({
      ...current,
      organizationUserId: created.id,
      fullName: newUserName.trim(),
    }));

    setNewUserName("");
    setNewUserEmail("");
    setNewUserPhone("");
    setShowNewUser(false);
  };

  const handleSave = async () => {
    if (!form.organizationUserId) {
      return;
    }

    setSaving(true);

    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* ------------------------------------------------------- */}
      {/* Organization User                                      */}
      {/* ------------------------------------------------------- */}

      <View style={styles.section}>
        <Text variant="title" color="text">
          Organization User
        </Text>

        <Text variant="bodySmall" color="textMuted">
          Select an existing employee or owner belonging to this organization.
        </Text>

        <ReferenceSelect
          label="Organization User"
          value={form.organizationUserId}
          items={availableOrganizationUsers.map((user) => ({
            id: user.id,
            code: user.id,
            name: getOrganizationUserLabel(user),
            displayOrder: 0,
            active: !user.isDeleted,
          }))}
          placeholder="Select organization user"
          onChange={(value) => update("organizationUserId", value)}
        />

        {selectedOrganizationUser ? (
          <View
            style={[
              styles.selectedUser,
              {
                backgroundColor: theme.colors.surfaceAlt,
              },
            ]}
          >
            <Text variant="bodySmall" color="textMuted">
              Organization User ID
            </Text>

            <Text variant="body" color="text">
              {selectedOrganizationUser.id}
            </Text>
          </View>
        ) : null}

        {!showNewUser ? (
          <Pressable
            onPress={() => setShowNewUser(true)}
            style={({ pressed }) => [
              styles.secondaryButton,
              {
                borderColor: theme.colors.border,
                opacity: pressed ? 0.75 : 1,
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
              New User
            </Text>

            <Input
              label="Name"
              value={newUserName}
              placeholder="Enter user's name"
              onChangeText={setNewUserName}
            />

            <Input
              label="Email Address"
              value={newUserEmail}
              placeholder="user@example.com"
              onChangeText={setNewUserEmail}
            />

            <Input
              label="Phone Number"
              value={newUserPhone}
              placeholder="+1 416 555 0100"
              onChangeText={setNewUserPhone}
            />

            <View style={styles.inlineActions}>
              <Pressable
                onPress={() => setShowNewUser(false)}
                style={[
                  styles.smallButton,
                  {
                    backgroundColor: theme.colors.surface,
                  },
                ]}
              >
                <Text variant="body" color="text">
                  Cancel
                </Text>
              </Pressable>

              <Pressable
                onPress={handleCreateUser}
                disabled={!newUserName.trim()}
                style={[
                  styles.smallButton,
                  {
                    backgroundColor: theme.colors.primary,
                    opacity: !newUserName.trim()
                      ? theme.states.disabledOpacity
                      : 1,
                  },
                ]}
              >
                <Text variant="body" color="background">
                  Add User
                </Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>

      {/* ------------------------------------------------------- */}
      {/* Staff Information                                      */}
      {/* ------------------------------------------------------- */}

      <View style={styles.section}>
        <Text variant="title" color="text">
          Staff Information
        </Text>

        <View style={styles.grid}>
          <View style={styles.field}>
            <Input
              label="Staff Code"
              value={form.staffCode}
              placeholder="e.g. ST-001"
              onChangeText={(value) => update("staffCode", value)}
            />
          </View>

          <View style={styles.field}>
            <Input
              label="Staff Name"
              value={form.fullName}
              placeholder="Enter staff name"
              onChangeText={(value) => update("fullName", value)}
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

          <View style={styles.field}>
            <ReferenceSelect
              label="Primary Store"
              value={form.storeId ?? ""}
              items={stores.map((store) => ({
                id: store.id,
                code: store.storeCode,
                name: store.name,
                displayOrder: 0,
                active: !store.isDeleted,
              }))}
              placeholder="Select store"
              allowClear
              onChange={(value) => update("storeId", value || undefined)}
            />
          </View>
        </View>
      </View>

      {/* ------------------------------------------------------- */}
      {/* Access                                                  */}
      {/* ------------------------------------------------------- */}

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
              value={form.staffStatusId}
              items={staffStatuses}
              placeholder="Select status"
              onChange={(value) => update("staffStatusId", value)}
            />
          </View>
        </View>
      </View>

      {/* ------------------------------------------------------- */}
      {/* Employment                                              */}
      {/* ------------------------------------------------------- */}

      <View style={styles.section}>
        <Text variant="title" color="text">
          Employment
        </Text>

        <View style={styles.grid}>
          <View style={styles.field}>
            <Input
              label="Joining Date"
              value={form.joiningDate}
              placeholder="YYYY-MM-DD"
              onChangeText={(value) => update("joiningDate", value)}
            />
          </View>

          <View style={styles.field}>
            <Input
              label="Relieving Date"
              value={form.relievingDate ?? ""}
              placeholder="YYYY-MM-DD"
              onChangeText={(value) =>
                update("relievingDate", value || undefined)
              }
            />
          </View>
        </View>
      </View>

      {/* ------------------------------------------------------- */}
      {/* Actions                                                  */}
      {/* ------------------------------------------------------- */}

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
          disabled={saving || !form.organizationUserId}
          style={[
            styles.button,
            {
              backgroundColor: theme.colors.primary,
              opacity:
                saving || !form.organizationUserId
                  ? theme.states.disabledOpacity
                  : 1,
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
  },

  selectedUser: {
    padding: 12,
    borderRadius: 8,
    gap: 3,
  },

  newUserCard: {
    padding: 16,
    borderWidth: 1,
    borderRadius: 10,
    gap: 14,
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
