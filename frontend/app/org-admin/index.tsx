import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";

import {
  services,
  type Benefit,
  type Customer,
  type Redemption,
  type Status,
  type Store,
  type Subscription,
} from "@/src/core";

import { APP_ROUTES } from "@/src/constants/navigation";
import { useBusiness, useTheme } from "@/src/providers";

import { Text } from "@/src/ui";

/* ------------------------------------------------------------------
 * Organization Dashboard
 *
 * The dashboard aggregates existing domain services.
 *
 * UI dependency flow:
 *
 * UI
 *   ↓
 * services registry
 *   ↓
 * API / mock implementation
 *
 * No mock service is consumed directly by the UI.
 * ------------------------------------------------------------------ */

type DashboardData = {
  customers: Customer[];
  productsCount: number;
  benefits: Benefit[];
  stores: Store[];
  staffCount: number;
  subscriptions: Subscription[];
  redemptions: Redemption[];
  statuses: Map<string, Status>;
};

export default function OrgAdminDashboard() {
  const theme = useTheme();
  const { organization } = useBusiness();

  const [data, setData] = useState<DashboardData | null>(null);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadDashboard() {
      setLoading(true);
      setError(null);

      try {
        const [customers, products, benefits, stores, staff, subscriptions] =
          await Promise.all([
            services.customer.findCustomers({}),

            services.membershipProduct.listProducts(organization.id),

            services.benefit.listByOrganization(organization.id),

            services.organization.listStores(organization.id),

            services.organization.listStaff(organization.id),

            services.subscription.listByOrganization(organization.id),
          ]);

        /*
         * Redemptions are currently exposed through subscriptions.
         * Resolve the organization's redemption records through the
         * redemption service.
         */
        const redemptionResults = await Promise.all(
          subscriptions
            .filter((subscription) => !subscription.isDeleted)
            .map((subscription) =>
              services.redemption.listBySubscription(subscription.id),
            ),
        );

        const redemptions = redemptionResults
          .flat()
          .filter((redemption) => !redemption.isDeleted);

        /*
         * Resolve the generic Status records referenced by
         * subscriptions and redemptions.
         *
         * Do not hard-code status IDs or status names here.
         */
        const statusIds = new Set<string>();

        subscriptions.forEach((subscription) => {
          if (subscription.subscriptionStatusId) {
            statusIds.add(subscription.subscriptionStatusId);
          }
        });

        redemptions.forEach((redemption) => {
          if (redemption.redemptionStatusId) {
            statusIds.add(redemption.redemptionStatusId);
          }
        });

        const resolvedStatuses = await Promise.all(
          Array.from(statusIds).map(async (statusId) => {
            const status = await services.status.getStatus(statusId);

            return [statusId, status] as const;
          }),
        );

        const statuses = new Map<string, Status>();

        resolvedStatuses.forEach(([statusId, status]) => {
          if (status) {
            statuses.set(statusId, status);
          }
        });

        if (!mounted) {
          return;
        }

        setData({
          customers,

          productsCount: products.filter((product) => !product.isDeleted)
            .length,

          benefits: benefits.filter((benefit) => !benefit.isDeleted),

          stores: stores.filter((store) => !store.isDeleted),

          staffCount: staff.filter((member) => !member.isDeleted).length,

          subscriptions: subscriptions.filter(
            (subscription) => !subscription.isDeleted,
          ),

          redemptions,

          statuses,
        });
      } catch (err) {
        console.error("Unable to load organization dashboard", err);

        if (mounted) {
          setError("Unable to load dashboard data.");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadDashboard();

    return () => {
      mounted = false;
    };
  }, [organization.id]);

  /* ================================================================
   * SUBSCRIPTION STATUS COUNTS
   * ================================================================ */

  const subscriptionStatusCounts = useMemo(() => {
    if (!data) {
      return [];
    }

    const counts = new Map<
      string,
      {
        status: Status;
        count: number;
      }
    >();

    data.subscriptions.forEach((subscription) => {
      const status = data.statuses.get(subscription.subscriptionStatusId);

      if (!status) {
        return;
      }

      const existing = counts.get(status.id);

      if (existing) {
        existing.count += 1;
      } else {
        counts.set(status.id, {
          status,
          count: 1,
        });
      }
    });

    return Array.from(counts.values()).sort(
      (a, b) => a.status.displayOrder - b.status.displayOrder,
    );
  }, [data]);

  /* ================================================================
   * REDEMPTION STATUS COUNTS
   * ================================================================ */

  const redemptionStatusCounts = useMemo(() => {
    if (!data) {
      return [];
    }

    const counts = new Map<
      string,
      {
        status: Status;
        count: number;
      }
    >();

    data.redemptions.forEach((redemption) => {
      const status = data.statuses.get(redemption.redemptionStatusId);

      if (!status) {
        return;
      }

      const existing = counts.get(status.id);

      if (existing) {
        existing.count += 1;
      } else {
        counts.set(status.id, {
          status,
          count: 1,
        });
      }
    });

    return Array.from(counts.values()).sort(
      (a, b) => a.status.displayOrder - b.status.displayOrder,
    );
  }, [data]);

  /* ================================================================
   * RECENT REDEMPTIONS
   * ================================================================ */

  const recentRedemptions = useMemo(() => {
    if (!data) {
      return [];
    }

    return [...data.redemptions]
      .sort(
        (a, b) =>
          new Date(b.redemptionDateTime).getTime() -
          new Date(a.redemptionDateTime).getTime(),
      )
      .slice(0, 5);
  }, [data]);

  /* ================================================================
   * LOADING
   * ================================================================ */

  if (loading) {
    return (
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.screen,
          {
            backgroundColor: theme.colors.background,
          },
        ]}
      >
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text variant="title" color="text">
              Dashboard
            </Text>

            <Text variant="bodySmall" color="textMuted">
              Business overview
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.loadingCard,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Text variant="body" color="textMuted">
            Loading dashboard data...
          </Text>
        </View>
      </ScrollView>
    );
  }

  /* ================================================================
   * ERROR
   * ================================================================ */

  if (error || !data) {
    return (
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.screen,
          {
            backgroundColor: theme.colors.background,
          },
        ]}
      >
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text variant="title" color="text">
              Dashboard
            </Text>

            <Text variant="bodySmall" color="textMuted">
              Business overview
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.errorCard,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Text variant="body" color="text">
            {error ?? "Dashboard data is unavailable."}
          </Text>
        </View>
      </ScrollView>
    );
  }

  /* ================================================================
   * DASHBOARD
   * ================================================================ */

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.screen,
        {
          backgroundColor: theme.colors.background,
        },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text variant="title" color="text">
            Dashboard
          </Text>

          <Text variant="bodySmall" color="textMuted">
            Business overview and activity
          </Text>
        </View>
      </View>

      <View style={styles.cardsGrid}>
        <MetricCard
          label="Customers"
          value={data.customers.length}
          href={APP_ROUTES.orgAdmin.customers}
        />

        <MetricCard
          label="Memberships"
          value={data.productsCount}
          href={APP_ROUTES.orgAdmin.memberships}
        />

        <MetricCard
          label="Subscriptions"
          value={data.subscriptions.length}
          href={APP_ROUTES.orgAdmin.subscriptions}
        />

        <MetricCard
          label="Benefits"
          value={data.benefits.length}
          href={APP_ROUTES.orgAdmin.benefits}
        />

        <MetricCard
          label="Stores"
          value={data.stores.length}
          href={APP_ROUTES.orgAdmin.stores}
        />

        <MetricCard
          label="Staff"
          value={data.staffCount}
          href={APP_ROUTES.orgAdmin.staffMembers}
        />
      </View>

      <DashboardSection
        title="Subscription Overview"
        subtitle="Current subscription status distribution"
      >
        {subscriptionStatusCounts.length === 0 ? (
          <EmptySectionText>No subscriptions found.</EmptySectionText>
        ) : (
          <View style={styles.statusList}>
            {subscriptionStatusCounts.map(({ status, count }) => (
              <StatusRow
                key={status.id}
                label={status.statusName}
                count={count}
              />
            ))}
          </View>
        )}
      </DashboardSection>

      <DashboardSection
        title="Redemption Overview"
        subtitle="Benefit redemption activity"
      >
        <View style={styles.redemptionSummary}>
          <MetricCard
            label="Total Redemptions"
            value={data.redemptions.length}
            compact
            href={APP_ROUTES.orgAdmin.redemptions}
          />

          {redemptionStatusCounts.map(({ status, count }) => (
            <MetricCard
              key={status.id}
              label={status.statusName}
              value={count}
              compact
              href={APP_ROUTES.orgAdmin.redemptions}
            />
          ))}
        </View>
      </DashboardSection>

      <DashboardSection
        title="Recent Redemptions"
        subtitle="Latest benefit redemption transactions"
      >
        {recentRedemptions.length === 0 ? (
          <EmptySectionText>No redemptions found.</EmptySectionText>
        ) : (
          <View style={styles.recentList}>
            {recentRedemptions.map((redemption) => {
              const status = data.statuses.get(redemption.redemptionStatusId);

              return (
                <Pressable
                  key={redemption.id}
                  onPress={() => router.push(APP_ROUTES.orgAdmin.redemptions)}
                  style={({ pressed }) => [
                    styles.recentRow,
                    {
                      borderBottomColor: theme.colors.border,
                      backgroundColor: pressed
                        ? theme.colors.surfaceAlt
                        : "transparent",
                      opacity: pressed ? theme.states.pressedOpacity : 1,
                    },
                  ]}
                >
                  <View style={styles.recentPrimary}>
                    <Text variant="bodyStrong" color="text" numberOfLines={1}>
                      {redemption.redemptionNumber}
                    </Text>

                    <Text variant="caption" color="textMuted">
                      {formatDateTime(redemption.redemptionDateTime)}
                    </Text>
                  </View>

                  <View style={styles.recentSecondary}>
                    <Text variant="bodySmall" color="text">
                      Qty: {redemption.quantity}
                    </Text>

                    <Text variant="caption" color="textMuted" numberOfLines={1}>
                      {status?.statusName ?? "Unknown Status"}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </DashboardSection>
    </ScrollView>
  );
}

/* ==================================================================
   METRIC CARD
   ================================================================== */

function MetricCard({
  label,
  value,
  href,
  compact = false,
}: {
  label: string;
  value: number;
  href?: string;
  compact?: boolean;
}) {
  const theme = useTheme();

  const content = (
    <View
      style={[
        styles.metricCard,
        compact && styles.metricCardCompact,
        {
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.border,
        },
      ]}
    >
      <View style={styles.metricHeader}>
        <Text variant="caption" color="textMuted" numberOfLines={1}>
          {label}
        </Text>

        {href ? (
          <Text variant="bodySmall" color="primary">
            →
          </Text>
        ) : null}
      </View>

      <Text variant={compact ? "h2" : "h1"} color="text">
        {value}
      </Text>
    </View>
  );

  if (!href) {
    return content;
  }

  return (
    <Pressable
      onPress={() => router.push(href as never)}
      style={({ pressed }) => ({
        opacity: pressed ? theme.states.pressedOpacity : 1,
        transform: [
          {
            scale: pressed ? 0.99 : 1,
          },
        ],
      })}
    >
      {content}
    </Pressable>
  );
}

/* ==================================================================
   DASHBOARD SECTION
   ================================================================== */

function DashboardSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.section,
        {
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.border,
        },
      ]}
    >
      <View style={styles.sectionHeader}>
        <Text variant="h2" color="text">
          {title}
        </Text>

        <Text variant="bodySmall" color="textMuted">
          {subtitle}
        </Text>
      </View>

      {children}
    </View>
  );
}

