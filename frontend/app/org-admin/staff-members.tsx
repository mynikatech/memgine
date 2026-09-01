import { useEffect, useMemo, useState } from "react";

import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";

import type {
  CountryReference,
  CreateUserInput,
  OrganizationUser,
  StaffStoreAssignment,
  Status,
  Staff,
  Store,
  User,
} from "@/src/core";

import { StaffRole, services } from "@/src/core";

import { useBusiness } from "@/src/providers";

import { DataTable, Modal, Text } from "@/src/ui";

import type { DataTableColumn } from "@/src/ui";

import { StaffForm } from "@/src/ui/admin/StaffForm";

function getStaffName(
  staff: Staff,
  organizationUsers: OrganizationUser[],
  users: User[],
): string {
  const organizationUser = organizationUsers.find(
    (item) => item.id === staff.organizationUserId && !item.isDeleted,
  );

  if (!organizationUser) {
    return "—";
  }

  const user = users.find(
    (item) => item.id === organizationUser.userId && !item.isDeleted,
  );

  if (!user) {
    return "—";
  }

  return (
    user.displayName?.trim() ||
    `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() ||
    user.userCode ||
    "—"
  );
}

function generateStaffCode(staff: Staff[]): string {
  const numbers = staff
    .map((item) => item.staffCode?.match(/(\d+)$/)?.[1])
    .filter(Boolean)
    .map(Number);

  const next = Math.max(0, ...numbers) + 1;

  return `STF-${String(next).padStart(4, "0")}`;
}

export default function OrgAdminStaff() {
  const { organization } = useBusiness();

  const [users, setUsers] = useState<User[]>([]);
  const [userStatuses, setUserStatuses] = useState<Status[]>([]);

  const [staff, setStaff] = useState<Staff[]>([]);

  const [organizationUsers, setOrganizationUsers] = useState<
    OrganizationUser[]
  >([]);

  const [stores, setStores] = useState<Store[]>([]);
  const [staffStatuses, setStaffStatuses] = useState<Status[]>([]);
  const [countries, setCountries] = useState<CountryReference[]>([]);

  /*
   * Store assignments are persisted independently from Staff.
   *
   * Staff.storeId = Primary Store
   *
   * StaffStoreAssignment[] = all associated stores
   */
  const [staffAssignments, setStaffAssignments] = useState<
    StaffStoreAssignment[]
  >([]);

  const [loading, setLoading] = useState(true);
  const [formVisible, setFormVisible] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);

      try {
        const [
          staffList,
          organizationUserList,
          storeList,
          staffStatusList,
          countryList,
          userList,
          userStatusList,
          assignmentList,
        ] = await Promise.all([
          services.organization.listStaff(organization.id),

          services.organization.listOrganizationUsers(organization.id),

          /*
           * IMPORTANT:
           * Stores now come from the local production data path.
           */
          services.organization.listStores(organization.id),

          services.status.listStaffStatuses(),

          services.referenceData.listCountries(),

          services.organization.listUsers(),

          services.status.listUserStatuses(),

          services.organization.listStaffStoreAssignments(organization.id),
        ]);

        if (!mounted) {
          return;
        }

        setStaff(staffList);
        setOrganizationUsers(organizationUserList);

        /*
         * Only active/non-deleted stores should be presented.
         */
        setStores(storeList.filter((store) => !store.isDeleted));

        setStaffStatuses(staffStatusList);
        setCountries(countryList);
        setUsers(userList);
        setUserStatuses(userStatusList);

        setStaffAssignments(assignmentList.filter((item) => !item.isDeleted));
      } catch (error) {
        if (!mounted) {
          return;
        }

        Alert.alert(
          "Unable to load staff",
          error instanceof Error ? error.message : "Unable to load staff.",
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

  const getRoleName = (role: StaffRole) => {
    switch (role) {
      case StaffRole.OWNER:
        return "Owner";

      case StaffRole.MANAGER:
        return "Manager";

      case StaffRole.STAFF:
        return "Staff";

      default:
        return role;
    }
  };

  const getStoreName = (storeId?: string) => {
    if (!storeId) {
      return "—";
    }

    return stores.find((store) => store.id === storeId)?.name ?? "Unknown";
  };

  const getStatusName = (statusId: string) =>
    staffStatuses.find((item) => item.id === statusId)?.statusName ?? "Unknown";

  /*
   * Returns all stores associated with a Staff record.
   *
   * Primary Store is also included for backward compatibility
   * with records created before StaffStoreAssignment existed.
   */
  const getAssociatedStoreIds = (staffId: string): string[] => {
    const assignmentIds = staffAssignments
      .filter(
        (assignment) => assignment.staffId === staffId && !assignment.isDeleted,
      )
      .map((assignment) => assignment.storeId);

    const staffRecord = staff.find((item) => item.id === staffId);

    if (staffRecord?.storeId && !assignmentIds.includes(staffRecord.storeId)) {
      assignmentIds.unshift(staffRecord.storeId);
    }

    return Array.from(new Set(assignmentIds));
  };

  const columns = useMemo<DataTableColumn<Staff>[]>(
    () => [
      {
        key: "staffCode",
        title: "Staff Code",
        width: 120,
      },

      {
        key: "fullName",
        title: "Staff Name",
        width: 220,

        render: (item) => (
          <Text variant="body" color="text">
            {getStaffName(item, organizationUsers, users)}
          </Text>
        ),
      },

      {
        key: "designation",
        title: "Designation",
        width: 180,

        render: (item) => (
          <Text variant="body" color="text">
            {item.designation || "—"}
          </Text>
        ),
      },

      {
        key: "storeId",
        title: "Primary Store",
        width: 220,

        render: (item) => (
          <Text variant="body" color="text">
            {getStoreName(item.storeId)}
          </Text>
        ),
      },

      {
        key: "role",
        title: "Role",
        width: 120,

        render: (item) => (
          <Text variant="body" color="text">
            {getRoleName(item.role)}
          </Text>
        ),
      },

      {
        key: "staffStatusId",
        title: "Status",
        width: 120,

        render: (item) => (
          <Text variant="body" color="text">
            {getStatusName(item.staffStatusId)}
          </Text>
        ),
      },
    ],
    [stores, staffStatuses, organizationUsers, users],
  );

  const createEmptyStaff = (): Staff => {
    const now = new Date().toISOString();

    const activeStatusId =
      staffStatuses.find(
        (status) => status.statusName.trim().toLowerCase() === "active",
      )?.id ?? "staff-status-active";

    return {
      id: `staff-${Date.now()}`,

      organizationId: organization.id,

      organizationUserId: "",

      staffCode: generateStaffCode(staff),

      designation: undefined,

      /*
       * Do not assume the first store is the
       * primary store.
       *
       * The user must explicitly select it.
       */
      storeId: undefined,

      joiningDate: now.substring(0, 10),

      relievingDate: undefined,

      staffStatusId: activeStatusId,

      role: StaffRole.STAFF,

      capabilities: [],

      isActive: true,

      createdAt: now,
      createdBy: "user-system",

      updatedAt: now,
      updatedBy: "user-system",

      isDeleted: false,

      versionNo: 1,
    };
  };

  const handleCreateUser = async (input: CreateUserInput): Promise<User> => {
    const created = await services.organization.createUser(input);

    setUsers((current) => [...current, created]);

    return created;
  };

  const handleCreateOrganizationUser = async (
    organizationUser: OrganizationUser,
  ): Promise<OrganizationUser> => {
    const created = await services.organization.createOrganizationUser(
      organization.id,
      organizationUser,
    );

    setOrganizationUsers((current) => [...current, created]);

    return created;
  };

  /*
   * Save the complete StaffStoreAssignment
   * collection for the Staff record.
   */
  const saveStaffStoreAssignments = async (
    staffRecord: Staff,
    selectedStoreIds: string[],
  ) => {
    /*
     * Remove duplicates and ignore empty values.
     */
    const uniqueStoreIds = Array.from(
      new Set(selectedStoreIds.filter(Boolean)),
    );

    /*
     * The Primary Store must always
     * belong to the associated-store set.
     */
    if (staffRecord.storeId && !uniqueStoreIds.includes(staffRecord.storeId)) {
      uniqueStoreIds.unshift(staffRecord.storeId);
    }

    const allAssignments =
      await services.organization.listStaffStoreAssignments(organization.id);

    const currentAssignments = allAssignments.filter(
      (item) => item.staffId === staffRecord.id && !item.isDeleted,
    );

    const currentIds = new Set(currentAssignments.map((item) => item.storeId));

    const desiredIds = new Set(uniqueStoreIds);

    /*
     * CREATE missing associations.
     */
    for (const storeId of desiredIds) {
      if (currentIds.has(storeId)) {
        continue;
      }

      const now = new Date().toISOString();

      const assignment: StaffStoreAssignment = {
        id: `staff-store-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}`,

        organizationId: organization.id,

        staffId: staffRecord.id,

        storeId,

        assignmentStatusId: "status-active",

        effectiveDate: staffRecord.joiningDate,

        endDate: undefined,

        createdAt: now,
        createdBy: "user-system",

        updatedAt: now,
        updatedBy: "user-system",

        isDeleted: false,

        versionNo: 1,
      };

      await services.organization.createStaffStoreAssignment(
        organization.id,
        assignment,
      );
    }

    /*
     * SOFT DELETE associations which
     * are no longer selected.
     */
    for (const assignment of currentAssignments) {
      if (desiredIds.has(assignment.storeId)) {
        continue;
      }

      await services.organization.deleteStaffStoreAssignment(
        organization.id,
        assignment.id,
      );
    }

    /*
     * Reload from persistence so React state
     * exactly matches the persisted source.
     */
    const refreshed = await services.organization.listStaffStoreAssignments(
      organization.id,
    );

    setStaffAssignments(refreshed.filter((item) => !item.isDeleted));
  };

  const handleSave = async (
    updatedStaff: Staff,
    selectedStoreIds: string[],
  ) => {
    try {
      const existing = staff.some((item) => item.id === updatedStaff.id);

      let savedStaff: Staff;

      if (existing) {
        savedStaff = await services.organization.updateStaff(
          organization.id,
          updatedStaff,
        );

        setStaff((current) =>
          current.map((item) =>
            item.id === savedStaff.id ? savedStaff : item,
          ),
        );
      } else {
        savedStaff = await services.organization.createStaff(
          organization.id,
          updatedStaff,
        );

        setStaff((current) => [...current, savedStaff]);
      }

      await saveStaffStoreAssignments(savedStaff, selectedStoreIds);

      setFormVisible(false);
      setEditingStaff(null);
    } catch (error) {
      Alert.alert(
        "Unable to save staff",
        error instanceof Error ? error.message : "Unable to save staff.",
      );
    }
  };

  const handleAdd = () => {
    const newStaff = createEmptyStaff();

    setEditingStaff(newStaff);
    setFormVisible(true);
  };

  const handleEdit = (item: Staff) => {
    setEditingStaff(item);
    setFormVisible(true);
  };

  const closeForm = () => {
    setFormVisible(false);
    setEditingStaff(null);
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
            Staff
          </Text>

          <Text variant="bodySmall" color="textMuted">
            Manage staff members, store assignments and access roles.
          </Text>
        </View>

        <Pressable onPress={handleAdd} style={styles.addButton}>
          <Text variant="body" color="background">
            + Add Staff
          </Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <Text variant="body" color="textMuted">
            Loading staff...
          </Text>
        </View>
      ) : (
        <DataTable
          columns={columns}
          data={staff.filter((item) => !item.isDeleted)}
          keyExtractor={(item) => item.id}
          emptyMessage="No staff configured."
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
        onClose={closeForm}
        title={
          editingStaff && staff.some((item) => item.id === editingStaff.id)
            ? "Edit Staff"
            : "Add Staff"
        }
        scrollable
        testID="staff-form-modal"
      >
        {editingStaff ? (
          <StaffForm
            staff={editingStaff}
            users={users}
            userStatuses={userStatuses}
            organizationUsers={organizationUsers}
            existingStaff={staff}
            stores={stores}
            staffStatuses={staffStatuses}
            countries={countries}
            associatedStoreIds={getAssociatedStoreIds(editingStaff.id)}
            onCreateUser={handleCreateUser}
            onCreateOrganizationUser={handleCreateOrganizationUser}
            onSave={handleSave}
            onCancel={closeForm}
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
