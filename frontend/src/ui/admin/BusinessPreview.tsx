import { StyleSheet, View } from "react-native";
import { useEffect, useState } from "react";

import type {
  Address,
  Organization,
  OrganizationDetails,
  PhoneNumber,
  ReferenceDataItem,
  Status,
} from "@/src/core";

import { services } from "@/src/core";
import { useTheme } from "@/src/providers";

import { Badge, Card, Section, Text } from "@/src/ui";
import { BusinessExperience } from "@/src/experience/BusinessExperience";

type BusinessPreviewProps = {
  currentOrganization: Organization;
  currentDetails: OrganizationDetails | null;

  proposedOrganization: Organization;
  proposedDetails: OrganizationDetails;

  organizationTypes: ReferenceDataItem[];
  organizationStatuses: Status[];
  countries: {
    id: string;
    name: string;
    countryCode: string;
    callingCode: string;
  }[];
};

type DiffItem = {
  label: string;
  current: string;
  proposed: string;
};

function display(value: string | undefined | null): string {
  const normalized = value?.trim();
  return normalized ? normalized : "—";
}

function phoneDisplay(phone?: PhoneNumber | null): string {
  if (!phone?.number?.trim()) {
    return "—";
  }

  return `${phone.callingCode ?? ""} ${phone.number.trim()}`.trim();
}

function addressDisplay(
  address?: Address | null,
  countries?: BusinessPreviewProps["countries"],
): string {
  if (!address) {
    return "—";
  }

  const country = countries?.find(
    (item) => item.countryCode === address.countryCode,
  );

  const parts = [
    address.line1,
    address.line2,
    address.city,
    address.region,
    address.postalCode,
    country?.name ?? address.countryCode,
  ].filter(Boolean);

  return parts.length ? parts.join(", ") : "—";
}

function typeName(id: string, items: ReferenceDataItem[]): string {
  return items.find((item) => item.id === id)?.name ?? id ?? "—";
}

function statusName(id: string, items: Status[]): string {
  return items.find((item) => item.id === id)?.statusName ?? id ?? "—";
}

function addDiff(
  diffs: DiffItem[],
  label: string,
  current: string,
  proposed: string,
) {
  if (current !== proposed) {
    diffs.push({ label, current, proposed });
  }
}

function buildDiffs({
  currentOrganization,
  currentDetails,
  proposedOrganization,
  proposedDetails,
  organizationTypes,
  organizationStatuses,
  countries,
}: BusinessPreviewProps): DiffItem[] {
  const diffs: DiffItem[] = [];

  addDiff(
    diffs,
    "Business Name",
    display(currentOrganization.name),
    display(proposedOrganization.name),
  );

  addDiff(
    diffs,
    "Display Name",
    display(currentOrganization.displayName),
    display(proposedOrganization.displayName),
  );

  addDiff(
    diffs,
    "Legal Name",
    display(currentOrganization.legalName),
    display(proposedOrganization.legalName),
  );

  addDiff(
    diffs,
    "Business Type",
    typeName(currentOrganization.organizationTypeId, organizationTypes),
    typeName(proposedOrganization.organizationTypeId, organizationTypes),
  );

  addDiff(
    diffs,
    "Primary Email",
    display(currentOrganization.primaryEmail),
    display(proposedOrganization.primaryEmail),
  );

  addDiff(
    diffs,
    "Primary Phone",
    phoneDisplay(currentOrganization.primaryPhone),
    phoneDisplay(proposedOrganization.primaryPhone),
  );

  addDiff(
    diffs,
    "Website",
    display(currentOrganization.website),
    display(proposedOrganization.website),
  );

  addDiff(
    diffs,
    "Status",
    statusName(currentOrganization.organizationStatusId, organizationStatuses),
    statusName(proposedOrganization.organizationStatusId, organizationStatuses),
  );

  addDiff(
    diffs,
    "Registration Number",
    display(currentDetails?.registrationNumber),
    display(proposedDetails.registrationNumber),
  );

  addDiff(
    diffs,
    "GST / Tax Number",
    display(currentDetails?.gstNumber),
    display(proposedDetails.gstNumber),
  );

  addDiff(
    diffs,
    "Support Email",
    display(currentDetails?.supportEmail),
    display(proposedDetails.supportEmail),
  );

  addDiff(
    diffs,
    "Support Phone",
    phoneDisplay(currentDetails?.supportPhone),
    phoneDisplay(proposedDetails.supportPhone),
  );

  addDiff(
    diffs,
    "Address",
    addressDisplay(currentDetails?.address, countries),
    addressDisplay(proposedDetails.address, countries),
  );

  addDiff(
    diffs,
    "About Organization",
    display(currentDetails?.aboutOrganization),
    display(proposedDetails.aboutOrganization),
  );

  return diffs;
}

async function getCustomerExperienceContent(organizationId: string) {
  const experience =
    await services.customerExperience.getCustomerExperience(organizationId);

  return experience?.experienceDefinition.content ?? null;
}

