import { router } from "expo-router";
import { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import { useBusiness, useTheme } from "@/src/providers";
import { Text } from "@/src/ui";

const BUSINESS_TYPES = [
  {
    label: "Bakery",
    value: "BAKERY",
  },
  {
    label: "Coffee Shop",
    value: "COFFEE_SHOP",
  },
  {
    label: "Salon",
    value: "SALON",
  },
  {
    label: "Gym",
    value: "GYM",
  },
  {
    label: "Other",
    value: "OTHER",
  },
];

export default function OrganizationNew() {
  const theme = useTheme();

  const { onboardBusiness, organization: currentOrganization } = useBusiness();

  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState("BAKERY");

  const [typeOpen, setTypeOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const selectedType =
    BUSINESS_TYPES.find((item) => item.value === businessType)?.label ??
    "Bakery";

  const canCreate = businessName.trim().length >= 2 && !busy;

  const handleCreate = async () => {
    if (!canCreate) {
      return;
    }

    try {
      setBusy(true);
      setError("");

      console.log("PLATFORM ORGANIZATION ONBOARDING START", {
        businessName: businessName.trim(),
        businessType,
        templateOrganizationId: currentOrganization.id,
      });

      const organization = await onboardBusiness({
        name: businessName.trim(),
        organizationType: businessType,
      });

      console.log("PLATFORM ORGANIZATION ONBOARDING COMPLETE", {
        organizationId: organization.id,
        organizationName: organization.name,
      });

      /*
       * BusinessProvider has already switched the
       * active organization to the newly created one.
       *
       * The existing Organization Admin dashboard
       * will therefore render the new business.
       */
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
      {/* ==========================================================
          HEADER
          ========================================================== */}

      <View style={styles.header}>
        <Text variant="title" color="text">
          Onboard New Business
        </Text>

        <Text variant="bodySmall" color="textMuted">
          Create a new business using the Memgine default business template.
        </Text>
      </View>

      {/* ==========================================================
          FORM CARD
          ========================================================== */}

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

        {/* ========================================================
            BUSINESS NAME
            ======================================================== */}

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
            placeholder="Enter business name"
            placeholderTextColor={theme.colors.textMuted}
            editable={!busy}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="done"
            style={[
              styles.input,
              {
                color: theme.colors.text,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.card,
              },
            ]}
          />

          {businessName.trim().length > 0 && businessName.trim().length < 2 ? (
            <Text variant="caption" color="textMuted">
              Business name must contain at least 2 characters.
            </Text>
          ) : null}
        </View>

        {/* ========================================================
            BUSINESS TYPE
            ======================================================== */}

        <View style={styles.field}>
          <Text variant="bodySmall" color="textMuted">
            Business Type
          </Text>

          <Pressable
            disabled={busy}
            onPress={() => setTypeOpen((value) => !value)}
            style={[
              styles.select,
              {
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.card,
                opacity: busy ? 0.6 : 1,
              },
            ]}
          >
            <Text variant="body" color="text">
              {selectedType}
            </Text>

            <Text variant="body" color="textMuted">
              {typeOpen ? "▲" : "▼"}
            </Text>
          </Pressable>

          {typeOpen ? (
            <View
              style={[
                styles.options,
                {
                  backgroundColor: theme.colors.card,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              {BUSINESS_TYPES.map((item, index) => (
                <Pressable
                  key={item.value}
                  disabled={busy}
                  onPress={() => {
                    setBusinessType(item.value);
                    setTypeOpen(false);
                  }}
                  style={[
                    styles.option,
                    {
                      borderBottomColor: theme.colors.border,
                      borderBottomWidth:
                        index === BUSINESS_TYPES.length - 1 ? 0 : 1,
                    },
                  ]}
                >
                  <Text variant="body" color="text">
                    {item.label}
                  </Text>

                  {item.value === businessType ? (
                    <Text variant="body" color="textMuted">
                      ✓
                    </Text>
                  ) : null}
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>

        {/* ========================================================
            DEFAULT TEMPLATE
            ======================================================== */}

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
            Default Memgine Template
          </Text>

          <Text variant="bodySmall" color="textMuted">
            The current business template will be used to initialize the new
            organization. The Organization Admin can customize configuration,
            branding, stores, memberships and benefits afterward.
          </Text>
        </View>

        {/* ========================================================
            ERROR
            ======================================================== */}

        {error ? (
          <View
            style={[
              styles.error,
              {
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.card,
              },
            ]}
          >
            <Text variant="bodySmall" color="text">
              {error}
            </Text>
          </View>
        ) : null}

        {/* ========================================================
            CREATE
            ======================================================== */}

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

        {/* ========================================================
            CANCEL
            ======================================================== */}

        <Pressable
          disabled={busy}
          onPress={() => {
            setTypeOpen(false);
            router.replace("/organizations");
          }}
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
