import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import {
  services,
  type Customer,
  type ID,
  type OrganizationUser,
  type Store,
  type UserAcquisition,
} from "@/src/core";

import { useBusiness } from "@/src/providers";

import { DataTable, DataTableColumn, Text } from "@/src/ui";

import { CustomerForm } from "@/src/ui/admin/CustomerForm";
import { Input } from "@/src/ui/Input";

type CustomerRow = {
  organizationUser: OrganizationUser;
  customer: Customer;
};

type ProspectRow = {
  customer: Customer;
  acquisition: UserAcquisition;
  store: Store | undefined;
};

type SelectedCustomer = {
  customer: Customer;
  type: "EXISTING" | "PROSPECTIVE";
  organizationUser?: OrganizationUser;
  acquisition?: UserAcquisition;
  store?: Store;
};

export default function OrgAdminCustomers() {
  const { organization } = useBusiness();

  const mountedRef = useRef(true);

  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [prospects, setProspects] = useState<ProspectRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [stores, setStores] = useState<Store[]>([]);

  const [showCustomerForm, setShowCustomerForm] = useState(false);

  const [selectedCustomer, setSelectedCustomer] =
    useState<SelectedCustomer | null>(null);

  /*
   * ------------------------------------------------------------
   * Load Customers
   * ------------------------------------------------------------
   *
   * UI consumes provider-neutral services only.
   *
   * The actual implementation may be:
   *   - mock/in-memory
   *   - API-backed
   *   - another implementation
   *
   * The screen does not need to know which one.
   */
  const loadCustomers = useCallback(async () => {
    if (!mountedRef.current) {
      return;
    }

    setLoading(true);

    try {
      const [organizationUsers, organizationStores] = await Promise.all([
        services.organization.listOrganizationUsers(organization.id),
        services.organization.listStores(organization.id),
      ]);

      if (!mountedRef.current) {
        return;
      }

      setStores(organizationStores);

      /*
       * ----------------------------------------------------------
       * Existing Customers
       * ----------------------------------------------------------
       *
       * A person is an actual customer of this organization
       * only when there is an OrganizationUser relationship
       * whose type is CUSTOMER.
       */
      const customerUsers = organizationUsers.filter(
        (item) =>
          !item.isDeleted &&
          item.organizationUserTypeId === "org-user-type-customer",
      );

      const resolvedCustomers = await Promise.all(
        customerUsers.map(async (organizationUser) => {
          const customer = await services.customer.getCustomer(
            organizationUser.userId,
          );

          if (!customer) {
            return null;
          }

          return {
            organizationUser,
            customer,
          };
        }),
      );

      const existingCustomers = resolvedCustomers.filter(
        (item): item is CustomerRow => item !== null,
      );

      /*
       * ----------------------------------------------------------
       * Prospective Customers
       * ----------------------------------------------------------
       *
       * A prospective customer:
       *
       *   1. Has a global Customer/User record.
       *   2. Has a UserAcquisition for this organization.
       *   3. Does NOT yet have an OrganizationUser CUSTOMER
       *      relationship.
       */
      const acquisitions = await services.userAcquisition.listByOrganization(
        organization.id,
      );

      const existingCustomerUserIds = new Set(
        customerUsers.map((item) => item.userId),
      );

      const storeMap = new Map<ID, Store>(
        organizationStores.map((store) => [store.id, store]),
      );

      const acquisitionRows = await Promise.all(
        acquisitions
          .filter(
            (acquisition) => !existingCustomerUserIds.has(acquisition.userId),
          )
          .map(async (acquisition) => {
            const customer = await services.customer.getCustomer(
              acquisition.userId,
            );

            if (!customer) {
              return null;
            }

            const store = acquisition.sourceStoreId
              ? storeMap.get(acquisition.sourceStoreId)
              : undefined;

            return {
              customer,
              acquisition,
              store,
            };
          }),
      );

      const prospectiveCustomers: ProspectRow[] = acquisitionRows.filter(
        (item): item is ProspectRow => item !== null,
      );

      if (!mountedRef.current) {
        return;
      }

      setRows(existingCustomers);
      setProspects(prospectiveCustomers);
    } catch (error) {
      if (!mountedRef.current) {
        return;
      }

      Alert.alert(
        "Unable to load customers",
        error instanceof Error ? error.message : "Unable to load customers.",
      );
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [organization.id]);

  useEffect(() => {
    mountedRef.current = true;

    void loadCustomers();

    return () => {
      mountedRef.current = false;
    };
  }, [loadCustomers]);

  /*
   * ------------------------------------------------------------
   * Search
   * ------------------------------------------------------------
   */
  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return rows;
    }

    return rows.filter(({ customer }) => {
      return (
        customer.fullName.toLowerCase().includes(query) ||
        customer.email?.toLowerCase().includes(query) ||
        customer.phone?.toLowerCase().includes(query)
      );
    });
  }, [rows, search]);

  const filteredProspects = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return prospects;
    }

    return prospects.filter(({ customer }) => {
      return (
        customer.fullName.toLowerCase().includes(query) ||
        customer.email?.toLowerCase().includes(query) ||
        customer.phone?.toLowerCase().includes(query)
      );
    });
  }, [prospects, search]);

  /*
   * ------------------------------------------------------------
   * Existing Customer Status
   * ------------------------------------------------------------
   */
  const getRelationshipStatus = (row: CustomerRow) => {
    const status = row.organizationUser.organizationUserStatusId;

    switch (status) {
      case "organization-user-type-customer":
      case "organization-user-status-active":
      case "status-active":
        return "Active";

      case "organization-user-status-inactive":
      case "status-inactive":
        return "Inactive";

      case "organization-user-status-suspended":
      case "status-suspended":
        return "Suspended";

      default:
        return status || "Unknown";
    }
  };

  /*
   * ------------------------------------------------------------
   * Existing Customer Columns
   * ------------------------------------------------------------
   */
  const customerColumns = useMemo<DataTableColumn<CustomerRow>[]>(
    () => [
      {
        key: "fullName",
        title: "Customer",
        width: 220,
        render: (item) => (
          <View style={styles.customerCell}>
            <Text variant="bodyStrong" color="text">
              {item.customer.fullName}
            </Text>

            <Text variant="caption" color="textMuted">
              Joined {item.organizationUser.joiningDate}
            </Text>
          </View>
        ),
      },

      {
        key: "email",
        title: "Email",
        width: 240,
        render: (item) => (
          <Text variant="body" color="text">
            {item.customer.email ?? "—"}
          </Text>
        ),
      },

      {
        key: "phone",
        title: "Phone",
        width: 160,
        render: (item) => (
          <Text variant="body" color="text">
            {item.customer.phone ?? "—"}
          </Text>
        ),
      },

      {
        key: "status",
        title: "Status",
        width: 140,
        render: (item) => (
          <Text variant="body" color="text">
            {getRelationshipStatus(item)}
          </Text>
        ),
      },
    ],
    [],
  );

  /*
   * ------------------------------------------------------------
   * Prospective Customer Columns
   * ------------------------------------------------------------
   */
  const prospectColumns = useMemo<DataTableColumn<ProspectRow>[]>(
    () => [
      {
        key: "fullName",
        title: "Prospective Customer",
        width: 220,
        render: (item) => (
          <View style={styles.customerCell}>
            <Text variant="bodyStrong" color="text">
              {item.customer.fullName}
            </Text>

            <Text variant="caption" color="textMuted">
              Global user
            </Text>
          </View>
        ),
      },

      {
        key: "email",
        title: "Email",
        width: 240,
        render: (item) => (
          <Text variant="body" color="text">
            {item.customer.email ?? "—"}
          </Text>
        ),
      },

      {
        key: "phone",
        title: "Phone",
        width: 160,
        render: (item) => (
          <Text variant="body" color="text">
            {item.customer.phone ?? "—"}
          </Text>
        ),
      },

      {
        key: "source",
        title: "Source",
        width: 180,
        render: (item) => (
          <View style={styles.customerCell}>
            <Text variant="body" color="text">
              {item.acquisition.registrationSource}
            </Text>

            <Text variant="caption" color="textMuted">
              {item.acquisition.registrationChannel}
            </Text>
          </View>
        ),
      },

      {
        key: "store",
        title: "Source Store",
        width: 220,
        render: (item) => (
          <Text variant="body" color="text">
            {item.store?.name ?? "—"}
          </Text>
        ),
      },
    ],
    [],
  );

  /*
   * ------------------------------------------------------------
   * Add Prospective Customer
   * ------------------------------------------------------------
   *
   * This does NOT create OrganizationUser.
   *
   * The CustomerForm gives us a Customer draft and an
   * acquisition draft.
   *
   * We first determine whether that global user already exists.
   *
   * Only after resolving the global identity do we create the
   * acquisition record.
   */
  const handleSaveCustomer = async (
    draftCustomer: Customer,
    draftAcquisition: UserAcquisition,
  ) => {
    try {
      let emailMatch: Customer | null = null;
      let phoneMatch: Customer | null = null;

      /*
       * Check email.
       */
      if (draftCustomer.email) {
        const matches = await services.customer.findCustomers({
          email: draftCustomer.email,
        });

        emailMatch = matches[0] ?? null;
      }

      /*
       * Check phone.
       */
      if (draftCustomer.phone) {
        const matches = await services.customer.findCustomers({
          phone: draftCustomer.phone,
        });

        phoneMatch = matches[0] ?? null;
      }

      /*
       * ----------------------------------------------------------
       * Conflict:
       *
       * Email belongs to one global user while phone belongs
       * to another.
       * ----------------------------------------------------------
       */
      if (emailMatch && phoneMatch && emailMatch.id !== phoneMatch.id) {
        Alert.alert(
          "Potential Duplicate Conflict",
          "The email address and phone number belong to different existing users. Please review the details before adding this prospect.",
        );

        return;
      }

      /*
       * If either identifier found an existing global user,
       * use that global user.
       */
      const existingCustomer = emailMatch ?? phoneMatch;

      if (existingCustomer) {
        /*
         * Check whether this organization already has an
         * acquisition for this user.
         */
        const existingAcquisitions = await services.userAcquisition.getByUser(
          existingCustomer.id,
        );

        const alreadyAcquired = existingAcquisitions.some(
          (item) => !item.isDeleted && item.organizationId === organization.id,
        );

        if (alreadyAcquired) {
          Alert.alert(
            "Already a Prospect",
            `${existingCustomer.fullName} is already a prospective customer for this organization.`,
          );

          return;
        }

        const acquisition: UserAcquisition = {
          ...draftAcquisition,
          id: `user-acq-${Date.now().toString(36)}`,
          userId: existingCustomer.id,
          organizationId: organization.id,
        };

        await services.userAcquisition.createAcquisition(acquisition);

        setShowCustomerForm(false);

        await loadCustomers();

        Alert.alert(
          "Prospective Customer Added",
          `${existingCustomer.fullName} already existed as a global user. The user has now been added as a prospective customer for this organization.`,
        );

        return;
      }

      /*
       * ----------------------------------------------------------
       * No global user exists.
       *
       * Create the global Customer first.
       * ----------------------------------------------------------
       */
      const createdCustomer = await services.customer.createCustomer({
        fullName: draftCustomer.fullName,
        email: draftCustomer.email,
        phone: draftCustomer.phone,
      });

      /*
       * Now create the organization-specific acquisition
       * record pointing to the newly created global user.
       */
      const acquisition: UserAcquisition = {
        ...draftAcquisition,
        id: `user-acq-${Date.now().toString(36)}`,
        userId: createdCustomer.id,
        organizationId: organization.id,
      };

      await services.userAcquisition.createAcquisition(acquisition);

      setShowCustomerForm(false);

      await loadCustomers();

      Alert.alert(
        "Prospective Customer Added",
        `${createdCustomer.fullName} has been added as a prospective customer.`,
      );
    } catch (error) {
      Alert.alert(
        "Unable to add prospect",
        error instanceof Error ? error.message : "Unable to add prospect.",
      );
    }
  };

  /*
   * ------------------------------------------------------------
   * View Existing Customer
   * ------------------------------------------------------------
   */
  const viewExistingCustomer = (item: CustomerRow) => {
    setSelectedCustomer({
      customer: item.customer,
      type: "EXISTING",
      organizationUser: item.organizationUser,
    });
  };

  /*
   * ------------------------------------------------------------
   * View Prospective Customer
   * ------------------------------------------------------------
   */
  const viewProspectiveCustomer = (item: ProspectRow) => {
    setSelectedCustomer({
      customer: item.customer,
      type: "PROSPECTIVE",
      acquisition: item.acquisition,
      store: item.store,
    });
  };

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.screen}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text variant="title" color="text">
              Customers
            </Text>

            <Text variant="bodySmall" color="textMuted">
              Manage customers and prospective customers associated with your
              organization.
            </Text>
          </View>

          <Pressable
            onPress={() => setShowCustomerForm(true)}
            style={({ pressed }) => [
              styles.addButton,
              {
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <Text variant="body" color="background">
              + Add Customer
            </Text>
          </Pressable>
        </View>

        <View style={styles.searchContainer}>
          <Text variant="label" color="textSecondary">
            Search Customers
          </Text>

          <Input
            value={search}
            onChangeText={setSearch}
            placeholder="Search by name, email or phone"
          />
        </View>

        {loading ? (
          <View style={styles.center}>
            <Text variant="body" color="textMuted">
              Loading customers...
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionHeaderText}>
                  <Text variant="h2" color="text">
                    Existing Customers
                  </Text>

                  <Text variant="bodySmall" color="textMuted">
                    Customers who have an organization-customer relationship.
                  </Text>
                </View>

                <View style={styles.countBadge}>
                  <Text variant="label" color="primary">
                    {filteredRows.length}
                  </Text>
                </View>
              </View>

              <DataTable
                columns={customerColumns}
                data={filteredRows}
                keyExtractor={(item) => item.organizationUser.id}
                emptyMessage={
                  search.trim()
                    ? "No existing customers match your search."
                    : "No customers associated with this organization."
                }
                actions={[
                  {
                    label: "View",
                    onPress: viewExistingCustomer,
                  },
                ]}
              />
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionHeaderText}>
                  <Text variant="h2" color="text">
                    Prospective Customers
                  </Text>

                  <Text variant="bodySmall" color="textMuted">
                    Global users acquired by this organization who have not yet
                    become customers.
                  </Text>
                </View>

                <View style={styles.countBadge}>
                  <Text variant="label" color="primary">
                    {filteredProspects.length}
                  </Text>
                </View>
              </View>

              <DataTable
                columns={prospectColumns}
                data={filteredProspects}
                keyExtractor={(item) => item.customer.id}
                emptyMessage={
                  search.trim()
                    ? "No prospective customers match your search."
                    : "No prospective customers found."
                }
                actions={[
                  {
                    label: "View",
                    onPress: viewProspectiveCustomer,
                  },
                ]}
              />
            </View>
          </>
        )}
      </ScrollView>

      <Modal
        visible={showCustomerForm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCustomerForm(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.formModal}>
            <View style={styles.modalHeader}>
              <View style={styles.headerText}>
                <Text variant="h2" color="text">
                  Add Prospective Customer
                </Text>

                <Text variant="bodySmall" color="textMuted">
                  Add a person for future engagement. This does not create an
                  organization-customer relationship.
                </Text>
              </View>

              <Pressable
                onPress={() => setShowCustomerForm(false)}
                style={styles.closeButton}
              >
                <Text variant="body" color="textMuted">
                  ✕
                </Text>
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <CustomerForm
                organizationId={organization.id}
                stores={stores}
                onSave={handleSaveCustomer}
                onCancel={() => setShowCustomerForm(false)}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={selectedCustomer !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedCustomer(null)}
      >
        {selectedCustomer ? (
          <View style={styles.modalOverlay}>
            <View style={styles.viewModal}>
              <View style={styles.modalHeader}>
                <View style={styles.headerText}>
                  <View style={styles.customerTitleRow}>
                    <Text variant="h2" color="text">
                      {selectedCustomer.customer.fullName}
                    </Text>

                    <View
                      style={[
                        styles.typeBadge,
                        selectedCustomer.type === "EXISTING"
                          ? styles.existingBadge
                          : styles.prospectBadge,
                      ]}
                    >
                      <Text variant="caption" color="text">
                        {selectedCustomer.type === "EXISTING"
                          ? "Existing Customer"
                          : "Prospective Customer"}
                      </Text>
                    </View>
                  </View>

                  <Text variant="bodySmall" color="textMuted">
                    Customer details
                  </Text>
                </View>

                <Pressable
                  onPress={() => setSelectedCustomer(null)}
                  style={styles.closeButton}
                >
                  <Text variant="body" color="textMuted">
                    ✕
                  </Text>
                </Pressable>
              </View>

              <View style={styles.detailsGrid}>
                <DetailItem
                  label="Name"
                  value={selectedCustomer.customer.fullName}
                />

                <DetailItem
                  label="Email"
                  value={selectedCustomer.customer.email ?? "—"}
                />

                <DetailItem
                  label="Phone"
                  value={selectedCustomer.customer.phone ?? "—"}
                />

                <DetailItem
                  label="Global User ID"
                  value={selectedCustomer.customer.id}
                />
              </View>

              {selectedCustomer.type === "EXISTING" ? (
                <View style={styles.infoCard}>
                  <Text variant="bodyStrong" color="text">
                    Organization Relationship
                  </Text>

                  <DetailItem
                    label="Status"
                    value={
                      selectedCustomer.organizationUser
                        ? getRelationshipStatus({
                            organizationUser: selectedCustomer.organizationUser,
                            customer: selectedCustomer.customer,
                          })
                        : "—"
                    }
                  />

                  <DetailItem
                    label="Joined"
                    value={
                      selectedCustomer.organizationUser?.joiningDate ?? "—"
                    }
                  />

                  <DetailItem
                    label="Organization User ID"
                    value={selectedCustomer.organizationUser?.id ?? "—"}
                  />
                </View>
              ) : (
                <View style={styles.infoCard}>
                  <Text variant="bodyStrong" color="text">
                    Acquisition Information
                  </Text>

                  <DetailItem
                    label="Registration Source"
                    value={
                      selectedCustomer.acquisition?.registrationSource ?? "—"
                    }
                  />

                  <DetailItem
                    label="Registration Channel"
                    value={
                      selectedCustomer.acquisition?.registrationChannel ?? "—"
                    }
                  />

                  <DetailItem
                    label="Source Store"
                    value={selectedCustomer.store?.name ?? "—"}
                  />

                  <DetailItem
                    label="Acquired On"
                    value={
                      selectedCustomer.acquisition?.createdAt
                        ? new Date(
                            selectedCustomer.acquisition.createdAt,
                          ).toLocaleDateString()
                        : "—"
                    }
                  />

                  <View style={styles.prospectNote}>
                    <Text variant="bodySmall" color="textMuted">
                      This person is currently a prospective customer. The
                      customer relationship should be created through the
                      subscription or purchase workflow.
                    </Text>
                  </View>
                </View>
              )}

              <View style={styles.modalActions}>
                <Pressable
                  onPress={() => setSelectedCustomer(null)}
                  style={styles.secondaryButton}
                >
                  <Text variant="body" color="text">
                    Close
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}
      </Modal>
    </>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailItem}>
      <Text variant="caption" color="textMuted">
        {label}
      </Text>

      <Text variant="body" color="text">
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },

  screen: {
    padding: 24,
    gap: 28,
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

  searchContainer: {
    gap: 8,
    maxWidth: 500,
  },

  section: {
    gap: 14,
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },

  sectionHeaderText: {
    flex: 1,
    gap: 4,
  },

  countBadge: {
    minWidth: 34,
    height: 30,
    paddingHorizontal: 10,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#CCFBF1",
  },

  customerCell: {
    gap: 2,
  },

  center: {
    minHeight: 160,
    alignItems: "center",
    justifyContent: "center",
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.35)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },

  formModal: {
    width: "100%",
    maxWidth: 760,
    maxHeight: "90%",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 24,
    gap: 24,
  },

  viewModal: {
    width: "100%",
    maxWidth: 620,
    maxHeight: "90%",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 24,
    gap: 24,
  },

  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
  },

  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
  },

  customerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
  },

  typeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },

  existingBadge: {
    backgroundColor: "#DCFCE7",
  },

  prospectBadge: {
    backgroundColor: "#FEF3C7",
  },

  detailsGrid: {
    gap: 16,
  },

  detailItem: {
    gap: 3,
  },

  infoCard: {
    gap: 14,
    padding: 18,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#F9FAFB",
  },

  prospectNote: {
    marginTop: 4,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },

  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 4,
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
