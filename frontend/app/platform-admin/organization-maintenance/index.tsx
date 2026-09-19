import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";

import { APP_ROUTES } from "@/src/constants/navigation";
import { services, type Organization } from "@/src/core";
import { useTheme } from "@/src/providers";
import { Input, Text } from "@/src/ui";

export default function OrganizationMaintenanceSelect() {
  const theme = useTheme();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    void services.organization
      .listOrganizations()
      .then((items) => {
        if (mounted) setOrganizations(items.filter((item) => !item.isDeleted));
      })
      .catch((cause) => {
        if (mounted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Unable to load organizations.",
          );
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return organizations;
    return organizations.filter(
      (organization) =>
        organization.name.toLowerCase().includes(query) ||
        organization.primaryEmail.toLowerCase().includes(query),
    );
  }, [organizations, search]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text variant="title" color="text">
          Organization Maintenance
        </Text>
        <Text variant="bodySmall" color="textMuted">
          Select an organization to maintain its Business Owners and Org Admins.
        </Text>
      </View>

      <View style={styles.search}>
        <Input
          label="Find organization"
          value={search}
          onChangeText={setSearch}
          placeholder="Search by organization name or email"
        />
      </View>

      {loading ? <Text color="textMuted">Loading organizations...</Text> : null}
      {error ? <Text color="danger">{error}</Text> : null}

      <View style={styles.list}>
        {filtered.map((organization) => (
          <Pressable
            key={organization.id}
            onPress={() =>
              router.push(
                APP_ROUTES.platformAdmin.organizationMaintenanceFor(
                  organization.id,
                ) as never,
              )
            }
            style={({ pressed }) => [
              styles.card,
              {
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface,
                opacity: pressed ? theme.states.pressedOpacity : 1,
              },
            ]}
          >
            <View style={styles.cardText}>
              <Text variant="h2" color="text">
                {organization.name}
              </Text>
              <Text variant="bodySmall" color="textMuted">
                {organization.primaryEmail}
              </Text>
            </View>
            <Text variant="bodyStrong" color="primary">
              Maintain →
            </Text>
          </Pressable>
        ))}
        {!loading && !error && filtered.length === 0 ? (
          <Text color="textMuted">No matching organizations.</Text>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 24 },
  header: { gap: 6 },
  search: { maxWidth: 560 },
  list: { gap: 12 },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  cardText: { flex: 1, gap: 4 },
});
