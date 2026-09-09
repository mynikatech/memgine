import * as React from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";

import type {
  User,
  MembershipProduct,
  OrganizationUser,
  Redemption,
  Store,
  Subscription,
  SubscriptionPlan,
} from "@/src/core";
import { services } from "@/src/core";
import { APP_ROUTES } from "@/src/constants/navigation";
import { useBusiness, useTranslation } from "@/src/providers";
import { Screen } from "@/src/layout";
import {
  Badge,
  Button,
  Card,
  DataTable,
  type DataTableColumn,
  Header,
  Section,
  StateView,
  Text,
} from "@/src/ui";

type Status = "loading" | "error" | "ready";

type CustomerRedemption = {
  redemption: Redemption;
  benefitName: string;
  storeName: string;
  productName: string;
};

type CustomerRow = {
  user: User;
  organizationUser: OrganizationUser;
  subscriptions: Subscription[];
  productsBySubscriptionId: Record<string, MembershipProduct | undefined>;
  membershipNamesBySubscriptionId: Record<string, string | undefined>;
  redemptions: CustomerRedemption[];
};

function getDisplayName(user: User): string {
  return (
    user.displayName?.trim() ||
    `${user.firstName ?? ""} ${user.middleName ?? ""} ${user.lastName ?? ""}`
      .replace(/\s+/g, " ")
      .trim() ||
    user.userCode
  );
}

function getPhoneDisplay(user: User): string {
  return `${user.primaryPhone?.callingCode ?? ""} ${
    user.primaryPhone?.number ?? ""
  }`.trim();
}

