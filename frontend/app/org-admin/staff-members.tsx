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

function generateStaffCode(
  staff: Staff[],
  organizationCode: string,
  primaryStoreCode?: string,
): string {
  const numbers = staff
    .map((item) => item.staffCode?.match(/(\d+)$/)?.[1])
    .filter(Boolean)
    .map(Number);

  const next = Math.max(0, ...numbers) + 1;

  if (!primaryStoreCode) {
    return "";
  }

  return `${organizationCode}-${primaryStoreCode}-STAFF-${String(next).padStart(
    3,
    "0",
  )}`;
}

export default function OrgAdminStaff() {
  const { organization } = useBusiness();

  /* ---------------------------------------------------------------------- */
  /* PAGE MODE                                                              */
  /* ---------------------------------------------------------------------- */

  const [isEditing, setIsEditing] = useState(false);

  const [users, setUsers] = useState<User[]>([]);
  const [userStatuses, setUserStatuses] = useState<Status[]>([]);

  const [staff, setStaff] = useState<Staff[]>([]);

  const [organizationUsers, setOrganizationUsers] = useState<
    OrganizationUser[]
  >([]);

  const [stores, setStores] = useState<Store[]>([]);

  const [staffStatuses, setStaffStatuses] = useState<Status[]>([]);
  const [countries, setCountries] = useState<CountryReference[]>([]);

  const [staffAssignments, setStaffAssignments] = useState<
    StaffStoreAssignment[]
  >([]);

  const [loading, setLoading] = useState(true);

  const [formVisible, setFormVisible] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);

  /* ---------------------------------------------------------------------- */
  /* LOAD                                                                   */
  /* ---------------------------------------------------------------------- */

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

        setStores(storeList.filter((store) => !store.isDeleted));

        setStaffStatuses(staffStatusList);

        setCountries(countryList);

        setUsers(userList);

        setUserStatuses(userStatusList);

        setStaffAssignments(assignmentList.filter((item) => !item.isDeleted));

        /*
         * Every fresh load starts in View mode.
         */
        setIsEditing(false);
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

  /* ---------------------------------------------------------------------- */
  /* DISPLAY HELPERS                                                        */
  /* ---------------------------------------------------------------------- */

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

  /* ---------------------------------------------------------------------- */
  /* STORE ASSIGNMENTS                                                      */
  /* ---------------------------------------------------------------------- */

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

  /* ---------------------------------------------------------------------- */
  /* TABLE                                                                   */
  /* ---------------------------------------------------------------------- */

  const columns = useMemo<DataTableColumn<Staff>[]>(
    () => [
      {
        key: "staffCode",
        title: "Staff Code",
        width: 260,
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

  /* ---------------------------------------------------------------------- */
  /* NEW STAFF                                                               */
  /* ---------------------------------------------------------------------- */

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

      /*
       * Staff Code is generated by StaffForm once
       * Primary Store has been selected.
       */
      staffCode: "",

      designation: undefined,

      storeId: undefined,

      joiningDate: now.substring(0, 10),

      relievingDate: undefined,

      /*
       * New Staff is always Active.
       */
      staffStatusId: activeStatusId,

      role: StaffRole.STAFF,

      capabilities: [],

      isActive: true,

      createdAt: now,
      createdBy: organization.updatedBy ?? organization.id,

      updatedAt: now,
      updatedBy: organization.updatedBy,

      isDeleted: false,

      versionNo: 1,
    };
  };

  /* ---------------------------------------------------------------------- */
  /* USER CREATION                                                           */
  /* ---------------------------------------------------------------------- */

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

  /* ---------------------------------------------------------------------- */
  /* STAFF STORE ASSIGNMENTS                                                */
  /* ---------------------------------------------------------------------- */

  const saveStaffStoreAssignments = async (
    staffRecord: Staff,
    selectedStoreIds: string[],
  ) => {
    const uniqueStoreIds = Array.from(
      new Set(selectedStoreIds.filter(Boolean)),
    );

    /*
     * Primary Store must always be included.
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
     * CREATE new associations.
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
        createdBy: organization.updatedBy ?? organization.id,

        updatedAt: now,
        updatedBy: organization.updatedBy,

        isDeleted: false,

        versionNo: 1,
      };

      await services.organization.createStaffStoreAssignment(
        organization.id,
        assignment,
      );
    }

    /*
     * SOFT DELETE associations no longer selected.
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
     * Reload persisted assignments.
     */
    const refreshed = await services.organization.listStaffStoreAssignments(
      organization.id,
    );

    setStaffAssignments(refreshed.filter((item) => !item.isDeleted));
  };

  /* ---------------------------------------------------------------------- */
  /* STAFF FORM SAVE                                                        */
  /* ---------------------------------------------------------------------- */

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

  /* ---------------------------------------------------------------------- */
  /* PAGE SAVE                                                               */
  /* ---------------------------------------------------------------------- */

  const handlePageSave = () => {
    /*
     * StaffForm already persists each Staff record when
     * its Save button is pressed.
     *
     * This page-level Save therefore completes the
     * current Edit session and returns to View mode.
     */
    closeForm();
    setIsEditing(false);
  };

  /* ---------------------------------------------------------------------- */
  /* PAGE CANCEL / DISCARD                                                  */
  /* ---------------------------------------------------------------------- */

  const handlePageCancel = () => {
    /*
     * Close any open form and leave Edit mode.
     *
     * Any Staff changes already saved through StaffForm
     * remain persisted.
     */
    closeForm();
    setIsEditing(false);
  };

  /* ---------------------------------------------------------------------- */
  /* ENTER EDIT MODE                                                        */
  /* ---------------------------------------------------------------------- */

  const handleStartEditing = () => {
    setIsEditing(true);
  };

  /* ---------------------------------------------------------------------- */
  /* ADD STAFF                                                               */
  /* ---------------------------------------------------------------------- */

  const handleAdd = () => {
    if (!isEditing) {
      return;
    }

    setEditingStaff(createEmptyStaff());

    setFormVisible(true);
  };

  /* ---------------------------------------------------------------------- */
  /* EDIT STAFF                                                              */
  /* ---------------------------------------------------------------------- */

  const handleEdit = (item: Staff) => {
    if (!isEditing) {
      return;
    }

    setEditingStaff(item);

    setFormVisible(true);
  };

  /* ---------------------------------------------------------------------- */
  /* CLOSE FORM                                                              */
  /* ---------------------------------------------------------------------- */

  const closeForm = () => {
    setFormVisible(false);
    setEditingStaff(null);
  };

  /* ---------------------------------------------------------------------- */
  /* SUMMARY                                                                 */
  /* ---------------------------------------------------------------------- */

  const activeStaffCount = useMemo(
    () =>
      staff.filter((item) => {
        if (item.isDeleted) {
          return false;
        }

        const status = staffStatuses.find(
          (statusItem) => statusItem.id === item.staffStatusId,
        );

        return status?.statusName.trim().toLowerCase() === "active";
      }).length,
    [staff, staffStatuses],
  );

  const visibleStaff = useMemo(
    () => staff.filter((item) => !item.isDeleted),
    [staff],
  );

  /* ---------------------------------------------------------------------- */
  /* RENDER                                                                  */
  /* ---------------------------------------------------------------------- */

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.screen}
      showsVerticalScrollIndicator={false}
    >
      {/* ================================================================== */}
      {/* HEADER                                                              */}
      {/* ================================================================== */}

      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text variant="title" color="text">
            Staff
          </Text>

          <Text variant="bodySmall" color="textMuted">
            Manage staff members, roles and store assignments.
          </Text>
        </View>

        <View style={styles.headerActions}>
          {!isEditing ? (
            /*
             * VIEW MODE
             */
            <Pressable
              onPress={handleStartEditing}
              style={({ pressed }) => [
                styles.primaryButton,
                {
                  opacity: pressed ? 0.78 : 1,
                },
              ]}
            >
              <Text variant="body" color="background">
                Edit
              </Text>
            </Pressable>
          ) : (
            /*
             * EDIT MODE
             */
            <>
              <Pressable
                onPress={handlePageCancel}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  {
                    opacity: pressed ? 0.78 : 1,
                  },
                ]}
              >
                <Text variant="body" color="text">
                  Cancel
                </Text>
              </Pressable>

              <Pressable
                onPress={handlePageSave}
                style={({ pressed }) => [
                  styles.primaryButton,
                  {
                    opacity: pressed ? 0.78 : 1,
                  },
                ]}
              >
                <Text variant="body" color="background">
                  Save
                </Text>
              </Pressable>

              <Pressable
                onPress={handleAdd}
                style={({ pressed }) => [
                  styles.primaryButton,
                  {
                    opacity: pressed ? 0.78 : 1,
                  },
                ]}
              >
                <Text variant="body" color="background">
                  + Add Staff
                </Text>
              </Pressable>
            </>
          )}
        </View>
      </View>

      {/* ================================================================== */}
      {/* SUMMARY                                                             */}
      {/* ================================================================== */}

      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text variant="caption" color="textMuted">
            STAFF
          </Text>

          <Text variant="title" color="text">
            {visibleStaff.length}
          </Text>

          <Text variant="bodySmall" color="textMuted">
            Staff members
          </Text>
        </View>

        <View style={styles.summaryCard}>
          <Text variant="caption" color="textMuted">
            ACTIVE
          </Text>

          <Text variant="title" color="text">
            {activeStaffCount}
          </Text>

          <Text variant="bodySmall" color="textMuted">
            Currently active
          </Text>
        </View>
      </View>

      {/* ================================================================== */}
      {/* STAFF TABLE                                                         */}
      {/* ================================================================== */}

      <View style={styles.tableSection}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionHeaderText}>
            <Text variant="title" color="text">
              Staff Members
            </Text>

            <Text variant="bodySmall" color="textMuted">
              Staff members belonging to this organization.
            </Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <Text variant="body" color="textMuted">
              Loading staff...
            </Text>
          </View>
        ) : (
          <DataTable
            columns={columns}
            data={visibleStaff}
            keyExtractor={(item) => item.id}
            emptyMessage="No staff configured."
            actions={
              isEditing
                ? [
                    {
                      label: "Edit",
                      onPress: handleEdit,
                    },
                  ]
                : undefined
            }
          />
        )}
      </View>

      {/* ================================================================== */}
      {/* STAFF FORM                                                          */}
      {/* ================================================================== */}

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
            organizationCode={organization.code}
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

/* ========================================================================== */
/* STYLES                                                                     */
/* ========================================================================== */

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
    gap: 5,
  },

  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  primaryButton: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0F766E",
  },

  secondaryButton: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#CBD5E1",
  },

  summaryRow: {
    flexDirection: "row",
    gap: 16,
  },

  summaryCard: {
    flex: 1,
    minHeight: 116,
    padding: 18,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    gap: 4,
  },

  tableSection: {
    padding: 18,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    gap: 16,
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
  },

  sectionHeaderText: {
    flex: 1,
    gap: 4,
  },

  loadingContainer: {
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
  },
});
