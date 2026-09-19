import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { APP_ROUTES } from "@/src/constants/navigation";
import {
  services,
  type AdministrativeRoleCode,
  type Organization,
  type OrganizationAdministrativeUser,
} from "@/src/core";
import { useTheme } from "@/src/providers";
import {
  Button,
  Input,
  PhoneField,
  ReferenceSelect,
  Text,
  type PhoneValue,
} from "@/src/ui";

type Draft = {
  userId?: string;
  firstName: string;
  lastName: string;
  primaryEmail: string;
  primaryPhone: string;
  phone: PhoneValue;
  roleCode: AdministrativeRoleCode;
  effectiveFrom: string;
  effectiveTo: string;
};

const roles = [
  { id: "BUSINESS_OWNER" as const, name: "Business Owner" },
  { id: "ORG_ADMIN" as const, name: "Org Admin" },
];

const blankDraft = (roleCode: AdministrativeRoleCode): Draft => ({
  firstName: "",
  lastName: "",
  primaryEmail: "",
  primaryPhone: "",
  phone: { countryId: "country-ca", callingCode: "+1", number: "" },
  roleCode,
  effectiveFrom: "",
  effectiveTo: "",
});

const dateTimeInput = (value?: string) =>
  value ? value.replace(" ", "T").replace(/\.\d+$/, "") : "";