/* ==================================================================
   STATUS ROW
   ================================================================== */

function StatusRow({ label, count }: { label: string; count: number }) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.statusRow,
        {
          borderBottomColor: theme.colors.border,
        },
      ]}
    >
      <Text variant="body" color="text" numberOfLines={1}>
        {label}
      </Text>

      <Text variant="bodyStrong" color="text">
        {count}
      </Text>
    </View>
  );
}

/* ==================================================================
   EMPTY SECTION
   ================================================================== */

function EmptySectionText({ children }: { children: React.ReactNode }) {
  return (
    <Text variant="bodySmall" color="textMuted">
      {children}
    </Text>
  );
}

/* ==================================================================
   DATE FORMATTING
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
  },

  headerText: {
    gap: 4,
  },

  cardsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
  },

  metricCard: {
    width: 190,
    minHeight: 110,
    padding: 18,
    borderWidth: 1,
    borderRadius: 10,
    justifyContent: "space-between",
    gap: 10,
  },

  metricCardCompact: {
    minHeight: 90,
    width: 160,
  },

  metricHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },

  section: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 20,
    gap: 18,
  },

  sectionHeader: {
    gap: 4,
  },

  statusList: {
    gap: 0,
  },

  statusRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    paddingVertical: 10,
  },

  redemptionSummary: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },

  recentList: {
    gap: 0,
  },

  recentRow: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 20,
    borderBottomWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 6,
  },

  recentPrimary: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },

  recentSecondary: {
    width: 150,
    alignItems: "flex-end",
    gap: 3,
  },

  loadingCard: {
    minHeight: 160,
    borderWidth: 1,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },

  errorCard: {
    minHeight: 120,
    borderWidth: 1,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
});
