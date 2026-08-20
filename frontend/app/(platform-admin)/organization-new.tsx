import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import {
  onboardOrganization,
  services,
  type ReferenceDataItem,
} from "@/src/core";

import { useBusiness, useTheme } from "@/src/providers";
import { Text } from "@/src/ui";

export default function OrganizationNew() {
  const theme = useTheme();

  const { setActiveBusiness } = useBusiness();

  const [organizationTypes, setOrganizationTypes] = useState<
    ReferenceDataItem[]
  >([]);

  const [loadingTypes, setLoadingTypes] = useState(true);

  const [businessName, setBusinessName] = useState("");

  const [organizationTypeId, setOrganizationTypeId] = useState("");

  const [typeOpen, setTypeOpen] = useState(false);

  const [busy, setBusy] = useState(false);

  const [error, setError] = useState("");

  const [nameTouched, setNameTouched] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadOrganizationTypes = async () => {
      try {
        setLoadingTypes(true);

        const types = await services.referenceData.listOrganizationTypes();

        if (!mounted) {
          return;
        }

        setOrganizationTypes(types.filter((item) => item.active));
      } catch (err) {
        if (!mounted) {
          return;
        }

        setError(
          err instanceof Error ? err.message : "Unable to load business types.",
        );
      } finally {
        if (mounted) {
          setLoadingTypes(false);
        }
      }
    };

    void loadOrganizationTypes();

    return () => {
      mounted = false;
    };
  }, []);

  const selectedType = useMemo(
    () => organizationTypes.find((item) => item.id === organizationTypeId),
    [organizationTypes, organizationTypeId],
  );

  const nameError =
    nameTouched &&
    businessName.trim().length > 0 &&
    businessName.trim().length < 2
      ? "Business name must contain at least 2 characters."
      : nameTouched && businessName.trim().length > 150
        ? "Business name must not exceed 150 characters."
        : "";

  const canCreate =
    businessName.trim().length >= 2 &&
    businessName.trim().length <= 150 &&
    !!organizationTypeId &&
    !busy &&
    !loadingTypes;

  const handleCreate = async () => {
    setNameTouched(true);
    setError("");

    if (businessName.trim().length < 2) {
      setError("Please enter a valid business name.");
      return;
    }

    if (businessName.trim().length > 150) {
      setError("Business name must not exceed 150 characters.");
      return;
    }

    if (!organizationTypeId) {
      setError("Please select a business type.");
      return;
    }

    try {
      setBusy(true);

      console.log("PLATFORM ORGANIZATION ONBOARDING START", {
        businessName: businessName.trim(),

        organizationTypeId,
      });

      const result = await onboardOrganization({
        name: businessName.trim(),

        organizationTypeId,
      });

      console.log("PLATFORM ORGANIZATION ONBOARDING COMPLETE", {
        organizationId: result.organization.id,

        organizationName: result.organization.name,

        organizationTypeId: result.organization.organizationTypeId,

        templateId: result.context.template.id,
      });

      /*
       * The newly created organization becomes
       * the active organization only after successful
       * onboarding.
       */
      setActiveBusiness(result.organization.id);

      router.replace("/dashboard");
    } catch (err) {
      console.error("PLATFORM ORGANIZATION ONBOARDING ERROR", err);

      setError(
        err instanceof Error ? err.message : "Unable to create the business.",
      );
    } finally {
      setBusy(false);
    }
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
        <Text variant="title" color="text">
          Onboard New Business
        </Text>

        <Text variant="bodySmall" color="textMuted">
          Create a new business using the Memgine starter experience for its
          business type.
        </Text>
      </View>

      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.colors.card,
            borderColor: theme.colors.border,
          },
        ]}
      >
        <View style={styles.section}>
          <Text variant="h2" color="text">
            Business Details
          </Text>

          <Text variant="bodySmall" color="textMuted">
            Only the minimum information is required to get the business
            started. The Organization Admin can configure the remaining details
            after onboarding.
          </Text>
        </View>

        <View style={styles.field}>
          <Text variant="bodySmall" color="textMuted">
            Business Name
          </Text>

          <TextInput
            value={businessName}
            onChangeText={(value) => {
              setBusinessName(value);

              if (error) {
                setError("");
              }
            }}
            onBlur={() => setNameTouched(true)}
            placeholder="Enter business name"
            placeholderTextColor={theme.colors.textMuted}
            editable={!busy}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="done"
            maxLength={150}
            style={[
              styles.input,
              {
                color: theme.colors.text,
                borderColor: nameError
                  ? theme.colors.primary
                  : theme.colors.border,
                backgroundColor: theme.colors.card,
              },
            ]}
          />

          {nameError ? (
            <Text variant="caption" color="textMuted">
              {nameError}
            </Text>
          ) : null}
        </View>

        <View style={styles.field}>
          <Text variant="bodySmall" color="textMuted">
            Business Type
          </Text>

          <Pressable
            disabled={busy || loadingTypes}
            onPress={() => setTypeOpen((value) => !value)}
            style={[
              styles.select,
              {
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.card,
                opacity: busy || loadingTypes ? 0.6 : 1,
              },
            ]}
          >
            <Text variant="body" color={selectedType ? "text" : "textMuted"}>
              {loadingTypes
                ? "Loading business types..."
                : (selectedType?.name ?? "Select business type")}
            </Text>

            <Text variant="body" color="textMuted">
              {typeOpen ? "▲" : "▼"}
            </Text>
          </Pressable>

          {typeOpen && !loadingTypes ? (
            <View
              style={[
                styles.options,
                {
                  backgroundColor: theme.colors.card,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              {organizationTypes.map((item, index) => (
                <Pressable
                  key={item.id}
                  disabled={busy}
                  onPress={() => {
                    setOrganizationTypeId(item.id);
                    setTypeOpen(false);
                    setError("");
                  }}
                  style={[
                    styles.option,
                    {
                      borderBottomColor: theme.colors.border,
                      borderBottomWidth:
                        index === organizationTypes.length - 1 ? 0 : 1,
                    },
                  ]}
                >
                  <Text variant="body" color="text">
                    {item.name}
                  </Text>

                  {item.id === organizationTypeId ? (
                    <Text variant="body" color="textMuted">
                      ✓
                    </Text>
                  ) : null}
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>

        {selectedType ? (
          <View
            style={[
              styles.templateCard,
              {
                backgroundColor: theme.colors.surfaceAlt,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <Text variant="bodyStrong" color="text">
              Memgine Starter Experience
            </Text>

            <Text variant="bodySmall" color="textMuted">
              A starter experience appropriate for {selectedType.name} will be
              copied into the new organization. The organization will own its
              configuration and can customize branding, memberships, benefits,
              offers, stores and integrations after onboarding.
            </Text>
          </View>
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

        <Pressable
          disabled={!canCreate}
          onPress={handleCreate}
          style={({ pressed }) => [
            styles.createButton,
            {
              backgroundColor: theme.colors.primary,

              opacity: !canCreate
                ? 0.5
                : pressed
                  ? theme.states.pressedOpacity
                  : 1,
            },
          ]}
        >
          <Text variant="bodyStrong" color="text">
            {busy ? "Creating Business..." : "Create Business"}
          </Text>
        </Pressable>

        <Pressable
          disabled={busy}
          onPress={() => router.replace("/organizations")}
          style={[
            styles.cancelButton,
            {
              opacity: busy ? 0.5 : 1,
            },
          ]}
        >
          <Text variant="bodySmall" color="textMuted">
            Cancel
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },

  container: {
    padding: 24,
    gap: 24,
  },

  header: {
    gap: 6,
  },

  card: {
    width: "100%",
    maxWidth: 760,
    padding: 24,
    borderWidth: 1,
    borderRadius: 12,
    gap: 22,
  },

  section: {
    gap: 6,
  },

  field: {
    gap: 8,
  },

  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },

  select: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  options: {
    borderWidth: 1,
    borderRadius: 8,
    overflow: "hidden",
  },

  option: {
    minHeight: 44,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  templateCard: {
    padding: 16,
    borderWidth: 1,
    borderRadius: 8,
    gap: 6,
  },

  error: {
    padding: 14,
    borderWidth: 1,
    borderRadius: 8,
  },

  createButton: {
    minHeight: 48,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },

  cancelButton: {
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
  },
});
