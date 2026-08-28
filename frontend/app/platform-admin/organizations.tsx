import { router } from "expo-router";

import { useCallback, useEffect, useState } from "react";

import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { APP_ROUTES } from "@/src/constants/navigation";

import { DEFAULT_ACTIVE_ORG_ID, services, type Organization } from "@/src/core";

import { resetLocalOrganizations } from "@/src/data/persistence/local/reset";

import { useBusiness, useTheme } from "@/src/providers";

import { Text } from "@/src/ui";

export default function PlatformOrganizations() {
  const theme = useTheme();

  const { organization: currentOrganization, setActiveBusiness } =
    useBusiness();

  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadOrganizations = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const result = await services.organization.listOrganizations();

      setOrganizations(result);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to load organizations.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Development-only reset.
   *
   * Removes locally persisted organizations and then restores
   * the application to the default active organization.
   *
   * The reset helper clears persistent local organization data
   * and the persisted active-organization value. We also update
   * the BusinessProvider state here because AsyncStorage changes
   * do not automatically update React state in the running app.
   */
  const handleResetLocalOrganizations = useCallback(async () => {
    console.log("[PlatformOrganizations] RESET BUTTON PRESSED");

    try {
      console.log("[PlatformOrganizations] calling reset...");

      await resetLocalOrganizations();

      console.log("[PlatformOrganizations] RESET COMPLETE");

      /*
       * Reset the in-memory active organization as well.
       *
       * This is necessary because clearing AsyncStorage does not
       * automatically change activeOrgId inside BusinessProvider.
       */
      setActiveBusiness(DEFAULT_ACTIVE_ORG_ID);

      console.log(
        "[PlatformOrganizations] ACTIVE ORGANIZATION RESET TO DEFAULT",
      );

      await loadOrganizations();

      console.log("[PlatformOrganizations] ORGANIZATIONS RELOADED");
    } catch (err) {
      console.error("[PlatformOrganizations] RESET FAILED", err);

      Alert.alert(
        "Reset failed",
        err instanceof Error
          ? err.message
          : "Unable to reset local organization data.",
      );
    }
  }, [loadOrganizations, setActiveBusiness]);

  useEffect(() => {
    void loadOrganizations();
  }, [loadOrganizations]);

  const sortedOrganizations = [...organizations].sort((a, b) => {
    if (a.id === currentOrganization.id) {
      return -1;
    }

    if (b.id === currentOrganization.id) {
      return 1;
    }

    return a.name.localeCompare(b.name);
  });

  const openOrganization = (organizationId: string) => {
    setActiveBusiness(organizationId);
    router.replace(APP_ROUTES.orgAdmin.root);
  };

  return (
    <ScrollView
      style={[
        styles.scroll,
        {
          backgroundColor: theme.colors.background,
        },
      ]}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text variant="title" color="text">
            Organizations
          </Text>

          <Text variant="bodySmall" color="textMuted">
            Manage businesses onboarded to Memgine.
          </Text>
        </View>

        <View style={styles.headerActions}>
          <Pressable
            onPress={() =>
              router.push(APP_ROUTES.platformAdmin.organizationNew as never)
            }
            style={({ pressed }) => [
              styles.primaryButton,
              {
                backgroundColor: theme.colors.primary,
                opacity: pressed ? theme.states.pressedOpacity : 1,
              },
            ]}
          >
            <Text variant="bodyStrong" color="text">
              + Onboard New Business
            </Text>
          </Pressable>

          {__DEV__ ? (
            <Pressable
              onPress={handleResetLocalOrganizations}
              style={({ pressed }) => [
                styles.resetButton,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: pressed
                    ? theme.colors.surfaceAlt
                    : theme.colors.card,
                  opacity: pressed ? theme.states.pressedOpacity : 1,
                },
              ]}
            >
              <Text variant="bodyStrong" color="text">
                Reset Local Data
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {loading ? (
        <Text variant="bodySmall" color="textMuted">
          Loading organizations...
        </Text>
      ) : null}

      {error ? (
        <View
          style={[
            styles.error,
            {
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Text variant="bodySmall" color="text">
            {error}
          </Text>
        </View>
      ) : null}

      {!loading && !error ? (
        <>
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text variant="h2" color="text">
                Current Organization
              </Text>

              <Text variant="bodySmall" color="textMuted">
                The organization currently active in the application.
              </Text>
            </View>

            <OrganizationCard
              organization={currentOrganization}
              isCurrent
              onOpen={() => openOrganization(currentOrganization.id)}
            />
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text variant="h2" color="text">
                Other Organizations
              </Text>

              <Text variant="bodySmall" color="textMuted">
                Select an organization to open its Organization Admin.
              </Text>
            </View>

            <View style={styles.organizationList}>
              {sortedOrganizations
                .filter(
                  (organization) => organization.id !== currentOrganization.id,
                )
                .map((organization) => (
                  <OrganizationCard
                    key={organization.id}
                    organization={organization}
                    onOpen={() => openOrganization(organization.id)}
                  />
                ))}

              {sortedOrganizations.filter(
                (organization) => organization.id !== currentOrganization.id,
              ).length === 0 ? (
                <Text variant="bodySmall" color="textMuted">
                  No other organizations are available.
                </Text>
              ) : null}
            </View>
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

function OrganizationCard({
  organization,
  isCurrent = false,
  onOpen,
}: {
  organization: Organization;
  isCurrent?: boolean;
  onOpen: () => void;
}) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.organizationCard,
        {
          backgroundColor: theme.colors.card,
          borderColor: isCurrent ? theme.colors.primary : theme.colors.border,
        },
      ]}
    >
      <View style={styles.organizationInfo}>
        <View style={styles.organizationTitleRow}>
          <Text variant="h2" color="text" numberOfLines={1}>
            {organization.name}
          </Text>

          {isCurrent ? (
            <View
              style={[
                styles.currentBadge,
                {
                  backgroundColor: theme.colors.surfaceAlt,
                },
              ]}
            >
              <Text variant="caption" color="text">
                Current
              </Text>
            </View>
          ) : null}
        </View>

        <Text variant="bodySmall" color="textMuted">
          {organization.category}
        </Text>

        <Text variant="caption" color="textMuted">
          {organization.primaryEmail}
        </Text>
      </View>

      <Pressable
        onPress={onOpen}
        style={({ pressed }) => [
          styles.openButton,
          {
            borderColor: theme.colors.border,
            backgroundColor: pressed
              ? theme.colors.surfaceAlt
              : theme.colors.card,
          },
        ]}
      >
        <Text variant="bodyStrong" color="text">
          Open Organization
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },

  container: {
    padding: 24,
    gap: 32,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 24,
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
    minHeight: 46,
    paddingHorizontal: 18,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },

  resetButton: {
    minHeight: 46,
    paddingHorizontal: 18,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  section: {
    gap: 16,
  },

  sectionHeader: {
    gap: 4,
  },

  organizationList: {
    gap: 14,
  },

  organizationCard: {
    width: "100%",
    minHeight: 120,
    padding: 20,
    borderWidth: 1,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 24,
  },

  organizationInfo: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },

  organizationTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  currentBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },

  openButton: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },

  error: {
    padding: 14,
    borderWidth: 1,
    borderRadius: 8,
  },
});
