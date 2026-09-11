import { useEffect, useMemo, useState } from "react";

import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";

import type {
  Benefit,
  BenefitUsageRule,
  Product,
  ReferenceDataItem,
  Status,
} from "@/src/core";

import { services } from "@/src/core";

import { useBusiness } from "@/src/providers";

import { Button, DataTable, DataTableColumn, Modal, Text } from "@/src/ui";

import { BenefitForm } from "@/src/ui/admin/BenefitForm";

import { useRouter } from "expo-router";

import { APP_ROUTES } from "@/src/constants/navigation";

import { benefitDraftStore } from "@/src/core/services/benefit-draft-store";

/* -------------------------------------------------------------------------- */
/* HELPERS                                                                    */
/* -------------------------------------------------------------------------- */

function cloneBenefits(benefits: Benefit[]): Benefit[] {
  return benefits.map((benefit) => ({
    ...benefit,

    retailPrice: benefit.retailPrice
      ? {
          ...benefit.retailPrice,
        }
      : undefined,

    cost: benefit.cost
      ? {
          ...benefit.cost,
        }
      : undefined,
  }));
}

function benefitsEqual(first: Benefit[], second: Benefit[]): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}

function cloneRules(rules: BenefitUsageRule[]): BenefitUsageRule[] {
  return rules.map((rule) => ({
    ...rule,
    applicableDays: rule.applicableDays ? [...rule.applicableDays] : undefined,
  }));
}

function rulesEqual(
  first: BenefitUsageRule[],
  second: BenefitUsageRule[],
): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}

const DAY_LABELS: Record<string, string> = {
  MON: "Mon",
  TUE: "Tue",
  WED: "Wed",
  THU: "Thu",
  FRI: "Fri",
  SAT: "Sat",
  SUN: "Sun",
};

function formatFrequency(rule: BenefitUsageRule): string {
  switch (rule.frequencyType) {
    case "ONE_TIME":
      return "One-time benefit";
    case "DAILY":
      return rule.frequencyInterval === 1
        ? "Once per day"
        : `Every ${rule.frequencyInterval} days`;
    case "WEEKLY":
      return rule.frequencyInterval === 1
        ? "Once per week"
        : `Every ${rule.frequencyInterval} weeks`;
    case "MONTHLY":
      return rule.frequencyInterval === 1
        ? "Once per month"
        : `Every ${rule.frequencyInterval} months`;
    case "YEARLY":
      return rule.frequencyInterval === 1
        ? "Once per year"
        : `Every ${rule.frequencyInterval} years`;
    default:
      return "Usage restricted";
  }
}

