import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { addDays, format, parseISO } from "date-fns";

import { APP_ROUTES } from "@/src/constants/navigation";
import {
  services,
  type AdministrativeRoleCode,
  type Organization,
  type OrganizationAdministrativeUser,
  type ExistingOrganizationUserLookup,
} from "@/src/core";
import { useTheme } from "@/src/providers";
import {
  Button,
  DateInput,
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

const dateInputValue = (value?: string): string => {
  if (!value) return "";

  return value.replace(" ", "T").slice(0, 10);
};

/*
 * effective_to is exclusive in the DB:
 *
 *   effective_to > CURRENT_TIMESTAMP
 *
 * The UI treats the selected "Effective to" date as inclusive.
 */
const effectiveToDateInputValue = (value?: string): string => {
  if (!value) return "";

  const normalized = value.replace(" ", "T");
  const [datePart, timePart = ""] = normalized.split("T");

  if (timePart.startsWith("00:00")) {
    return format(addDays(parseISO(datePart), -1), "yyyy-MM-dd");
  }

  return datePart;
};

const effectiveFromTimestamp = (value: string): string | undefined =>
  value ? `${value}T00:00:00` : undefined;

const effectiveToTimestamp = (value: string): string | undefined => {
  if (!value) return undefined;

  const nextDate = addDays(parseISO(value), 1);

  return `${format(nextDate, "yyyy-MM-dd")}T00:00:00`;
};

const displayDate = (value?: string): string =>
  value ? format(parseISO(dateInputValue(value)), "dd MMM yyyy") : "—";

const displayEffectiveToDate = (value?: string): string =>
  value
    ? format(parseISO(effectiveToDateInputValue(value)), "dd MMM yyyy")
    : "No end date";

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
  const [existingMatch, setExistingMatch] =
    useState<ExistingOrganizationUserLookup | null>(null);

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
    setExistingMatch(null);
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
      effectiveFrom: dateInputValue(user.effectiveFrom),
      effectiveTo: effectiveToDateInputValue(user.effectiveTo),
    });
    setExistingMatch(null);
    setError("");
  };

  const save = async (confirmedExistingUserId?: string) => {
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
      /*
       * When adding a new administrative user, first check whether
       * this phone already belongs to a global Memgine user.
       *
       * Do not silently associate that user.
       */
      if (!draft.userId && !confirmedExistingUserId) {
        const match = await services.organizationMaintenance.lookupByPhone(
          organizationId,
          phone,
        );

        if (match) {
          setExistingMatch(match);
          return;
        }
      }

      const request = {
        existingUserId: confirmedExistingUserId,
        firstName: draft.firstName.trim(),
        lastName: draft.lastName.trim() || undefined,
        primaryEmail: draft.primaryEmail.trim() || undefined,
        primaryPhone: phone,
        roleCode: draft.roleCode,
        effectiveFrom: effectiveFromTimestamp(draft.effectiveFrom.trim()),
        effectiveTo: effectiveToTimestamp(draft.effectiveTo.trim()),
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
      setExistingMatch(null);

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
          <Text variant="title" color="text">
            Organization Maintenance
          </Text>
          <Text variant="h2" color="text">
            {title}
          </Text>
          <Text variant="bodySmall" color="textMuted">
            Maintain effective Business Owner and Org Admin assignments.
          </Text>
        </View>
        <Button
          label="Change organization"
          variant="outline"
          onPress={() =>
            router.push(
              APP_ROUTES.platformAdmin.organizationMaintenance as never,
            )
          }
        />
      </View>

      <View style={styles.actions}>
        <Button
          label="Add Business Owner"
          onPress={() => startAdd("BUSINESS_OWNER")}
        />
        <Button
          label="Add Org Admin"
          variant="secondary"
          onPress={() => startAdd("ORG_ADMIN")}
        />
      </View>

      {loading ? (
        <Text color="textMuted">Loading administrative users...</Text>
      ) : null}
      {error ? <Text color="danger">{error}</Text> : null}

      {draft ? (
        <View
          style={[
            styles.form,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Text variant="h2" color="text">
            {draft.userId
              ? "Edit administrative user"
              : "Add administrative user"}
          </Text>
          <View style={styles.formGrid}>
            <View style={styles.field}>
              <Input
                label="First name"
                required
                value={draft.firstName}
                editable={!draft.userId}
                onChangeText={(value) =>
                  setDraft({ ...draft, firstName: value })
                }
              />
            </View>
            <View style={styles.field}>
              <Input
                label="Last name"
                value={draft.lastName}
                editable={!draft.userId}
                onChangeText={(value) =>
                  setDraft({ ...draft, lastName: value })
                }
              />
            </View>
            <View style={styles.field}>
              <Input
                label="Email"
                value={draft.primaryEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                editable={!draft.userId}
                onChangeText={(value) =>
                  setDraft({ ...draft, primaryEmail: value })
                }
              />
            </View>
            <View style={styles.field}>
              {draft.userId ? (
                <Input
                  label="Phone"
                  required
                  value={draft.primaryPhone}
                  editable={false}
                  onChangeText={() => undefined}
                />
              ) : (
                <PhoneField
                  label="Phone"
                  required
                  value={draft.phone}
                  countries={countries}
                  onChange={(value) => {
                    setExistingMatch(null);
                    setDraft({
                      ...draft,
                      phone: value,
                    });
                  }}
                  maxDigits={10}
                />
              )}
            </View>
            <View style={styles.field}>
              <ReferenceSelect
                label="Role"
                required
                value={draft.roleCode}
                items={roles}
                onChange={(value) =>
                  setDraft({
                    ...draft,
                    roleCode: value as AdministrativeRoleCode,
                  })
                }
              />
            </View>
            <View style={styles.field}>
              <DateInput
                label="Effective from"
                value={draft.effectiveFrom}
                placeholder="Select effective date"
                onChange={(value) =>
                  setDraft({
                    ...draft,
                    effectiveFrom: value ?? "",
                  })
                }
              />
            </View>

            <View style={styles.field}>
              <DateInput
                label="Effective to"
                value={draft.effectiveTo}
                minimumDate={draft.effectiveFrom || undefined}
                placeholder="No end date"
                onChange={(value) =>
                  setDraft({
                    ...draft,
                    effectiveTo: value ?? "",
                  })
                }
              />
            </View>
          </View>

          {draft.userId ? (
            <Text variant="bodySmall" color="textMuted">
              Name, email, and phone belong to the global Memgine user and are
              read-only here. This screen changes only the organization role and
              its effective dates.
            </Text>
          ) : null}

          {existingMatch ? (
            <View
              style={[
                styles.existingUserNotice,
                {
                  backgroundColor: theme.colors.surfaceAlt,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <Text variant="bodyStrong" color="text">
                Existing Memgine user found
              </Text>

              <Text variant="bodySmall" color="textMuted">
                {existingMatch.primaryPhone} already belongs to{" "}
                {existingMatch.displayName}. Their global profile will not be
                changed.
              </Text>

              {existingMatch.primaryEmail ? (
                <Text variant="bodySmall" color="text">
                  Email: {existingMatch.primaryEmail}
                </Text>
              ) : null}

              {existingMatch.organizations.length > 0 ? (
                <View style={styles.existingAssociations}>
                  <Text variant="bodySmall" color="textMuted">
                    Existing organization associations
                  </Text>

                  {existingMatch.organizations.map((association) => (
                    <Text
                      key={association.organizationId}
                      variant="bodySmall"
                      color="text"
                    >
                      {association.organizationName}:{" "}
                      {association.roles.length > 0
                        ? association.roles.join(", ")
                        : "Organization user"}
                    </Text>
                  ))}
                </View>
              ) : null}

              {existingMatch.alreadyInTargetOrganization ? (
                <Text variant="bodySmall" color="textMuted">
                  This user already has a relationship with this organization.
                  Confirming will add or update only the selected administrative
                  role.
                </Text>
              ) : null}

              <Text variant="bodySmall" color="text">
                Associate this user as{" "}
                {draft.roleCode === "BUSINESS_OWNER"
                  ? "Business Owner"
                  : "Org Admin"}
                ?
              </Text>

              <View style={styles.actions}>
                <Button
                  label={saving ? "Saving..." : "Use Existing User"}
                  disabled={saving}
                  onPress={() => void save(existingMatch.userId)}
                />

                <Button
                  label="Cancel"
                  variant="outline"
                  disabled={saving}
                  onPress={() => setExistingMatch(null)}
                />
              </View>
            </View>
          ) : null}

          <View style={styles.actions}>
            <Button
              label={saving ? "Saving..." : "Save"}
              disabled={saving || existingMatch !== null}
              onPress={() => void save()}
            />

            <Button
              label="Cancel"
              variant="outline"
              disabled={saving}
              onPress={() => {
                setExistingMatch(null);
                setDraft(null);
              }}
            />
          </View>
        </View>
      ) : null}

      <View style={styles.list}>
        {users.map((user) => (
          <View
            key={user.assignmentId}
            style={[
              styles.card,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <View style={styles.cardTop}>
              <View style={styles.cardName}>
                <Text variant="h2" color="text">
                  {user.displayName}
                </Text>
                <Text variant="bodyStrong" color="primary">
                  {user.roleCode === "BUSINESS_OWNER"
                    ? "Business Owner"
                    : "Org Admin"}
                </Text>
              </View>
              <Button
                label="Edit"
                size="sm"
                variant="outline"
                onPress={() => startEdit(user)}
              />
            </View>
            <View style={styles.details}>
              <Detail label="Phone" value={user.primaryPhone} />
              <Detail label="Email" value={user.primaryEmail || "—"} />
              <Detail label="Status" value="Active" />
              <Detail
                label="Effective From"
                value={displayDate(user.effectiveFrom)}
              />

              <Detail
                label="Effective To"
                value={displayEffectiveToDate(user.effectiveTo)}
              />
            </View>
          </View>
        ))}
        {!loading && !error && users.length === 0 ? (
          <Text color="textMuted">
            No effective Business Owner or Org Admin assignments.
          </Text>
        ) : null}
      </View>
    </ScrollView>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detail}>
      <Text variant="caption" color="textMuted">
        {label}
      </Text>
      <Text variant="bodySmall" color="text">
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 20 },
  header: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
  },
  headerText: { gap: 5, flex: 1, minWidth: 260 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  form: { borderWidth: 1, borderRadius: 12, padding: 20, gap: 18 },
  formGrid: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  field: { flexGrow: 1, flexBasis: 300, minWidth: 240 },
  list: { gap: 12 },
  card: { borderWidth: 1, borderRadius: 12, padding: 20, gap: 18 },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  cardName: { gap: 4 },
  details: { flexDirection: "row", flexWrap: "wrap", gap: 20 },
  detail: { minWidth: 150, flexGrow: 1, gap: 3 },
  existingUserNotice: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 16,
    gap: 10,
  },

  existingAssociations: {
    gap: 4,
  },
});