function CustomerBusinessPreview({
  organization,
  details,
}: {
  organization: Organization;
  details: OrganizationDetails | null;
}) {
  const [content, setContent] =
    useState<Awaited<ReturnType<typeof getCustomerExperienceContent>>>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const result = await getCustomerExperienceContent(organization.id);

        if (!mounted) {
          return;
        }

        setContent(result);
      } catch (loadError) {
        if (!mounted) {
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load customer experience.",
        );
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      mounted = false;
    };
  }, [organization.id]);

  if (loading) {
    return (
      <View style={styles.customerFrame}>
        <View style={styles.previewState}>
          <Text variant="bodySmall" color="textSecondary">
            Loading customer preview...
          </Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.customerFrame}>
        <View style={styles.previewState}>
          <Text variant="bodySmall" color="textSecondary">
            {error}
          </Text>
        </View>
      </View>
    );
  }

  if (!content) {
    return (
      <View style={styles.customerFrame}>
        <View style={styles.previewState}>
          <Text variant="bodySmall" color="textSecondary">
            Customer experience is not available yet.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.customerFrame} testID="business-customer-preview">
      <BusinessExperience
        content={content}
        subscription={undefined}
        subscriptionStatus={undefined}
        product={undefined}
        benefits={[]}
        offers={[]}
        stores={[]}
        redemptions={[]}
        memberships={[]}
        selectedSubscriptionId=""
        onSelectSubscription={() => undefined}
        availableMemberships={[]}
        onJoin={() => undefined}
        onExit={() => undefined}
        hideTabBar
        previewSection="business-information"
        organizationOverride={organization}
        detailsOverride={details}
      />
    </View>
  );
}

export function BusinessPreview(props: BusinessPreviewProps) {
  const theme = useTheme();

  const diffs = buildDiffs(props);

  return (
    <Card padding="lg" elevation="sm">
      <Section title="Customer Preview">
        <Text variant="bodySmall" color="textSecondary">
          This preview uses the same customer-facing renderer as the actual
          customer experience. Only Business Information fields that are
          customer-visible are rendered here.
        </Text>

        <View style={styles.compareHeader}>
          <View style={styles.compareHeading}>
            <Text variant="title" color="text">
              Current
            </Text>

            <Badge label="LIVE" tone="brand" />
          </View>

          <View style={styles.compareHeading}>
            <Text variant="title" color="text">
              Proposed
            </Text>

            <Badge label="PROPOSED" tone="brand" />
          </View>
        </View>

        <View style={styles.compareGrid}>
          <View style={styles.compareColumn}>
            <CustomerBusinessPreview
              organization={props.currentOrganization}
              details={props.currentDetails}
            />
          </View>

          <View style={styles.compareColumn}>
            <CustomerBusinessPreview
              organization={props.proposedOrganization}
              details={props.proposedDetails}
            />
          </View>
        </View>

        <View
          style={[
            styles.diffSection,
            {
              borderTopColor: theme.colors.border,
            },
          ]}
        >
          <View style={styles.diffHeader}>
            <View style={styles.diffHeaderText}>
              <Text variant="title" color="text">
                Changes in this update
              </Text>

              <Text variant="bodySmall" color="textSecondary">
                {diffs.length === 0
                  ? "There are no unsaved changes."
                  : `${diffs.length} ${
                      diffs.length === 1 ? "change" : "changes"
                    } will be saved.`}
              </Text>
            </View>
          </View>

          {diffs.length === 0 ? (
            <View
              style={[
                styles.noChanges,
                {
                  backgroundColor: theme.colors.surfaceAlt,
                },
              ]}
            >
              <Text variant="body" color="textSecondary">
                No changes have been made.
              </Text>
            </View>
          ) : (
            <View style={{ gap: theme.spacing.sm }}>
              {diffs.map((diff) => (
                <View
                  key={diff.label}
                  style={[
                    styles.diffRow,
                    {
                      borderColor: theme.colors.border,
                    },
                  ]}
                >
                  <Text variant="label" color="text">
                    {diff.label}
                  </Text>

                  <View style={styles.diffValues}>
                    <View style={styles.diffValue}>
                      <Text variant="caption" color="textMuted">
                        Current
                      </Text>

                      <Text variant="bodySmall" color="textSecondary">
                        {diff.current}
                      </Text>
                    </View>

                    <Text variant="body" color="textMuted">
                      →
                    </Text>

                    <View style={styles.diffValue}>
                      <Text variant="caption" color="textMuted">
                        Proposed
                      </Text>

                      <Text variant="bodySmall" color="text">
                        {diff.proposed}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </Section>
    </Card>
  );
}

const styles = StyleSheet.create({
  compareHeader: {
    flexDirection: "row",
    gap: 16,
  },

  compareHeading: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },

  compareGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
  },

  compareColumn: {
    flex: 1,
    minWidth: 320,
  },

  customerFrame: {
    minHeight: 520,
    overflow: "hidden",
    borderWidth: 1,
    borderRadius: 18,
  },

  previewState: {
    minHeight: 520,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },

  diffSection: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    gap: 14,
  },

  diffHeader: {
    flexDirection: "row",
    alignItems: "center",
  },

  diffHeaderText: {
    flex: 1,
    gap: 2,
  },

  noChanges: {
    borderRadius: 10,
    padding: 14,
  },

  diffRow: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },

  diffValues: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  diffValue: {
    flex: 1,
    gap: 2,
  },
});