function formatTime(value?: string): string {
  if (!value) return "";
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return value;
  const hour = Number(match[1]);
  const minute = match[2];
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minute} ${suffix}`;
}

function formatRuleSummary(rule: BenefitUsageRule): string {
  const parts: string[] = [formatFrequency(rule)];

  if (rule.frequencyType !== "ONE_TIME") {
    parts.push(
      `Up to ${rule.usageLimit} redemption${rule.usageLimit === 1 ? "" : "s"} per ${rule.frequencyType.toLowerCase()}`,
    );
  } else {
    parts.push(
      `Up to ${rule.usageLimit} redemption${rule.usageLimit === 1 ? "" : "s"}`,
    );
  }

  if (rule.applicableDays?.length && rule.applicableDays.length < 7) {
    parts.push(
      `Available ${rule.applicableDays
        .map((day) => DAY_LABELS[day] ?? day)
        .join(", ")}`,
    );
  }

  if (rule.windowStartTime || rule.windowEndTime) {
    const start = formatTime(rule.windowStartTime) || "any time";
    const end = formatTime(rule.windowEndTime) || "any time";
    parts.push(`Available ${start}–${end}`);
  }

  if (rule.timeZone && (rule.windowStartTime || rule.windowEndTime)) {
    parts.push(`(${rule.timeZone})`);
  }

  if (rule.effectiveDate) {
    parts.push(`From ${rule.effectiveDate}`);
  }

  if (rule.expiryDate) {
    parts.push(`until ${rule.expiryDate}`);
  }

  return parts.join(" • ");
}

/* -------------------------------------------------------------------------- */
/* MAIN                                                                       */
/* -------------------------------------------------------------------------- */

export default function OrgAdminBenefits() {
  const { organization } = useBusiness();

  const router = useRouter();

  /*
   * Page opens in View mode.
   *
   * Editing must be explicitly enabled.
   */
  const [isEditing, setIsEditing] = useState(false);

  /*
   * Last successfully persisted state.
   *
   * This is the "Current" state.
   */
  const [committedBenefits, setCommittedBenefits] = useState<Benefit[]>([]);

  const [committedRules, setCommittedRules] = useState<BenefitUsageRule[]>([]);

  /*
   * Working state.
   *
   * This is the "Proposed" state while Edit mode is active.
   */
  const [benefits, setBenefits] = useState<Benefit[]>([]);

  const [rules, setRules] = useState<BenefitUsageRule[]>([]);

  const [benefitCategories, setBenefitCategories] = useState<
    ReferenceDataItem[]
  >([]);

  const [benefitTypes, setBenefitTypes] = useState<ReferenceDataItem[]>([]);

  const [benefitStatuses, setBenefitStatuses] = useState<Status[]>([]);

  const [products, setProducts] = useState<Product[]>([]);

  const [loading, setLoading] = useState(true);

  const [saving, setSaving] = useState(false);

  const [formVisible, setFormVisible] = useState(false);

  const [editingBenefit, setEditingBenefit] = useState<Benefit | null>(null);

  const [viewingBenefit, setViewingBenefit] = useState<Benefit | null>(null);

  /* ---------------------------------------------------------------------- */
  /* LOAD                                                                   */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);

      try {
        const [
          persistedBenefits,
          categoryList,
          typeList,
          statusList,
          productList,
        ] = await Promise.all([
          services.benefit.listByOrganization(organization.id),

          services.referenceData.listBenefitCategories(),

          services.referenceData.listBenefitTypes(),

          services.status.listBenefitStatuses(),

          services.product.listProducts(organization.id),
        ]);

        const loadedRules = await services.benefitUsageRule.listByBenefits(
          persistedBenefits.map((item) => item.id),
        );

        if (!mounted) {
          return;
        }

        const persistedSnapshot = cloneBenefits(persistedBenefits);

        /*
         * Restore an existing unsaved draft if one exists.
         */
        const existingDraft = benefitDraftStore.get(organization.id);

        const workingSnapshot = existingDraft
          ? cloneBenefits(existingDraft)
          : cloneBenefits(persistedSnapshot);

        setCommittedBenefits(cloneBenefits(persistedSnapshot));

        setCommittedRules(cloneRules(loadedRules));

        setBenefits(workingSnapshot);

        setRules(cloneRules(loadedRules));

        setBenefitCategories(categoryList);

        setBenefitTypes(typeList);

        setBenefitStatuses(statusList);

        setProducts(productList);

        /*
         * Every fresh organization load starts in View mode.
         */
        setIsEditing(false);
      } catch (error) {
        if (!mounted) {
          return;
        }

        Alert.alert(
          "Unable to load benefits",
          error instanceof Error ? error.message : "Unable to load benefits.",
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

  /* ---------------------------------------------------------------------- */
  /* DERIVED                                                                */
  /* ---------------------------------------------------------------------- */

  const hasChanges = useMemo(
    () =>
      !benefitsEqual(committedBenefits, benefits) ||
      !rulesEqual(committedRules, rules),
    [committedBenefits, benefits, committedRules, rules],
  );

  const visibleBenefits = useMemo(
    () => benefits.filter((benefit) => !benefit.isDeleted),
    [benefits],
  );

  /* ---------------------------------------------------------------------- */
  /* LOOKUPS                                                                */
  /* ---------------------------------------------------------------------- */

  const getCategoryName = (id: string) =>
    benefitCategories.find((item) => item.id === id)?.name ?? "Unknown";

  const getTypeName = (id: string) =>
    benefitTypes.find((item) => item.id === id)?.name ?? "Unknown";

  const getStatusName = (id: string) =>
    benefitStatuses.find((item) => item.id === id)?.statusName ?? "Unknown";

  const getProductName = (id?: string) => {
    if (!id) {
      return "—";
    }

    const product = products.find((item) => item.id === id);

    return product?.productName ?? product?.productCode ?? "Unknown";
  };

  const getDisplayName = (benefit: Benefit) =>
    benefit.displayName ?? benefit.benefitName;

  /* ---------------------------------------------------------------------- */
  /* BENEFIT CODE                                                           */
  /* ---------------------------------------------------------------------- */

  const generateBenefitCode = (): string => {
    const prefix = `${organization.code}-BENEFIT`;

    const usedCodes = new Set(
      benefits.map((benefit) => benefit.benefitCode.trim().toUpperCase()),
    );

    let sequence = 1;

    while (usedCodes.has(`${prefix}-${String(sequence).padStart(3, "0")}`)) {
      sequence += 1;
    }

    return `${prefix}-${String(sequence).padStart(3, "0")}`;
  };

  /* ---------------------------------------------------------------------- */
  /* CREATE EMPTY BENEFIT                                                   */
  /* ---------------------------------------------------------------------- */

  const createEmptyBenefit = (): Benefit => {
    const now = new Date().toISOString();

    const activeStatus = benefitStatuses.find(
      (status) =>
        status.statusCode?.trim().toUpperCase() === "ACTIVE" ||
        status.statusName?.trim().toLowerCase() === "active",
    );

    return {
      id: `benefit-${Date.now()}`,

      organizationId: organization.id,

      benefitCode: generateBenefitCode(),

      benefitName: "",

      displayName: undefined,

      benefitCategoryId: "",

      benefitTypeId: "",

      description: undefined,

      /*
       * New Benefit defaults to Active.
       */
      benefitStatusId: activeStatus?.id ?? "benefit-status-active",

      productId: undefined,

      retailPrice: undefined,

      cost: undefined,

      /*
       * Physical model default:
       * Current Date.
       */
      effectiveDate: now.substring(0, 10),

      expiryDate: undefined,

      createdAt: now,

      createdBy: organization.updatedBy,

      updatedAt: now,

      updatedBy: organization.updatedBy,

      isDeleted: false,

      versionNo: 1,
    };
  };

  /* ---------------------------------------------------------------------- */
  /* ADD                                                                    */
  /* ---------------------------------------------------------------------- */

  const handleAdd = () => {
    if (!isEditing || saving) {
      return;
    }

    setEditingBenefit(createEmptyBenefit());

    setFormVisible(true);
  };

  /* ---------------------------------------------------------------------- */
  /* VIEW                                                                   */
  /* ---------------------------------------------------------------------- */

  const handleView = (benefit: Benefit) => {
    setViewingBenefit(cloneBenefits([benefit])[0]);
  };

  /* ---------------------------------------------------------------------- */
  /* EDIT                                                                   */
  /* ---------------------------------------------------------------------- */

  const handleEdit = (benefit: Benefit) => {
    if (!isEditing || saving) {
      return;
    }

    setEditingBenefit(cloneBenefits([benefit])[0]);

    setFormVisible(true);
  };

  /* ---------------------------------------------------------------------- */
  /* POPUP SAVE — DRAFT ONLY                                                */
  /* ---------------------------------------------------------------------- */

  const handleSaveDraft = async (
    benefit: Benefit,
    benefitRules: BenefitUsageRule[],
  ) => {
    setBenefits((current) => {
      const next = [...current];

      const index = next.findIndex((item) => item.id === benefit.id);

      const clonedBenefit = cloneBenefits([benefit])[0];

      if (index === -1) {
        next.push(clonedBenefit);
      } else {
        next[index] = clonedBenefit;
      }

      /*
       * Keep draft available for Preview
       * and navigation away from this screen.
       */
      benefitDraftStore.set(organization.id, next);

      return next;
    });

    setRules((current) => [
      ...current.filter((rule) => rule.benefitId !== benefit.id),
      ...cloneRules(benefitRules),
    ]);

    setFormVisible(false);

    setEditingBenefit(null);
  };

  /* ---------------------------------------------------------------------- */
  /* DELETE — DRAFT ONLY                                                    */
  /* ---------------------------------------------------------------------- */

  const handleDelete = (benefit: Benefit) => {
    if (!isEditing || saving) {
      return;
    }

    setBenefits((current) => {
      const existsInCommitted = committedBenefits.some(
        (item) => item.id === benefit.id,
      );

      let next: Benefit[];

      if (!existsInCommitted) {
        /*
         * New unsaved Benefit:
         * remove completely from draft.
         */
        next = current.filter((item) => item.id !== benefit.id);
      } else {
        /*
         * Existing Benefit:
         * mark deleted in the working state.
         *
         * Actual deletion happens only when
         * Save Changes is pressed.
         */
        next = current.map((item) =>
          item.id === benefit.id
            ? {
                ...item,
                isDeleted: true,
              }
            : item,
        );
      }

      benefitDraftStore.set(organization.id, next);

      return next;
    });
  };

  /* ---------------------------------------------------------------------- */
  /* SAVE CHANGES                                                           */
  /* ---------------------------------------------------------------------- */

  const handleSaveChanges = async () => {
    if (!hasChanges || saving) {
      return;
    }

    setSaving(true);

    try {
      const committedById = new Map(
        committedBenefits.map((benefit) => [benefit.id, benefit]),
      );

      const workingById = new Map(
        benefits.map((benefit) => [benefit.id, benefit]),
      );

      /* -------------------------------------------------------------- */
      /* CREATE                                                         */
      /* -------------------------------------------------------------- */

      for (const benefit of benefits) {
        if (benefit.isDeleted || committedById.has(benefit.id)) {
          continue;
        }

        await services.benefit.createBenefit(organization.id, benefit);
      }

      /* -------------------------------------------------------------- */
      /* UPDATE                                                         */
      /* -------------------------------------------------------------- */

      for (const benefit of benefits) {
        const committed = committedById.get(benefit.id);

        if (!committed || benefit.isDeleted) {
          continue;
        }

        if (JSON.stringify(committed) !== JSON.stringify(benefit)) {
          await services.benefit.updateBenefit(organization.id, benefit);
        }
      }

      /* -------------------------------------------------------------- */
      /* DELETE                                                         */
      /* -------------------------------------------------------------- */

      for (const committed of committedBenefits) {
        const working = workingById.get(committed.id);

        if (working?.isDeleted || !working) {
          await services.benefit.deleteBenefit(organization.id, committed.id);
        }
      }

      /* -------------------------------------------------------------- */
      /* USAGE RULES                                                   */
      /* -------------------------------------------------------------- */

      const committedRulesById = new Map(
        committedRules.map((rule) => [rule.id, rule]),
      );

      const workingRulesById = new Map(rules.map((rule) => [rule.id, rule]));

      for (const rule of rules) {
        const committed = committedRulesById.get(rule.id);

        if (!committed) {
          if (!rule.isDeleted) {
            await services.benefitUsageRule.createRule(rule);
          }
        } else if (!rulesEqual([committed], [rule])) {
          if (rule.isDeleted) {
            await services.benefitUsageRule.deleteRule(rule.id);
          } else {
            await services.benefitUsageRule.updateRule(rule);
          }
        }
      }

      for (const committed of committedRules) {
        if (!workingRulesById.has(committed.id)) {
          await services.benefitUsageRule.deleteRule(committed.id);
        }
      }

      /* -------------------------------------------------------------- */
      /* RELOAD PERSISTED STATE                                         */
      /* -------------------------------------------------------------- */

      const refreshed = await services.benefit.listByOrganization(
        organization.id,
      );

      const refreshedRules = await services.benefitUsageRule.listByBenefits(
        refreshed.map((item) => item.id),
      );

      const snapshot = cloneBenefits(refreshed);

      setCommittedBenefits(cloneBenefits(snapshot));

      setCommittedRules(cloneRules(refreshedRules));

      setBenefits(cloneBenefits(snapshot));

      setRules(cloneRules(refreshedRules));

      benefitDraftStore.clear(organization.id);

      /*
       * Saving is complete.
       * Return to View mode.
       */
      setIsEditing(false);

      setFormVisible(false);

      setEditingBenefit(null);

      Alert.alert(
        "Changes saved successfully",
        "Your benefit changes have been saved successfully.",
      );
    } catch (error) {
      /*
       * Preserve the draft when Save fails.
       */
      Alert.alert(
        "Unable to save changes",
        error instanceof Error
          ? error.message
          : "Unable to save benefit changes.",
      );
    } finally {
      setSaving(false);
    }
  };

  /* ---------------------------------------------------------------------- */
  /* DISCARD                                                                */
  /* ---------------------------------------------------------------------- */

  const handleDiscardChanges = () => {
    if (!hasChanges || saving) {
      return;
    }

    const restored = cloneBenefits(committedBenefits);

    setBenefits(restored);

    setRules(cloneRules(committedRules));

    benefitDraftStore.clear(organization.id);
  };

  /* ---------------------------------------------------------------------- */
  /* ENTER EDIT MODE                                                        */
  /* ---------------------------------------------------------------------- */

  const handleStartEditing = () => {
    if (saving) {
      return;
    }

    setIsEditing(true);
  };

  /* ---------------------------------------------------------------------- */
  /* EXIT EDIT MODE                                                         */
  /* ---------------------------------------------------------------------- */

  const handleCancelEditing = () => {
    if (saving) {
      return;
    }

    /*
     * If there are unsaved changes, Cancel behaves as
     * Discard so that returning to View mode never leaves
     * the page showing an uncommitted state.
     */
    if (hasChanges) {
      const restored = cloneBenefits(committedBenefits);

      setBenefits(restored);

      setRules(cloneRules(committedRules));

      benefitDraftStore.clear(organization.id);
    }

    setFormVisible(false);

    setEditingBenefit(null);

    setIsEditing(false);
  };

  /* ---------------------------------------------------------------------- */
  /* PREVIEW                                                                */
  /* ---------------------------------------------------------------------- */

  const handlePreview = () => {
    if (saving) {
      return;
    }

    router.push({
      pathname: APP_ROUTES.orgAdmin.customerExperienceSection(
        "benefits",
      ) as never,

      params: {
        currentBenefits: JSON.stringify(committedBenefits),

        proposedBenefits: JSON.stringify(benefits),
      },
    });
  };

  /* ---------------------------------------------------------------------- */
  /* TABLE                                                                  */
  /* ---------------------------------------------------------------------- */

  const columns = useMemo<DataTableColumn<Benefit>[]>(
    () => [
      {
        key: "benefitCode",

        title: "Benefit Code",

        width: 150,
      },

      {
        key: "benefitName",

        title: "Benefit Name",

        width: 240,

        render: (item) => (
          <Text variant="body" color="text">
            {getDisplayName(item)}
          </Text>
        ),
      },

      {
        key: "benefitCategoryId",

        title: "Category",

        width: 160,

        render: (item) => (
          <Text variant="body" color="text">
            {getCategoryName(item.benefitCategoryId)}
          </Text>
        ),
      },

      {
        key: "benefitTypeId",

        title: "Type",

        width: 140,

        render: (item) => (
          <Text variant="body" color="text">
            {getTypeName(item.benefitTypeId)}
          </Text>
        ),
      },

      {
        key: "productId",

        title: "Product",

        width: 180,

        render: (item) => (
          <Text variant="body" color="text">
            {getProductName(item.productId)}
          </Text>
        ),
      },

      {
        key: "effectiveDate",

        title: "Effective",

        width: 130,
      },

      {
        key: "expiryDate",

        title: "Expiry",

        width: 130,

        render: (item) => (
          <Text variant="body" color="text">
            {item.expiryDate ?? "—"}
          </Text>
        ),
      },

      {
        key: "usageRules",

        title: "Usage Rules",

        width: 120,

        render: (item) => (
          <Text variant="body" color="text">
            {
              rules.filter(
                (rule) => rule.benefitId === item.id && !rule.isDeleted,
              ).length
            }
          </Text>
        ),
      },

      {
        key: "benefitStatusId",

        title: "Status",

        width: 130,

        render: (item) => (
          <Text variant="body" color="text">
            {getStatusName(item.benefitStatusId)}
          </Text>
        ),
      },
    ],

    [benefitCategories, benefitTypes, benefitStatuses, products, rules],
  );

  /* ---------------------------------------------------------------------- */
  /* RENDER                                                                 */
  /* ---------------------------------------------------------------------- */

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.screen}
      showsVerticalScrollIndicator={false}
    >
      {/* ================================================================ */}
      {/* HEADER                                                           */}
      {/* ================================================================ */}

      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text variant="title" color="text">
            Benefits
          </Text>

          <Text variant="bodySmall" color="textMuted">
            Manage the benefits offered to your members.
          </Text>
        </View>

        <View style={styles.headerActions}>
          {!isEditing ? (
            /*
             * VIEW MODE
             */
            <Pressable
              onPress={handleStartEditing}
              disabled={saving}
              style={({ pressed }) => [
                styles.primaryButton,

                {
                  opacity: saving ? 0.5 : pressed ? 0.8 : 1,
                },
              ]}
            >
              <Text variant="body" color="background">
                Edit
              </Text>
            </Pressable>
          ) : (
            /*
             * EDIT MODE
             */
            <>
              <Pressable
                onPress={handleCancelEditing}
                disabled={saving}
                style={({ pressed }) => [
                  styles.secondaryButton,

                  {
                    opacity: saving ? 0.5 : pressed ? 0.8 : 1,
                  },
                ]}
              >
                <Text variant="body" color="text">
                  Cancel
                </Text>
              </Pressable>

              <Button
                label={saving ? "Saving..." : "Save Changes"}
                onPress={() => {
                  void handleSaveChanges();
                }}
                disabled={!hasChanges || saving}
              />

              <Pressable
                onPress={handlePreview}
                disabled={saving}
                style={({ pressed }) => [
                  styles.secondaryButton,

                  {
                    opacity: saving ? 0.5 : pressed ? 0.8 : 1,
                  },
                ]}
              >
                <Text variant="body" color="text">
                  Preview
                </Text>
              </Pressable>

              <Pressable
                onPress={handleAdd}
                disabled={saving}
                style={({ pressed }) => [
                  styles.addButton,

                  {
                    opacity: saving ? 0.5 : pressed ? 0.8 : 1,
                  },
                ]}
              >
                <Text variant="body" color="background">
                  + Add Benefit
                </Text>
              </Pressable>
            </>
          )}
        </View>
      </View>

      {/* ================================================================ */}
      {/* TABLE                                                            */}
      {/* ================================================================ */}

      {loading ? (
        <View style={styles.center}>
          <Text variant="body" color="textMuted">
            Loading benefits...
          </Text>
        </View>
      ) : (
        <DataTable
          columns={columns}
          data={visibleBenefits}
          keyExtractor={(item) => item.id}
          emptyMessage="No benefits configured."
          actions={
            isEditing
              ? [
                  {
                    label: "Edit",
                    onPress: handleEdit,
                  },
                  {
                    label: "Delete",
                    onPress: handleDelete,
                  },
                ]
              : [
                  {
                    label: "View",
                    onPress: handleView,
                  },
                ]
          }
        />
      )}

      {/* ================================================================ */}
      {/* VIEW                                                             */}
      {/* ================================================================ */}

      <Modal
        visible={Boolean(viewingBenefit)}
        onClose={() => setViewingBenefit(null)}
        title="View Benefit"
        scrollable
        testID="benefit-view-modal"
      >
        {viewingBenefit ? (
          <View style={styles.viewDetails}>
            <View style={styles.viewGrid}>
              {[
                ["Benefit Code", viewingBenefit.benefitCode],
                ["Benefit Name", getDisplayName(viewingBenefit)],
                ["Category", getCategoryName(viewingBenefit.benefitCategoryId)],
                ["Type", getTypeName(viewingBenefit.benefitTypeId)],
                ["Product", getProductName(viewingBenefit.productId)],
                ["Status", getStatusName(viewingBenefit.benefitStatusId)],
                ["Effective Date", viewingBenefit.effectiveDate],
                ["Expiry Date", viewingBenefit.expiryDate ?? "—"],
              ].map(([label, value]) => (
                <View key={label} style={styles.viewField}>
                  <Text variant="bodySmall" color="textMuted">
                    {label}
                  </Text>
                  <Text variant="body" color="text">
                    {value}
                  </Text>
                </View>
              ))}
            </View>

            <View style={styles.viewSection}>
              <Text variant="bodySmall" color="textMuted">
                Description
              </Text>
              <Text variant="body" color="text">
                {viewingBenefit.description ?? "—"}
              </Text>
            </View>

            <View style={styles.viewSection}>
              <Text variant="bodySmall" color="textMuted">
                Usage Rules
              </Text>
              {(() => {
                const benefitRules = rules.filter(
                  (rule) =>
                    rule.benefitId === viewingBenefit.id && !rule.isDeleted,
                );

                return benefitRules.length ? (
                  benefitRules.map((rule) => (
                    <View key={rule.id} style={styles.viewRule}>
                      <Text variant="body" color="text">
                        {rule.ruleName}
                      </Text>
                      <Text variant="bodySmall" color="textMuted">
                        {formatRuleSummary(rule)}
                      </Text>
                    </View>
                  ))
                ) : (
                  <Text variant="body" color="text">
                    No usage rules configured.
                  </Text>
                );
              })()}
            </View>
          </View>
        ) : null}
      </Modal>

      {/* ================================================================ */}
      {/* FORM                                                             */}
      {/* ================================================================ */}

      <Modal
        visible={formVisible}
        onClose={() => {
          if (saving) {
            return;
          }

          setFormVisible(false);

          setEditingBenefit(null);
        }}
        title={
          editingBenefit &&
          committedBenefits.some((item) => item.id === editingBenefit.id)
            ? "Edit Benefit"
            : "Add Benefit"
        }
        scrollable
        testID="benefit-form-modal"
      >
        {editingBenefit ? (
          <BenefitForm
            benefit={editingBenefit}
            isNew={
              !committedBenefits.some((item) => item.id === editingBenefit.id)
            }
            benefitCategories={benefitCategories}
            benefitTypes={benefitTypes}
            benefitStatuses={benefitStatuses}
            products={products}
            usageRules={rules.filter(
              (rule) => rule.benefitId === editingBenefit.id && !rule.isDeleted,
            )}
            onSave={handleSaveDraft}
            onCancel={() => {
              setFormVisible(false);

              setEditingBenefit(null);
            }}
          />
        ) : null}
      </Modal>
    </ScrollView>
  );
}

/* -------------------------------------------------------------------------- */
/* STYLES                                                                     */
/* -------------------------------------------------------------------------- */

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
    gap: 16,
  },

  headerText: {
    flex: 1,
    gap: 4,
  },

  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  primaryButton: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0F766E",
  },

  addButton: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0F766E",
  },

  secondaryButton: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#CBD5E1",
  },

  viewDetails: {
    gap: 20,
  },

  viewGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
  },

  viewField: {
    width: "48%",
    minWidth: 220,
    gap: 4,
  },

  viewSection: {
    gap: 8,
  },

  viewRule: {
    gap: 2,
    paddingVertical: 8,
  },

  center: {
    minHeight: 160,
    alignItems: "center",
    justifyContent: "center",
  },
});
