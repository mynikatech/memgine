import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";

import { BUSINESS_CONTEXTS, type Organization } from "@/src/core";

import { useBusiness, useTheme } from "@/src/providers";
import { Text } from "@/src/ui";

type OrganizationContextItem = {
  organization: Organization;
};

export default function PlatformOrganizations() {
  const theme = useTheme();
  const { organization: currentOrganization, setActiveBusiness } =
    useBusiness();

  const organizations: OrganizationContextItem[] = Object.values(
    BUSINESS_CONTEXTS,
  )
    .map((context) => ({
      organization: context.organization,
    }))
    .sort((a, b) => {
      if (a.organization.id === currentOrganization.id) {
        return -1;
      }

      if (b.organization.id === currentOrganization.id) {
        return 1;
      }

      return a.organization.name.localeCompare(b.organization.name);
    });

  const openOrganization = (organizationId: string) => {
    setActiveBusiness(organizationId);
    router.replace("/dashboard");
  };

  const goToOnboarding = () => {
    router.push("/organization-new");
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
      {/* ============================================================
          HEADER
          ============================================================ */}

      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text variant="title" color="text">
            Organizations
          </Text>

          <Text variant="bodySmall" color="textMuted">
            Manage businesses onboarded to Memgine.
          </Text>
        </View>

        <Pressable
          onPress={goToOnboarding}
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
      </View>

      {/* ============================================================
          CURRENT ORGANIZATION
          ============================================================ */}

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

      {/* ============================================================
          OTHER ORGANIZATIONS
          ============================================================ */}

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
          {organizations
            .filter(
              ({ organization }) => organization.id !== currentOrganization.id,
            )
            .map(({ organization }) => (
              <OrganizationCard
                key={organization.id}
                organization={organization}
                onOpen={() => openOrganization(organization.id)}
              />
            ))}

          {organizations.filter(
            ({ organization }) => organization.id !== currentOrganization.id,
          ).length === 0 ? (
            <Text variant="bodySmall" color="textMuted">
              No other organizations are available.
            </Text>
          ) : null}
        </View>
      </View>
    </ScrollView>
  );
}

/* ==================================================================
   ORGANIZATION CARD
   ================================================================== */

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
          Organization ID: {organization.id}
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

/* ==================================================================
   STYLES
   ================================================================== */

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

  primaryButton: {
    minHeight: 46,
    paddingHorizontal: 18,
    borderRadius: 8,
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
});