function formatStatusId(statusId: string | undefined): string {
  if (!statusId) {
    return "Unknown";
  }

  const known: Record<string, string> = {
    "status-active": "Active",
    "status-inactive": "Inactive",
    "status-suspended": "Suspended",
    "user-status-active": "Active",
    "user-status-inactive": "Inactive",
    "user-status-suspended": "Suspended",
    "organization-user-status-active": "Active",
    "organization-user-status-inactive": "Inactive",
    "organization-user-status-suspended": "Suspended",
  };

  if (known[statusId]) {
    return known[statusId];
  }

  return statusId
    .replace(/^(user-status|organization-user-status|status)-/, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function statusTone(statusId: string | undefined): "success" | "neutral" {
  return formatStatusId(statusId).toLowerCase() === "active"
    ? "success"
    : "neutral";
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

export default function StaffCustomers() {
  const router = useRouter();

  const { organization } = useBusiness();
  const { formatDate } = useTranslation();

  const [status, setStatus] = React.useState<Status>("loading");
  const [rows, setRows] = React.useState<CustomerRow[]>([]);
  const [search, setSearch] = React.useState("");
  const [selectedCustomerId, setSelectedCustomerId] = React.useState<
    string | null
  >(null);

  const [
    activeSubscriptionEntityStatusId,
    setActiveSubscriptionEntityStatusId,
  ] = React.useState<string | undefined>(undefined);

  const loadCustomers = React.useCallback(async () => {
    setStatus("loading");

    try {
      /*
       * Use the exact same source-of-truth pattern as Org Admin Customers:
       *
       * Organization
       *    ↓
       * OrganizationUser
       *    ↓ userId
       * User
       *
       * Do NOT call services.customer.getCustomer() here. The Org Admin
       * customer directory resolves the organization relationship against
       * services.organization.listUsers(), which is also the persisted local
       * AsyncStorage/mock data source used by the rest of the app.
       */
      const [organizationUsers, users, subscriptions] = await Promise.all([
        services.organization.listOrganizationUsers(organization.id),
        services.organization.listUsers(),
        services.subscription.listByOrganization(organization.id),
      ]);

      const userMap = new Map<string, User>(
        users.filter((user) => !user.isDeleted).map((user) => [user.id, user]),
      );

      const subscriptionsByOrganizationUser = new Map<string, Subscription[]>();

      for (const subscription of subscriptions) {
        if (subscription.isDeleted) {
          continue;
        }

        const current =
          subscriptionsByOrganizationUser.get(
            subscription.organizationUserId,
          ) ?? [];

        current.push(subscription);
        subscriptionsByOrganizationUser.set(
          subscription.organizationUserId,
          current,
        );
      }

      /*
       * Match Org Admin exactly: only non-deleted Customer organization
       * relationships are included.
       */
      const customerOrganizationUsers = organizationUsers.filter(
        (organizationUser) =>
          !organizationUser.isDeleted &&
          organizationUser.organizationUserTypeId === "org-user-type-customer",
      );

      const customerRows: CustomerRow[] = [];

      for (const organizationUser of customerOrganizationUsers) {
        const user = userMap.get(organizationUser.userId);

        if (!user) {
          console.warn("COUNTER CUSTOMER USER MISSING", {
            organizationUserId: organizationUser.id,
            userId: organizationUser.userId,
          });
          continue;
        }

        customerRows.push({
          user,
          organizationUser,
          subscriptions:
            subscriptionsByOrganizationUser.get(organizationUser.id) ?? [],
          productsBySubscriptionId: {},
          membershipNamesBySubscriptionId: {},
          redemptions: [],
        });
      }

      /*
       * Resolve membership products from the organization-scoped catalogue.
       *
       * IMPORTANT: getProduct(id) is not safe for persisted organization
       * products because the local implementation delegates that lookup to
       * its fallback service. The organization-scoped listProducts() path is
       * the source of truth used by JoinFlow.
       */
      const [
        membershipProducts,
        organizationBenefits,
        stores,
        subscriptionStatuses,
      ] = await Promise.all([
        services.membershipProduct.listProducts(organization.id),
        services.benefit.listByOrganization(organization.id),
        services.organization.listStores(organization.id),
        services.status.listStatusesByEntityTypeCode("SUBSCRIPTION"),
      ]);

      const productsById = new Map(
        membershipProducts
          .filter((product) => !product.isDeleted)
          .map((product) => [product.id, product]),
      );

      const benefitsById = new Map(
        organizationBenefits
          .filter((benefit) => !benefit.isDeleted)
          .map((benefit) => [benefit.id, benefit]),
      );

      const storesById = new Map<string, Store>(
        stores
          .filter((store) => !store.isDeleted)
          .map((store) => [store.id, store]),
      );

      const activeSubscriptionStatus = subscriptionStatuses.find(
        (item) => item?.statusCode?.trim().toUpperCase() === "ACTIVE",
      );

      const activeStatusId = activeSubscriptionStatus?.id;

      for (const row of customerRows) {
        for (const subscription of row.subscriptions) {
          /*
           * IMPORTANT: resolve the plan from the same organization-scoped
           * membership-product catalogue that the customer directory uses.
           *
           * Each MembershipProduct contains its SubscriptionPlan records in
           * `plans`. That is the reliable persisted relationship for Counter.
           * The previous implementation called subscriptionPlan.getPlan()
           * first; in the local service that can fall back to mock data and
           * return no matching plan, causing us to fall back to the product
           * name ("ARTISAN PASS") instead of the plan name ("SILVER").
           *
           * Org Admin -> Subscriptions presents the same relationship as:
           *   primary   = SubscriptionPlan.subscriptionPlanName (SILVER)
           *   secondary = MembershipProduct.membershipProductName (ARTISAN PASS)
           *
           * Counter must use exactly that presentation.
           */
          let matchedPlan: SubscriptionPlan | undefined;
          let product: MembershipProduct | undefined;

          for (const candidate of membershipProducts) {
            if (candidate.isDeleted) {
              continue;
            }

            const candidatePlan = candidate.plans?.find(
              (plan) =>
                !plan.isDeleted && plan.id === subscription.subscriptionPlanId,
            );

            if (candidatePlan) {
              product = candidate;
              matchedPlan = candidatePlan;
              break;
            }
          }

          /*
           * Keep a fallback for data sets where the organization product
           * catalogue does not contain the embedded plan. This does not
           * change the normal persisted path above.
           */
          if (!matchedPlan) {
            matchedPlan =
              (await services.subscriptionPlan.getPlan(
                subscription.subscriptionPlanId,
              )) ?? undefined;

            if (matchedPlan) {
              product = productsById.get(matchedPlan.membershipProductId);
            }
          }

          row.productsBySubscriptionId[subscription.id] = product;

          /*
           * Match Org Admin -> Subscriptions exactly:
           *   primary name   = plan name (e.g. SILVER)
           *   product name   = secondary line (e.g. ARTISAN PASS)
           */
          row.membershipNamesBySubscriptionId[subscription.id] =
            matchedPlan?.subscriptionPlanName?.trim() || undefined;

          if (!product) {
            console.warn("COUNTER SUBSCRIPTION PRODUCT MISSING", {
              subscriptionId: subscription.id,
              subscriptionPlanId: subscription.subscriptionPlanId,
              organizationId: organization.id,
            });
          }

          const productBenefitIds = new Set(product?.benefitIds ?? []);

          const subscriptionRedemptions =
            await services.redemption.listBySubscription(subscription.id);

          for (const redemption of subscriptionRedemptions) {
            const benefit = benefitsById.get(redemption.benefitId);
            const store = storesById.get(redemption.storeId);

            row.redemptions.push({
              redemption,
              benefitName:
                benefit && productBenefitIds.has(benefit.id)
                  ? (benefit.displayName ?? benefit.benefitName)
                  : "Reward redeemed",
              storeName:
                store?.name ?? organization.displayName ?? organization.name,
              productName:
                product?.displayName ??
                product?.membershipProductName ??
                "Membership",
            });
          }
        }
      }

      setActiveSubscriptionEntityStatusId(activeStatusId);

      console.log("COUNTER CUSTOMERS LOADED", {
        organizationId: organization.id,
        organizationUsers: organizationUsers.length,
        customerOrganizationUsers: customerOrganizationUsers.length,
        users: users.length,
        customerRows: customerRows.length,
      });

      setRows(customerRows);
      setStatus("ready");
    } catch (error) {
      console.error("COUNTER CUSTOMERS LOAD ERROR", error);
      setRows([]);
      setStatus("error");
    }
  }, [organization.id, organization.displayName]);

  useFocusEffect(
    React.useCallback(() => {
      loadCustomers();
    }, [loadCustomers]),
  );

  const filteredRows = React.useMemo(() => {
    const value = search.trim().toLowerCase();

    if (!value) {
      return rows;
    }

    return rows.filter(({ user }) => {
      const name =
        `${user.displayName ?? ""} ${user.firstName ?? ""} ${user.middleName ?? ""} ${user.lastName ?? ""}`.toLowerCase();

      const phone =
        `${user.primaryPhone.callingCode ?? ""} ${user.primaryPhone.number ?? ""}`.toLowerCase();

      const email = user.primaryEmail?.toLowerCase() ?? "";

      return (
        name.includes(value) || phone.includes(value) || email.includes(value)
      );
    });
  }, [rows, search]);

  const selectedRow = selectedCustomerId
    ? rows.find((row) => row.user.id === selectedCustomerId)
    : undefined;

  const customerColumns = React.useMemo<DataTableColumn<CustomerRow>[]>(
    () => [
      {
        key: "name",
        title: "Customer",
        width: 240,
        render: (item) => (
          <View style={styles.customerCell}>
            <Text variant="bodyStrong" color="text">
              {getDisplayName(item.user)}
            </Text>
            <Text variant="caption" color="textMuted">
              {`Joined ${new Date(
                item.organizationUser.joiningDate,
              ).toLocaleDateString()}`}
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
            {item.user.primaryEmail ?? "—"}
          </Text>
        ),
      },
      {
        key: "phone",
        title: "Phone",
        width: 180,
        render: (item) => (
          <Text variant="body" color="text">
            {getPhoneDisplay(item.user) || "—"}
          </Text>
        ),
      },
      {
        key: "status",
        title: "Status",
        width: 140,
        render: (item) => (
          <Text variant="body" color="text">
            {formatStatusId(item.organizationUser.organizationUserStatusId)}
          </Text>
        ),
      },
      {
        key: "membership",
        title: "Membership",
        width: 220,
        render: (item) => {
          const memberships = item.subscriptions
            .filter(
              (subscription) =>
                !subscription.isDeleted &&
                (activeSubscriptionEntityStatusId === undefined ||
                  subscription.subscriptionStatusId ===
                    activeSubscriptionEntityStatusId),
            )
            .map((subscription) => ({
              tier: item.membershipNamesBySubscriptionId[
                subscription.id
              ]?.trim(),
              product:
                item.productsBySubscriptionId[
                  subscription.id
                ]?.membershipProductName?.trim() ||
                item.productsBySubscriptionId[
                  subscription.id
                ]?.displayName?.trim(),
            }))
            .filter((membership) => membership.tier || membership.product);

          return memberships.length > 0 ? (
            <View style={{ gap: 8 }}>
              {memberships.map((membership, index) => (
                <View
                  key={`${membership.tier ?? "membership"}-${membership.product ?? "product"}-${index}`}
                >
                  {membership.tier ? (
                    <Text variant="body" color="text">
                      {membership.tier}
                    </Text>
                  ) : null}
                  {membership.product ? (
                    <Text variant="caption" color="textMuted">
                      {membership.product}
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
          ) : (
            <Text variant="body" color="textMuted">
              No membership
            </Text>
          );
        },
      },
    ],
    [activeSubscriptionEntityStatusId],
  );

  if (status === "loading") {
    return (
      <Screen
        testID="staff-customers-screen"
        edges={["top"]}
        header={
          <Header title="Customers" subtitle={organization.displayName} />
        }
      >
        <StateView
          kind="loading"
          message="Loading customers..."
          testID="staff-customers-loading"
        />
      </Screen>
    );
  }

  if (status === "error") {
    return (
      <Screen
        testID="staff-customers-screen"
        edges={["top"]}
        header={
          <Header title="Customers" subtitle={organization.displayName} />
        }
      >
        <StateView
          kind="error"
          title="Unable to load customers"
          message="Please try again."
          actionLabel="Retry"
          onAction={loadCustomers}
          testID="staff-customers-error"
        />
      </Screen>
    );
  }

  /*
   * ------------------------------------------------------------
   * CUSTOMER DETAIL
   * ------------------------------------------------------------
   */
  if (selectedRow) {
    const activeSubscription = activeSubscriptionEntityStatusId
      ? selectedRow.subscriptions.find(
          (subscription) =>
            subscription.subscriptionStatusId ===
            activeSubscriptionEntityStatusId,
        )
      : undefined;

    const activeProduct = activeSubscription
      ? selectedRow.productsBySubscriptionId[activeSubscription.id]
      : undefined;

    const totalRedeemed = selectedRow.redemptions.reduce(
      (total, item) => total + (item.redemption.quantity ?? 1),
      0,
    );

    const sortedRedemptions = selectedRow.redemptions
      .slice()
      .sort(
        (a, b) =>
          new Date(b.redemption.redemptionDateTime).getTime() -
          new Date(a.redemption.redemptionDateTime).getTime(),
      );

    return (
      <Screen
        testID="staff-customer-detail-screen"
        edges={["top"]}
        header={<Header title="Customer" subtitle={organization.displayName} />}
      >
        <ScrollView
          contentContainerStyle={styles.detailContent}
          showsVerticalScrollIndicator={false}
        >
          <Button
            label="← Back to Customers"
            variant="ghost"
            onPress={() => setSelectedCustomerId(null)}
          />

          {/* Customer profile */}
          <Card padding="lg">
            <View style={styles.customerHeader}>
              <View style={styles.avatar}>
                <Text variant="h2" color="text">
                  {(getDisplayName(selectedRow.user) ?? "?")
                    .trim()
                    .charAt(0)
                    .toUpperCase()}
                </Text>
              </View>

              <View style={styles.customerHeaderText}>
                <Text variant="h2" color="text">
                  {getDisplayName(selectedRow.user)}
                </Text>

                {getPhoneDisplay(selectedRow.user) ? (
                  <Text variant="body" color="textMuted">
                    {getPhoneDisplay(selectedRow.user)}
                  </Text>
                ) : null}

                {selectedRow.user.primaryEmail ? (
                  <Text variant="bodySmall" color="textMuted">
                    {selectedRow.user.primaryEmail}
                  </Text>
                ) : null}
              </View>

              <Badge
                label={formatStatusId(
                  selectedRow.user.userStatusId,
                ).toUpperCase()}
                tone={statusTone(selectedRow.user.userStatusId)}
              />
            </View>
          </Card>

          {/* Organization relationship */}
          <Card padding="lg">
            <Text variant="bodyStrong" color="text">
              Business Relationship
            </Text>

            <View style={styles.infoRow}>
              <Text variant="bodySmall" color="textMuted">
                Customer status
              </Text>
              <Text variant="bodySmall" color="text">
                {formatStatusId(
                  selectedRow.organizationUser.organizationUserStatusId,
                )}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text variant="bodySmall" color="textMuted">
                Joined business
              </Text>
              <Text variant="bodySmall" color="text">
                {selectedRow.organizationUser.joiningDate
                  ? formatDate(selectedRow.organizationUser.joiningDate)
                  : "—"}
              </Text>
            </View>
          </Card>

          {/* Membership */}
          <Section title="Memberships">
            {selectedRow.subscriptions.length === 0 ? (
              <Card padding="lg">
                <Text variant="body" color="textMuted">
                  No memberships found for this customer.
                </Text>
              </Card>
            ) : (
              selectedRow.subscriptions.map((subscription) => {
                const product =
                  selectedRow.productsBySubscriptionId[subscription.id];

                const isActive =
                  activeSubscriptionEntityStatusId !== undefined &&
                  subscription.subscriptionStatusId ===
                    activeSubscriptionEntityStatusId;

                return (
                  <Card key={subscription.id} padding="lg">
                    <View style={styles.membershipHeader}>
                      <View style={styles.membershipText}>
                        <Text variant="h2" color="text">
                          {selectedRow.membershipNamesBySubscriptionId[
                            subscription.id
                          ] ?? "Membership"}
                        </Text>

                        <Text variant="bodySmall" color="textMuted">
                          {product?.membershipProductName ??
                            product?.displayName ??
                            "Membership Product"}
                        </Text>
                      </View>

                      <Badge
                        label={isActive ? "ACTIVE" : "INACTIVE"}
                        tone={isActive ? "success" : "neutral"}
                      />
                    </View>

                    <View style={styles.infoRow}>
                      <Text variant="bodySmall" color="textMuted">
                        Start date
                      </Text>

                      <Text variant="bodySmall" color="text">
                        {subscription.startDate
                          ? formatDate(subscription.startDate)
                          : "—"}
                      </Text>
                    </View>

                    <View style={styles.infoRow}>
                      <Text variant="bodySmall" color="textMuted">
                        Valid until
                      </Text>

                      <Text variant="bodySmall" color="text">
                        {subscription.endDate
                          ? formatDate(subscription.endDate)
                          : "—"}
                      </Text>
                    </View>

                    {isActive ? (
                      <View style={styles.membershipAction}>
                        <Pressable
                          onPress={() => {
                            /*
                             * The existing Business Experience route
                             * is the real customer-facing membership
                             * experience.
                             *
                             * This is intentionally a small demo bridge
                             * from Staff → Customers to that experience.
                             */
                            router.push(
                              APP_ROUTES.business.subscription(
                                subscription.id,
                              ) as never,
                            );
                          }}
                          testID={`view-membership-${subscription.id}`}
                        >
                          <Text variant="bodyStrong" color="text">
                            View Customer Experience →
                          </Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </Card>
                );
              })
            )}
          </Section>

          {/* Redemption summary */}
          <Section title="Redemption History">
            {selectedRow.redemptions.length === 0 ? (
              <Card padding="lg">
                <Text variant="body" color="textMuted">
                  No redemptions yet.
                </Text>
              </Card>
            ) : (
              <>
                <Card padding="lg">
                  <Text variant="h2" color="text">
                    {totalRedeemed}
                  </Text>

                  <Text variant="body" color="textMuted">
                    Total benefits redeemed
                  </Text>

                  <Text
                    variant="bodySmall"
                    color="textMuted"
                    style={styles.summarySecondary}
                  >
                    {selectedRow.redemptions.length} redemption{" "}
                    {selectedRow.redemptions.length === 1
                      ? "transaction"
                      : "transactions"}
                  </Text>
                </Card>

                <View style={styles.redemptionList}>
                  {sortedRedemptions.map(
                    ({ redemption, benefitName, storeName, productName }) => (
                      <Card key={redemption.id} padding="md">
                        <View style={styles.redemptionRow}>
                          <View style={styles.redemptionMain}>
                            <Text variant="bodyStrong" color="text">
                              {benefitName}
                            </Text>

                            <Text variant="bodySmall" color="textMuted">
                              {storeName}
                            </Text>

                            <Text variant="caption" color="textMuted">
                              {productName}
                            </Text>
                          </View>

                          <View style={styles.redemptionRight}>
                            <Text variant="bodySmall" color="textMuted">
                              {formatDate(redemption.redemptionDateTime)}
                            </Text>

                            <Text variant="caption" color="textMuted">
                              × {redemption.quantity ?? 1}
                            </Text>
                          </View>
                        </View>
                      </Card>
                    ),
                  )}
                </View>
              </>
            )}
          </Section>
        </ScrollView>
      </Screen>
    );
  }

  /*
   * ------------------------------------------------------------
   * CUSTOMER DIRECTORY
   * ------------------------------------------------------------
   */
  return (
    <Screen
      testID="staff-customers-screen"
      edges={["top"]}
      header={<Header title="Customers" subtitle={organization.displayName} />}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View>
          <Text variant="h2" color="text">
            Customers
          </Text>

          <Text variant="body" color="textMuted" style={styles.subtitle}>
            Search customers and view their memberships.
          </Text>
        </View>

        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name, phone or email"
          placeholderTextColor="#888"
          style={styles.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
          testID="staff-customer-search"
        />

        <Section title={`Customers (${filteredRows.length})`}>
          {filteredRows.length === 0 ? (
            <Card padding="lg">
              <Text variant="body" color="textMuted">
                {search.trim()
                  ? "No customers match your search."
                  : "No customers are associated with this business yet."}
              </Text>
            </Card>
          ) : (
            <DataTable
              columns={customerColumns}
              data={filteredRows}
              keyExtractor={(item) => item.organizationUser.id}
              actions={[
                {
                  label: "View",
                  onPress: (item) => setSelectedCustomerId(item.user.id),
                },
              ]}
            />
          )}
        </Section>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 20,
    gap: 20,
  },

  detailContent: {
    padding: 20,
    gap: 20,
  },

  subtitle: {
    marginTop: 6,
  },

  searchInput: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#D8D8D8",
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    backgroundColor: "#FFFFFF",
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  customerCell: {
    gap: 3,
  },

  rowMain: {
    flex: 1,
    gap: 3,
  },

  rowRight: {
    alignItems: "flex-end",
  },

  avatarSmall: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F0EB",
  },

  customerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },

  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F0EB",
  },

  customerHeaderText: {
    flex: 1,
    gap: 3,
  },

  detailGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    marginTop: 20,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: "#EAEAEA",
  },

  detailItem: {
    width: "46%",
    gap: 4,
  },

  membershipHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },

  membershipText: {
    flex: 1,
    gap: 3,
  },

  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 14,
  },

  membershipAction: {
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#EAEAEA",
  },

  summarySecondary: {
    marginTop: 4,
  },

  redemptionList: {
    gap: 10,
  },

  redemptionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },

  redemptionMain: {
    flex: 1,
    gap: 3,
  },

  redemptionRight: {
    alignItems: "flex-end",
    gap: 3,
  },
});
