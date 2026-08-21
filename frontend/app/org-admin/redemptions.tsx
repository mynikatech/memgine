import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";

import type {
  Benefit,
  Customer,
  OrganizationUser,
  Redemption,
  Staff,
  Status,
  Store,
  Subscription,
} from "@/src/core";

import { services } from "@/src/core";

import { useBusiness } from "@/src/providers";

import { DataTable, type DataTableColumn, Input, Text } from "@/src/ui";

/* ------------------------------------------------------------------
 * Resolved row used by this screen.
 *
 * Redemption continues to contain IDs only.
 * Related entities are resolved for presentation.
 * ------------------------------------------------------------------ */

type RedemptionRow = {
  redemption: Redemption;
  subscription: Subscription;
  benefit?: Benefit;
  organizationUser?: OrganizationUser;
  customer?: Customer;
  store?: Store;
  staff?: Staff;
  status?: Status;
};

export default function OrgAdminRedemptions() {
  const { organization } = useBusiness();

  const [rows, setRows] = useState<RedemptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [selectedRedemption, setSelectedRedemption] =
    useState<RedemptionRow | null>(null);

  /* ================================================================
     LOAD
     ================================================================ */

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);

      try {
        /*
         * Load organization-level data required to resolve
         * Redemption relationship IDs into display values.
         *
         * UI consumes only provider-neutral application services.
         */

        const [subscriptions, organizationUsers, benefits, stores, staff] =
          await Promise.all([
            services.subscription.listByOrganization(organization.id),

            services.organization.listOrganizationUsers(organization.id),

            services.benefit.listByOrganization(organization.id),

            services.organization.listStores(organization.id),

            services.organization.listStaff(organization.id),
          ]);

        if (!mounted) {
          return;
        }

        /* ------------------------------------------------------------
         * Lookup maps
         * ------------------------------------------------------------ */

        const organizationUserMap = new Map<string, OrganizationUser>(
          organizationUsers
            .filter((item) => !item.isDeleted)
            .map((item) => [item.id, item]),
        );

        const benefitMap = new Map<string, Benefit>(
          benefits
            .filter((item) => !item.isDeleted)
            .map((item) => [item.id, item]),
        );

        const storeMap = new Map<string, Store>(
          stores
            .filter((item) => !item.isDeleted)
            .map((item) => [item.id, item]),
        );

        const staffMap = new Map<string, Staff>(
          staff
            .filter((item) => !item.isDeleted)
            .map((item) => [item.id, item]),
        );

        /*
         * Customer cache.
         *
         * OrganizationUser.userId -> Customer.id
         */

        const customerMap = new Map<string, Customer>();

        /* ------------------------------------------------------------
         * Load redemptions for each subscription
         * ------------------------------------------------------------ */

        const subscriptionRedemptions = await Promise.all(
          subscriptions
            .filter((subscription) => !subscription.isDeleted)
            .map(async (subscription) => ({
              subscription,
              redemptions: await services.redemption.listBySubscription(
                subscription.id,
              ),
            })),
        );

        const resolved: RedemptionRow[] = [];

        /* ------------------------------------------------------------
         * Resolve relationships
         * ------------------------------------------------------------ */

        for (const item of subscriptionRedemptions) {
          const { subscription, redemptions } = item;

          /*
           * Subscription
           *      ↓
           * OrganizationUser
           *      ↓
           * Customer
           */

          const organizationUser = organizationUserMap.get(
            subscription.organizationUserId,
          );

          if (!organizationUser) {
            continue;
          }

          let customer = customerMap.get(organizationUser.userId);

          if (!customer) {
            customer =
              (await services.customer.getCustomer(organizationUser.userId)) ??
              undefined;

            if (customer) {
              customerMap.set(customer.id, customer);
            }
          }

          for (const redemption of redemptions) {
            if (redemption.isDeleted) {
              continue;
            }

            const benefit = benefitMap.get(redemption.benefitId);

            const store = storeMap.get(redemption.storeId);

            const staffMember = redemption.staffId
              ? staffMap.get(redemption.staffId)
              : undefined;

            /*
             * Generic Status
             *
             * redemptionStatusId -> Status
             */

            const status =
              (await services.status.getStatus(
                redemption.redemptionStatusId,
              )) ?? undefined;

            resolved.push({
              redemption,
              subscription,
              benefit,
              organizationUser,
              customer,
              store,
              staff: staffMember,
              status,
            });
          }
        }

        /*
         * Most recent redemption first.
         */

        resolved.sort(
          (a, b) =>
            new Date(b.redemption.redemptionDateTime).getTime() -
            new Date(a.redemption.redemptionDateTime).getTime(),
        );

        if (mounted) {
          setRows(resolved);
        }
      } catch (error) {
        console.error("Unable to load redemptions", error);

        if (mounted) {
          setRows([]);
        }
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

  /* ================================================================
     SEARCH
     ================================================================ */

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return rows;
    }

    return rows.filter(
      ({
        redemption,
        subscription,
        benefit,
        customer,
        store,
        staff,
        status,
      }) => {
        return (
          redemption.redemptionNumber.toLowerCase().includes(query) ||
          redemption.id.toLowerCase().includes(query) ||
          subscription.subscriptionNumber.toLowerCase().includes(query) ||
          benefit?.benefitName.toLowerCase().includes(query) ||
          benefit?.displayName?.toLowerCase().includes(query) ||
          customer?.fullName.toLowerCase().includes(query) ||
          customer?.email?.toLowerCase().includes(query) ||
          customer?.phone?.toLowerCase().includes(query) ||
          store?.name.toLowerCase().includes(query) ||
          store?.storeCode.toLowerCase().includes(query) ||
          staff?.fullName.toLowerCase().includes(query) ||
          staff?.staffCode.toLowerCase().includes(query) ||
          redemption.method.toLowerCase().includes(query) ||
          status?.statusCode.toLowerCase().includes(query) ||
          status?.statusName.toLowerCase().includes(query)
        );
      },
    );
  }, [rows, search]);

  /* ================================================================
     SUMMARY
     ================================================================ */

  const successfulCount = useMemo(
    () =>
      rows.filter(
        ({ status }) => status?.statusCode.toUpperCase() === "SUCCESS",
      ).length,
    [rows],
  );

  /* ================================================================
     TABLE COLUMNS
     ================================================================ */

  const columns = useMemo<DataTableColumn<RedemptionRow>[]>(
    () => [
      {
        key: "redemption",
        title: "Redemption",
        width: 155,
        render: (item) => (
          <Text variant="bodyStrong" color="text" numberOfLines={1}>
            {item.redemption.redemptionNumber}
          </Text>
        ),
      },

      {
        key: "customer",
        title: "Customer",
        width: 140,
        render: (item) => (
          <Text variant="body" color="text" numberOfLines={1}>
            {item.customer?.fullName ?? "Unknown Customer"}
          </Text>
        ),
      },

      {
        key: "subscription",
        title: "Subscription",
        width: 150,
        render: (item) => (
          <Text variant="body" color="text" numberOfLines={1}>
            {item.subscription.subscriptionNumber}
          </Text>
        ),
      },

      {
        key: "benefit",
        title: "Benefit",
        width: 190,
        numberOfLines: 2,
        render: (item) => (
          <Text variant="body" color="text" numberOfLines={2}>
            {item.benefit?.displayName ??
              item.benefit?.benefitName ??
              "Unknown Benefit"}
          </Text>
        ),
      },

      {
        key: "store",
        title: "Store",
        width: 175,
        numberOfLines: 2,
        render: (item) => (
          <Text variant="body" color="text" numberOfLines={2}>
            {item.store?.name ?? "Unknown Store"}
          </Text>
        ),
      },

      {
        key: "staff",
        title: "Staff",
        width: 175,
        numberOfLines: 2,
        render: (item) => (
          <Text variant="body" color="text" numberOfLines={2}>
            {item.staff?.fullName ?? "—"}
          </Text>
        ),
      },

      {
        key: "date",
        title: "Date",
        width: 150,
        numberOfLines: 2,
        render: (item) => (
          <Text variant="body" color="text" numberOfLines={2}>
            {formatDateTime(item.redemption.redemptionDateTime)}
          </Text>
        ),
      },

      {
        key: "status",
        title: "Status",
        width: 110,
        render: (item) => (
          <Text variant="body" color="text" numberOfLines={1}>
            {item.status?.statusName ?? item.status?.statusCode ?? "Unknown"}
          </Text>
        ),
      },
    ],
    [],
  );

  /* ================================================================
     VIEW
     ================================================================ */

  const handleView = (row: RedemptionRow) => {
    setSelectedRedemption(row);
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
              Redemptions
            </Text>

            <Text variant="bodySmall" color="textMuted">
              View benefit redemption transactions for your organization.
            </Text>
          </View>
        </View>

        <View style={styles.summary}>
          <View style={styles.summaryCard}>
            <Text variant="caption" color="textMuted">
              Total Redemptions
            </Text>

            <Text variant="h2" color="text">
              {rows.length}
            </Text>
          </View>

          <View style={styles.summaryCard}>
            <Text variant="caption" color="textMuted">
              Successful
            </Text>

            <Text variant="h2" color="text">
              {successfulCount}
            </Text>
          </View>
        </View>

        <View style={styles.searchContainer}>
          <Input
            label="Search Redemptions"
            value={search}
            onChangeText={setSearch}
            placeholder="Search redemption, customer, benefit, subscription or status"
          />
        </View>

        {loading ? (
          <View style={styles.center}>
            <Text variant="body" color="textMuted">
              Loading redemptions...
            </Text>
          </View>
        ) : (
          <DataTable
            columns={columns}
            data={filteredRows}
            keyExtractor={(item) => item.redemption.id}
            emptyMessage={
              search.trim()
                ? "No redemptions match your search."
                : "No redemptions found for this organization."
            }
            actions={[
              {
                label: "View",
                onPress: handleView,
              },
            ]}
            minTableWidth={1500}
          />
        )}
      </ScrollView>

      <Modal
        visible={selectedRedemption !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedRedemption(null)}
      >
        {selectedRedemption ? (
          <View style={styles.modalOverlay}>
            <View style={styles.viewModal}>
              <View style={styles.modalHeader}>
                <View style={styles.headerText}>
                  <View style={styles.redemptionTitleRow}>
                    <Text variant="h2" color="text">
                      {selectedRedemption.redemption.redemptionNumber}
                    </Text>

                    <View style={styles.statusBadge}>
                      <Text variant="caption" color="text">
                        {selectedRedemption.status?.statusName ??
                          selectedRedemption.status?.statusCode ??
                          "Unknown"}
                      </Text>
                    </View>
                  </View>

                  <Text variant="bodySmall" color="textMuted">
                    Redemption transaction details
                  </Text>
                </View>

                <Pressable
                  onPress={() => setSelectedRedemption(null)}
                  style={styles.closeButton}
                >
                  <Text variant="body" color="textMuted">
                    ✕
                  </Text>
                </Pressable>
              </View>

              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.modalContent}
              >
                <View style={styles.detailsGrid}>
                  <DetailItem
                    label="Redemption Number"
                    value={selectedRedemption.redemption.redemptionNumber}
                  />

                  <DetailItem
                    label="Redemption ID"
                    value={selectedRedemption.redemption.id}
                  />

                  <DetailItem
                    label="Subscription"
                    value={selectedRedemption.subscription.subscriptionNumber}
                  />

                  <DetailItem
                    label="Subscription ID"
                    value={selectedRedemption.redemption.subscriptionId}
                  />

                  <DetailItem
                    label="Customer"
                    value={
                      selectedRedemption.customer?.fullName ??
                      "Unknown Customer"
                    }
                  />

                  <DetailItem
                    label="Customer Email"
                    value={selectedRedemption.customer?.email ?? "—"}
                  />

                  <DetailItem
                    label="Customer Phone"
                    value={selectedRedemption.customer?.phone ?? "—"}
                  />

                  <DetailItem
                    label="Benefit"
                    value={
                      selectedRedemption.benefit?.displayName ??
                      selectedRedemption.benefit?.benefitName ??
                      "Unknown Benefit"
                    }
                  />

                  <DetailItem
                    label="Benefit Code"
                    value={
                      selectedRedemption.benefit?.benefitCode ??
                      selectedRedemption.redemption.benefitId
                    }
                  />

                  <DetailItem
                    label="Benefit ID"
                    value={selectedRedemption.redemption.benefitId}
                  />

                  <DetailItem
                    label="Store"
                    value={selectedRedemption.store?.name ?? "Unknown Store"}
                  />

                  <DetailItem
                    label="Store Code"
                    value={
                      selectedRedemption.store?.storeCode ??
                      selectedRedemption.redemption.storeId
                    }
                  />

                  <DetailItem
                    label="Store ID"
                    value={selectedRedemption.redemption.storeId}
                  />

                  <DetailItem
                    label="Staff"
                    value={selectedRedemption.staff?.fullName ?? "—"}
                  />

                  <DetailItem
                    label="Staff Code"
                    value={
                      selectedRedemption.staff?.staffCode ??
                      selectedRedemption.redemption.staffId ??
                      "—"
                    }
                  />

                  <DetailItem
                    label="Staff ID"
                    value={selectedRedemption.redemption.staffId ?? "—"}
                  />

                  <DetailItem
                    label="Redemption Date & Time"
                    value={formatDateTime(
                      selectedRedemption.redemption.redemptionDateTime,
                    )}
                  />

                  <DetailItem
                    label="Quantity"
                    value={String(selectedRedemption.redemption.quantity)}
                  />

                  <DetailItem
                    label="Method"
                    value={formatMethod(selectedRedemption.redemption.method)}
                  />

                  <DetailItem
                    label="Status"
                    value={
                      selectedRedemption.status?.statusName ??
                      selectedRedemption.status?.statusCode ??
                      selectedRedemption.redemption.redemptionStatusId
                    }
                  />

                  <DetailItem
                    label="Status Code"
                    value={selectedRedemption.status?.statusCode ?? "—"}
                  />

                  <DetailItem
                    label="Status ID"
                    value={selectedRedemption.redemption.redemptionStatusId}
                  />

                  <DetailItem
                    label="Remarks"
                    value={selectedRedemption.redemption.remarks ?? "—"}
                  />

                  <DetailItem
                    label="Created At"
                    value={formatDateTime(
                      selectedRedemption.redemption.createdAt,
                    )}
                  />

                  <DetailItem
                    label="Created By"
                    value={selectedRedemption.redemption.createdBy}
                  />

                  <DetailItem
                    label="Updated At"
                    value={formatDateTime(
                      selectedRedemption.redemption.updatedAt,
                    )}
                  />

                  <DetailItem
                    label="Updated By"
                    value={selectedRedemption.redemption.updatedBy}
                  />

                  <DetailItem
                    label="Version"
                    value={String(selectedRedemption.redemption.versionNo)}
                  />
                </View>

                <View style={styles.modalActions}>
                  <Pressable
                    onPress={() => setSelectedRedemption(null)}
                    style={styles.secondaryButton}
                  >
                    <Text variant="body" color="text">
                      Close
                    </Text>
                  </Pressable>
                </View>
              </ScrollView>
            </View>
          </View>
        ) : null}
      </Modal>
    </>
  );
}

/* ==================================================================
   DETAIL ITEM
   ================================================================== */

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

/* ==================================================================
   FORMATTING
   ================================================================== */

function formatDateTime(value: string): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return (
    date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }) +
    ", " +
    date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    })
  );
}

function formatMethod(value: string): string {
  if (!value) {
    return "Unknown";
  }

  return value
    .replace(/_/g, " ")
    .toLowerCase()
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/* ==================================================================
   STYLES
   ================================================================== */

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

  summary: {
    flexDirection: "row",
    gap: 16,
    flexWrap: "wrap",
  },

  summaryCard: {
    minWidth: 190,
    padding: 18,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    gap: 8,
  },

  searchContainer: {
    maxWidth: 600,
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

  viewModal: {
    width: "100%",
    maxWidth: 700,
    maxHeight: "90%",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 24,
    gap: 20,
  },

  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
  },

  redemptionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
  },

  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: "#DCFCE7",
  },

  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
  },

  modalContent: {
    gap: 20,
    paddingBottom: 4,
  },

  detailsGrid: {
    gap: 16,
  },

  detailItem: {
    gap: 3,
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
