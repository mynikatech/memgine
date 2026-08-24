import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";

import type {
  OrganizationUser,
  ReferenceDataItem,
  Status,
  Staff,
  Store,
} from "@/src/core";
import { StaffRole, services } from "@/src/core";

import { useBusiness } from "@/src/providers";
import { DataTable, DataTableColumn, Modal, Text } from "@/src/ui";

import { StaffForm } from "@/src/ui/admin/StaffForm";

export default function OrgAdminStaff() {
  const { organization } = useBusiness();

  const [staff, setStaff] = useState<Staff[]>([]);
  const [organizationUsers, setOrganizationUsers] = useState<
    OrganizationUser[]
  >([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [staffStatuses, setStaffStatuses] = useState<Status[]>([]);

  const [loading, setLoading] = useState(true);
  const [formVisible, setFormVisible] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);

      try {
        const [staffList, userList, storeList, statusList] = await Promise.all([
          services.organization.listStaff(organization.id),
          services.organization.listOrganizationUsers(organization.id),
          services.organization.listStores(organization.id),
          services.status.listStaffStatuses(),
        ]);

        if (!mounted) {
          return;
        }

        setStaff(staffList);
        setOrganizationUsers(userList);
        setStores(storeList);
        setStaffStatuses(statusList);
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
      return "All stores";
    }

    return stores.find((store) => store.id === storeId)?.name ?? "Unknown";
  };

  const getStatusName = (statusId: string) =>
    staffStatuses.find((item) => item.id === statusId)?.statusName ?? "Unknown";

  const getUserName = (organizationUserId: string, staffName: string) => {
    /*
     * The global User entity is not yet part of the mock layer,
     * so Staff.fullName remains the display name for now.
     */
    const user = organizationUsers.find(
      (item) => item.id === organizationUserId,
    );

    return user ? staffName : staffName;
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
            {getUserName(item.organizationUserId, item.fullName)}
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
    [stores, staffStatuses, organizationUsers],
  );

  const createEmptyStaff = (): Staff => {
    const now = new Date().toISOString();

    return {
      id: `staff-${Date.now()}`,

      organizationId: organization.id,

      organizationUserId: "",

      staffCode: "",
      fullName: "",
      designation: undefined,

      storeId: stores.length > 0 ? stores[0].id : undefined,

      joiningDate: now.substring(0, 10),
      relievingDate: undefined,

      staffStatusId: "staff-status-active",

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

  const handleAdd = () => {
    setEditingStaff(createEmptyStaff());
    setFormVisible(true);
  };

  const handleEdit = (item: Staff) => {
    setEditingStaff(item);
    setFormVisible(true);
  };

  const handleSave = async (updatedStaff: Staff) => {
    try {
      const existing = staff.some((item) => item.id === updatedStaff.id);

      if (existing) {
        const updated = await services.organization.updateStaff(
          organization.id,
          updatedStaff,
        );

        setStaff((current) =>
          current.map((item) => (item.id === updated.id ? updated : item)),
        );
      } else {
        const created = await services.organization.createStaff(
          organization.id,
          updatedStaff,
        );

        setStaff((current) => [...current, created]);
      }

      setFormVisible(false);
      setEditingStaff(null);
    } catch (error) {
      Alert.alert(
        "Unable to save staff",
        error instanceof Error ? error.message : "Unable to save staff.",
      );
    }
  };

  const handleCreateOrganizationUser = async (user: OrganizationUser) => {
    try {
      const created = await services.organization.createOrganizationUser(
        organization.id,
        user,
      );

      setOrganizationUsers((current) => [...current, created]);

      return created;
    } catch (error) {
      Alert.alert(
        "Unable to add user",
        error instanceof Error ? error.message : "Unable to add user.",
      );

      throw error;
    }
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

        <Pressable
          onPress={handleAdd}
          style={({ pressed }) => [
            styles.addButton,
            {
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
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
        onClose={() => {
          setFormVisible(false);
          setEditingStaff(null);
        }}
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
            organizationUsers={organizationUsers}
            existingStaff={staff}
            stores={stores}
            staffStatuses={staffStatuses}
            onCreateOrganizationUser={handleCreateOrganizationUser}
            onSave={handleSave}
            onCancel={() => {
              setFormVisible(false);
              setEditingStaff(null);
            }}
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
