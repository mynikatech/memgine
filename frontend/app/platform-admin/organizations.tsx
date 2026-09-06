import { router } from "expo-router";

import { useCallback, useEffect, useState } from "react";

import { Pressable, ScrollView, StyleSheet, View } from "react-native";

import { APP_ROUTES } from "@/src/constants/navigation";

import {
  DEFAULT_ACTIVE_ORG_ID,
  services,
  type ReferenceDataItem,
  type Organization,
} from "@/src/core";

import { resetLocalOrganizations } from "@/src/data/persistence/local/reset";

import { useBusiness } from "@/src/providers";

import { COLORS, RADIUS, SPACING } from "@/src/theme/colors";

import { Text } from "@/src/ui";

type PendingAction = {
  type: "activate" | "deactivate" | "delete";
  organization: Organization;
} | null;

export default function PlatformOrganizations() {
  /*
   * The active organization remains the application's working context.
   *
   * It does NOT control the Platform Admin theme.
   */
  const { organization: currentOrganization, setActiveBusiness } =
    useBusiness();

  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organizationTypes, setOrganizationTypes] = useState<
    ReferenceDataItem[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [busyOrganizationId, setBusyOrganizationId] = useState<string | null>(
    null,
  );

  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  const loadOrganizations = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const [result, organizationTypeResult] = await Promise.all([
        services.organization.listOrganizations(),
        services.referenceData.listOrganizationTypes(),
      ]);

      /*
       * Deleted organizations are soft-deleted and therefore excluded
       * from the normal Platform Admin organization catalogue.
       */
      setOrganizations(
        result.filter((organization) => !organization.isDeleted),
      );
      setOrganizationTypes(organizationTypeResult);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to load organizations.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const getOrganizationTypeName = useCallback(
    (organization: Organization): string => {
      return (
        organizationTypes.find(
          (organizationType) =>
            organizationType.id === organization.organizationTypeId,
        )?.name ?? "Unknown Organization Type"
      );
    },
    [organizationTypes],
  );

  useEffect(() => {
    void loadOrganizations();
  }, [loadOrganizations]);

  /**
   * Development-only local reset.
   */
  const handleResetLocalOrganizations = useCallback(async () => {
    try {
      setError("");

      await resetLocalOrganizations();

      setActiveBusiness(DEFAULT_ACTIVE_ORG_ID);

      await loadOrganizations();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to reset local organization data.",
      );
    }
  }, [loadOrganizations, setActiveBusiness]);

  /*
   * IMPORTANT:
   *
   * Edit stays in Platform Admin.
   *
   * Do NOT route this through orgAdmin.business.
   */
  const editOrganization = useCallback((organizationId: string) => {
    router.push({
      pathname: APP_ROUTES.platformAdmin.organizationNew,
      params: {
        organizationId,
      },
    });
  }, []);

  /**
   * Open Organization is the explicit hand-off into Organization Admin.
   */
  const openOrganization = useCallback(
    (organizationId: string) => {
      setActiveBusiness(organizationId);

      router.replace(APP_ROUTES.orgAdmin.root);
    },
    [setActiveBusiness],
  );

  /**
   * Resolve and persist an organization lifecycle status.
   *
   * The persisted organization is also written directly into local React
   * state after a successful update so the UI changes immediately without
   * requiring a browser refresh.
   */
  const updateOrganizationStatus = useCallback(
    async (organization: Organization, statusCode: "ACTIVE" | "INACTIVE") => {
      if (busyOrganizationId) {
        return;
      }

      try {
        setBusyOrganizationId(organization.id);
        setError("");

        const status = await services.status.getStatusByCode(statusCode);

        if (!status) {
          throw new Error(
            `Organization status '${statusCode}' could not be resolved.`,
          );
        }

        const updatedOrganization: Organization = {
          ...organization,
          organizationStatusId: status.id,
          updatedAt: new Date().toISOString(),
          updatedBy: "user-system",
          versionNo: organization.versionNo + 1,
        };

        /*
         * Persist first.
         */
        await services.organization.updateOrganization(
          organization.id,
          updatedOrganization,
        );

        /*
         * Then immediately update the screen's local state.
         *
         * This is important because the Current Organization card can
         * otherwise continue rendering the old organization object from
         * useBusiness() until a full reload.
         */
        setOrganizations((previousOrganizations) =>
          previousOrganizations.map((item) =>
            item.id === organization.id ? updatedOrganization : item,
          ),
        );

        /*
         * Close the confirmation card after a successful update.
         */
        setPendingAction(null);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Unable to update the organization status.",
        );
      } finally {
        setBusyOrganizationId(null);
      }
    },
    [busyOrganizationId],
  );

  /**
   * Request activation confirmation.
   */
  const requestActivate = useCallback((organization: Organization) => {
    setPendingAction({
      type: "activate",
      organization,
    });
  }, []);

  /**
   * Request deactivation confirmation.
   */
  const requestDeactivate = useCallback((organization: Organization) => {
    setPendingAction({
      type: "deactivate",
      organization,
    });
  }, []);

  /**
   * Delete remains a soft delete.
   */
  const requestDelete = useCallback((organization: Organization) => {
    setPendingAction({
      type: "delete",
      organization,
    });
  }, []);

  const confirmPendingAction = useCallback(async () => {
    if (!pendingAction || busyOrganizationId) {
      return;
    }

    const { organization, type } = pendingAction;

    if (type === "activate") {
      await updateOrganizationStatus(organization, "ACTIVE");
      return;
    }

    if (type === "deactivate") {
      await updateOrganizationStatus(organization, "INACTIVE");
      return;
    }

    try {
      setBusyOrganizationId(organization.id);
      setError("");

      const deletedOrganization: Organization = {
        ...organization,
        isDeleted: true,
        updatedAt: new Date().toISOString(),
        updatedBy: "user-system",
        versionNo: organization.versionNo + 1,
      };

      await services.organization.updateOrganization(
        organization.id,
        deletedOrganization,
      );

      /*
       * If the deleted organization is currently active, move the
       * application context back to the default organization.
       */
      if (organization.id === currentOrganization.id) {
        setActiveBusiness(DEFAULT_ACTIVE_ORG_ID);
      }

      setPendingAction(null);

      await loadOrganizations();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to delete the organization.",
      );
    } finally {
      setBusyOrganizationId(null);
    }
  }, [
    busyOrganizationId,
    currentOrganization.id,
    loadOrganizations,
    pendingAction,
    setActiveBusiness,
    updateOrganizationStatus,
  ]);

  /*
   * The current organization may have just been activated/deactivated.
   *
   * useBusiness() does not necessarily change immediately when the
   * Platform Admin lifecycle status changes, so prefer the freshly
   * updated organization from this screen's state when available.
   */
  const displayedCurrentOrganization =
    organizations.find(
      (organization) => organization.id === currentOrganization.id,
    ) ?? currentOrganization;

  /*
   * The active organization is deliberately shown first.
   */
  const sortedOrganizations = [...organizations].sort((a, b) => {
    if (a.id === currentOrganization.id) {
      return -1;
    }

    if (b.id === currentOrganization.id) {
      return 1;
    }

    return a.name.localeCompare(b.name);
  });

  const otherOrganizations = sortedOrganizations.filter(
    (organization) => organization.id !== currentOrganization.id,
  );

  return (
    <ScrollView
      style={styles.scroll}
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
              router.push(APP_ROUTES.platformAdmin.organizationNew)
            }
            style={({ pressed }) => [
              styles.primaryButton,
              {
                opacity: pressed ? 0.85 : 1,
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
                  backgroundColor: pressed ? COLORS.surface : COLORS.background,
                  opacity: pressed ? 0.85 : 1,
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
        <View style={styles.error}>
          <Text variant="bodySmall" color="text">
            {error}
          </Text>
        </View>
      ) : null}

      {pendingAction ? (
        <View style={styles.confirmationCard}>
          <View style={styles.confirmationText}>
            <Text variant="bodyStrong" color="text">
              {pendingAction.type === "activate"
                ? "Activate organization?"
                : pendingAction.type === "deactivate"
                  ? "Deactivate organization?"
                  : "Delete organization?"}
            </Text>

            <Text variant="bodySmall" color="textMuted">
              {pendingAction.type === "activate"
                ? `"${pendingAction.organization.name}" will be marked active and available for use.`
                : pendingAction.type === "deactivate"
                  ? `"${pendingAction.organization.name}" will remain in Platform Admin but will be marked inactive.`
                  : `"${pendingAction.organization.name}" will be soft-deleted and removed from the active organization list.`}
            </Text>
          </View>

          <View style={styles.confirmationActions}>
            <Pressable
              disabled={!!busyOrganizationId}
              onPress={() => setPendingAction(null)}
              style={({ pressed }) => [
                styles.actionButton,
                {
                  opacity: busyOrganizationId ? 0.5 : pressed ? 0.85 : 1,
                },
              ]}
            >
              <Text variant="bodyStrong" color="text">
                Cancel
              </Text>
            </Pressable>

            <Pressable
              disabled={!!busyOrganizationId}
              onPress={() => void confirmPendingAction()}
              style={({ pressed }) => [
                styles.confirmButton,
                {
                  opacity: busyOrganizationId ? 0.5 : pressed ? 0.85 : 1,
                },
              ]}
            >
              <Text variant="bodyStrong" color="text">
                {busyOrganizationId
                  ? "Updating..."
                  : pendingAction.type === "activate"
                    ? "Activate"
                    : pendingAction.type === "deactivate"
                      ? "Deactivate"
                      : "Delete"}
              </Text>
            </Pressable>
          </View>
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
              organization={displayedCurrentOrganization}
              isCurrent
              busy={busyOrganizationId === displayedCurrentOrganization.id}
              organizationTypeName={getOrganizationTypeName(
                currentOrganization,
              )}
              onOpen={() => openOrganization(displayedCurrentOrganization.id)}
              onEdit={() => editOrganization(displayedCurrentOrganization.id)}
              onActivate={() => requestActivate(displayedCurrentOrganization)}
              onDeactivate={() =>
                requestDeactivate(displayedCurrentOrganization)
              }
              onDelete={() => requestDelete(displayedCurrentOrganization)}
            />
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text variant="h2" color="text">
                Other Organizations
              </Text>

              <Text variant="bodySmall" color="textMuted">
                Select an organization to work with or manage it directly from
                Platform Admin.
              </Text>
            </View>

            <View style={styles.organizationList}>
              {otherOrganizations.map((organization) => (
                <OrganizationCard
                  key={organization.id}
                  organization={organization}
                  busy={busyOrganizationId === organization.id}
                  organizationTypeName={getOrganizationTypeName(
                    currentOrganization,
                  )}
                  onOpen={() => openOrganization(organization.id)}
                  onEdit={() => editOrganization(organization.id)}
                  onActivate={() => requestActivate(organization)}
                  onDeactivate={() => requestDeactivate(organization)}
                  onDelete={() => requestDelete(organization)}
                />
              ))}

              {otherOrganizations.length === 0 ? (
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
  busy,
  organizationTypeName,
  onOpen,
  onEdit,
  onActivate,
  onDeactivate,
  onDelete,
}: {
  organization: Organization;
  isCurrent?: boolean;
  busy: boolean;
  organizationTypeName: string;
  onOpen: () => void;
  onEdit: () => void;
  onActivate: () => void;
  onDeactivate: () => void;
  onDelete: () => void;
}) {
  const isInactive = organization.organizationStatusId === "status-inactive";

  return (
    <View
      style={[
        styles.organizationCard,
        isCurrent && styles.currentOrganizationCard,
      ]}
    >
      <View style={styles.organizationInfo}>
        <View style={styles.organizationTitleRow}>
          <Text variant="h2" color="text" numberOfLines={1}>
            {organization.name}
          </Text>

          {isCurrent ? (
            <View style={styles.currentBadge}>
              <Text variant="caption" color="text">
                Current
              </Text>
            </View>
          ) : null}

          <View style={styles.statusBadge}>
            <Text variant="caption" color="text">
              {isInactive ? "Inactive" : "Active"}
            </Text>
          </View>
        </View>

        <Text variant="bodySmall" color="textMuted">
          {organizationTypeName}
        </Text>

        <Text variant="caption" color="textMuted">
          {organization.primaryEmail}
        </Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          disabled={busy}
          onPress={onOpen}
          style={({ pressed }) => [
            styles.actionButton,
            {
              opacity: busy ? 0.5 : pressed ? 0.85 : 1,
            },
          ]}
        >
          <Text variant="bodyStrong" color="text">
            Open Organization
          </Text>
        </Pressable>

        <Pressable
          disabled={busy}
          onPress={onEdit}
          style={({ pressed }) => [
            styles.actionButton,
            {
              opacity: busy ? 0.5 : pressed ? 0.85 : 1,
            },
          ]}
        >
          <Text variant="bodyStrong" color="text">
            Edit Organization
          </Text>
        </Pressable>

        {isInactive ? (
          <Pressable
            disabled={busy}
            onPress={onActivate}
            style={({ pressed }) => [
              styles.actionButton,
              {
                opacity: busy ? 0.5 : pressed ? 0.85 : 1,
              },
            ]}
          >
            <Text variant="bodyStrong" color="text">
              {busy ? "Updating..." : "Activate"}
            </Text>
          </Pressable>
        ) : (
          <Pressable
            disabled={busy}
            onPress={onDeactivate}
            style={({ pressed }) => [
              styles.actionButton,
              {
                opacity: busy ? 0.5 : pressed ? 0.85 : 1,
              },
            ]}
          >
            <Text variant="bodyStrong" color="text">
              {busy ? "Updating..." : "Deactivate"}
            </Text>
          </Pressable>
        )}

        <Pressable
          disabled={busy}
          onPress={onDelete}
          style={({ pressed }) => [
            styles.deleteButton,
            {
              opacity: busy ? 0.5 : pressed ? 0.85 : 1,
            },
          ]}
        >
          <Text variant="bodyStrong" color="text">
            Delete
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  container: {
    padding: SPACING.md,
    gap: SPACING.lg,
    backgroundColor: COLORS.background,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.md,
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
    borderRadius: RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.accent,
  },

  resetButton: {
    minHeight: 46,
    paddingHorizontal: 18,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
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
    minHeight: 130,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 24,
    backgroundColor: COLORS.background,
  },

  currentOrganizationCard: {
    borderColor: COLORS.accent,
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
    backgroundColor: COLORS.accentSoft,
  },

  statusBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: COLORS.surface,
  },

  actions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    flexWrap: "wrap",
    maxWidth: 760,
  },

  actionButton: {
    minHeight: 42,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.background,
  },

  confirmButton: {
    minHeight: 42,
    paddingHorizontal: 16,
    borderRadius: RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.accent,
  },

  deleteButton: {
    minHeight: 42,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.background,
  },

  confirmationCard: {
    width: "100%",
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 20,
  },

  confirmationText: {
    flex: 1,
    gap: 5,
  },

  confirmationActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  error: {
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.background,
  },
});