export default function OrganizationMaintenance() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ organizationId?: string | string[] }>();
  const organizationId = Array.isArray(params.organizationId)
    ? params.organizationId[0]
    : params.organizationId;
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [users, setUsers] = useState<OrganizationAdministrativeUser[]>([]);
  const [countries, setCountries] = useState<
    Awaited<ReturnType<typeof services.referenceData.listCountries>>
  >([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError("");
    try {
      const [selected, administrativeUsers, countryItems] = await Promise.all([
        services.organization.getOrganization(organizationId),
        services.organizationMaintenance.list(organizationId),
        services.referenceData.listCountries(),
      ]);
      if (!selected) throw new Error("Organization was not found.");
      setOrganization(selected);
      setUsers(administrativeUsers);
      setCountries(countryItems);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to load organization maintenance.",
      );
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const startAdd = (roleCode: AdministrativeRoleCode) => {
    const next = blankDraft(roleCode);
    const canada = countries.find(
      (country) => country.countryCode === "CA" || country.id === "country-ca",
    );
    if (canada) {
      next.phone = {
        countryId: canada.id,
        callingCode: canada.callingCode,
        number: "",
      };
    }
    setDraft(next);
    setError("");
  };

  const startEdit = (user: OrganizationAdministrativeUser) => {
    setDraft({
      userId: user.userId,
      firstName: user.firstName,
      lastName: user.lastName ?? "",
      primaryEmail: user.primaryEmail ?? "",
      primaryPhone: user.primaryPhone,
      phone: { countryId: "", callingCode: "", number: "" },
      roleCode: user.roleCode,
      effectiveFrom: dateTimeInput(user.effectiveFrom),
      effectiveTo: dateTimeInput(user.effectiveTo),
    });
    setError("");
  };

  const save = async () => {
    if (!organizationId || !draft) return;
    const phone = draft.userId
      ? draft.primaryPhone
      : `${draft.phone.callingCode}${draft.phone.number}`;
    if (!draft.firstName.trim() || !phone) {
      setError("First name and phone are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const request = {
        firstName: draft.firstName.trim(),
        lastName: draft.lastName.trim() || undefined,
        primaryEmail: draft.primaryEmail.trim() || undefined,
        primaryPhone: phone,
        roleCode: draft.roleCode,
        effectiveFrom: draft.effectiveFrom.trim() || undefined,
        effectiveTo: draft.effectiveTo.trim() || undefined,
      };
      if (draft.userId) {
        await services.organizationMaintenance.update(
          organizationId,
          draft.userId,
          request,
        );
      } else {
        await services.organizationMaintenance.create(organizationId, request);
      }
      setDraft(null);
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to save administrative user.",
      );
    } finally {
      setSaving(false);
    }
  };

  const title = useMemo(
    () => organization?.displayName || organization?.name || "Organization",
    [organization],
  );

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text variant="title" color="text">Organization Maintenance</Text>
          <Text variant="h2" color="text">{title}</Text>
          <Text variant="bodySmall" color="textMuted">
            Maintain effective Business Owner and Org Admin assignments.
          </Text>
        </View>
        <Button
          label="Change organization"
          variant="outline"
          onPress={() =>
            router.push(APP_ROUTES.platformAdmin.organizationMaintenance as never)
          }
        />
      </View>

      <View style={styles.actions}>
        <Button label="Add Business Owner" onPress={() => startAdd("BUSINESS_OWNER")} />
        <Button label="Add Org Admin" variant="secondary" onPress={() => startAdd("ORG_ADMIN")} />
      </View>

      {loading ? <Text color="textMuted">Loading administrative users...</Text> : null}
      {error ? <Text color="danger">{error}</Text> : null}

      {draft ? (
        <View
          style={[
            styles.form,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
          ]}
        >
          <Text variant="h2" color="text">
            {draft.userId ? "Edit administrative user" : "Add administrative user"}
          </Text>
          <View style={styles.formGrid}>
            <View style={styles.field}><Input label="First name" required value={draft.firstName} onChangeText={(value) => setDraft({ ...draft, firstName: value })} /></View>
            <View style={styles.field}><Input label="Last name" value={draft.lastName} onChangeText={(value) => setDraft({ ...draft, lastName: value })} /></View>
            <View style={styles.field}><Input label="Email" value={draft.primaryEmail} keyboardType="email-address" autoCapitalize="none" onChangeText={(value) => setDraft({ ...draft, primaryEmail: value })} /></View>
            <View style={styles.field}>
              {draft.userId ? (
                <Input label="Phone" required value={draft.primaryPhone} editable={false} onChangeText={() => undefined} />
              ) : (
                <PhoneField label="Phone" required value={draft.phone} countries={countries} onChange={(value) => setDraft({ ...draft, phone: value })} maxDigits={15} />
              )}
            </View>
            <View style={styles.field}><ReferenceSelect label="Role" required value={draft.roleCode} items={roles} onChange={(value) => setDraft({ ...draft, roleCode: value as AdministrativeRoleCode })} /></View>
            <View style={styles.field}><Input label="Effective from" value={draft.effectiveFrom} placeholder="YYYY-MM-DDTHH:mm:ss (optional)" onChangeText={(value) => setDraft({ ...draft, effectiveFrom: value })} /></View>
            <View style={styles.field}><Input label="Effective to" value={draft.effectiveTo} placeholder="YYYY-MM-DDTHH:mm:ss (optional)" onChangeText={(value) => setDraft({ ...draft, effectiveTo: value })} /></View>
          </View>
          <View style={styles.actions}>
            <Button label={saving ? "Saving..." : "Save"} disabled={saving} onPress={() => void save()} />
            <Button label="Cancel" variant="outline" disabled={saving} onPress={() => setDraft(null)} />
          </View>
        </View>
      ) : null}

      <View style={styles.list}>
        {users.map((user) => (
          <View key={user.assignmentId} style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <View style={styles.cardTop}>
              <View style={styles.cardName}>
                <Text variant="h2" color="text">{user.displayName}</Text>
                <Text variant="bodyStrong" color="primary">
                  {user.roleCode === "BUSINESS_OWNER" ? "Business Owner" : "Org Admin"}
                </Text>
              </View>
              <Button label="Edit" size="sm" variant="outline" onPress={() => startEdit(user)} />
            </View>
            <View style={styles.details}>
              <Detail label="Phone" value={user.primaryPhone} />
              <Detail label="Email" value={user.primaryEmail || "—"} />
              <Detail label="Status" value="Active" />
              <Detail label="Effective From" value={user.effectiveFrom} />
              <Detail label="Effective To" value={user.effectiveTo || "No end date"} />
            </View>
          </View>
        ))}
        {!loading && !error && users.length === 0 ? (
          <Text color="textMuted">No effective Business Owner or Org Admin assignments.</Text>
        ) : null}
      </View>
    </ScrollView>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detail}>
      <Text variant="caption" color="textMuted">{label}</Text>
      <Text variant="bodySmall" color="text">{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 20 },
  header: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start", gap: 16 },
  headerText: { gap: 5, flex: 1, minWidth: 260 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  form: { borderWidth: 1, borderRadius: 12, padding: 20, gap: 18 },
  formGrid: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  field: { flexGrow: 1, flexBasis: 300, minWidth: 240 },
  list: { gap: 12 },
  card: { borderWidth: 1, borderRadius: 12, padding: 20, gap: 18 },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  cardName: { gap: 4 },
  details: { flexDirection: "row", flexWrap: "wrap", gap: 20 },
  detail: { minWidth: 150, flexGrow: 1, gap: 3 },
});
