import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";

import type { Benefit, Product, ReferenceDataItem, Status } from "@/src/core";

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

/* -------------------------------------------------------------------------- */
/* MAIN                                                                       */
/* -------------------------------------------------------------------------- */

export default function OrgAdminBenefits() {
  const { organization } = useBusiness();

  const router = useRouter();

  /*
   * Last successfully persisted state.
   *
   * This is the "Current" state.
   */
  const [committedBenefits, setCommittedBenefits] = useState<Benefit[]>([]);

  /*
   * Working state.
   *
   * This is the "Proposed" state.
   */
  const [benefits, setBenefits] = useState<Benefit[]>([]);

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

        if (!mounted) {
          return;
        }

        const persistedSnapshot = cloneBenefits(persistedBenefits);

        /*
         * If we already have an unsaved draft, restore it.
         *
         * This is what prevents:
         *
         * Benefits → Preview → Back
         *
         * from losing the new row.
         */
        const existingDraft = benefitDraftStore.get(organization.id);

        const workingSnapshot = existingDraft
          ? cloneBenefits(existingDraft)
          : cloneBenefits(persistedSnapshot);

        setCommittedBenefits(cloneBenefits(persistedSnapshot));

        setBenefits(workingSnapshot);

        setBenefitCategories(categoryList);

        setBenefitTypes(typeList);

        setBenefitStatuses(statusList);

        setProducts(productList);
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
    () => !benefitsEqual(committedBenefits, benefits),
    [committedBenefits, benefits],
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
    const prefix = "BENEFIT";

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

      benefitStatusId: activeStatus?.id ?? "benefit-status-active",

      productId: undefined,

      retailPrice: undefined,

      cost: undefined,

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
    setEditingBenefit(createEmptyBenefit());

    setFormVisible(true);
  };

  /* ---------------------------------------------------------------------- */
  /* EDIT                                                                   */
  /* ---------------------------------------------------------------------- */

  const handleEdit = (benefit: Benefit) => {
    setEditingBenefit(cloneBenefits([benefit])[0]);

    setFormVisible(true);
  };

  /* ---------------------------------------------------------------------- */
  /* POPUP SAVE — DRAFT ONLY                                                */
  /* ---------------------------------------------------------------------- */

  const handleSaveDraft = async (benefit: Benefit) => {
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
       * Keep the temporary draft alive even if this screen
       * subsequently unmounts for Preview.
       */
      benefitDraftStore.set(organization.id, next);

      return next;
    });

    setFormVisible(false);

    setEditingBenefit(null);
  };

  /* ---------------------------------------------------------------------- */
  /* DELETE — DRAFT ONLY                                                    */
  /* ---------------------------------------------------------------------- */

  const handleDelete = (benefit: Benefit) => {
    setBenefits((current) => {
      const existsInCommitted = committedBenefits.some(
        (item) => item.id === benefit.id,
      );

      let next: Benefit[];

      if (!existsInCommitted) {
        /*
         * Brand-new unsaved Benefit:
         * completely remove it from the draft.
         */
        next = current.filter((item) => item.id !== benefit.id);
      } else {
        /*
         * Existing persisted Benefit:
         * retain it in the draft but mark it deleted.
         *
         * Save Changes will perform the actual delete.
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
      /* CREATE                                                          */
      /* -------------------------------------------------------------- */

      for (const benefit of benefits) {
        if (benefit.isDeleted || committedById.has(benefit.id)) {
          continue;
        }

        await services.benefit.createBenefit(organization.id, benefit);
      }

      /* -------------------------------------------------------------- */
      /* UPDATE                                                          */
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
      /* DELETE                                                          */
      /* -------------------------------------------------------------- */

      for (const committed of committedBenefits) {
        const working = workingById.get(committed.id);

        if (working?.isDeleted || !working) {
          await services.benefit.deleteBenefit(organization.id, committed.id);
        }
      }

      /* -------------------------------------------------------------- */
      /* RELOAD ACTUAL PERSISTED STATE                                  */
      /* -------------------------------------------------------------- */

      const refreshed = await services.benefit.listByOrganization(
        organization.id,
      );

      const snapshot = cloneBenefits(refreshed);

      setCommittedBenefits(cloneBenefits(snapshot));

      setBenefits(cloneBenefits(snapshot));

      /*
       * Persistence succeeded.
       *
       * The temporary draft is no longer needed.
       */
      benefitDraftStore.clear(organization.id);

      Alert.alert(
        "Changes saved",
        "Your benefit changes have been saved successfully.",
      );
    } catch (error) {
      /*
       * IMPORTANT:
       *
       * Do NOT clear the draft on failure.
       *
       * The user should still see their proposed changes
       * and be able to retry Save Changes.
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

    benefitDraftStore.clear(organization.id);
  };

  /* ---------------------------------------------------------------------- */
  /* PREVIEW                                                                */
  /* ---------------------------------------------------------------------- */

  const handlePreview = () => {
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
    [benefitCategories, benefitTypes, benefitStatuses, products],
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
          {hasChanges ? (
            <Pressable
              onPress={handleDiscardChanges}
              disabled={saving}
              style={({ pressed }) => [
                styles.secondaryButton,
                {
                  opacity: saving ? 0.5 : pressed ? 0.8 : 1,
                },
              ]}
            >
              <Text variant="body" color="text">
                Discard
              </Text>
            </Pressable>
          ) : null}

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

          <Button
            label={saving ? "Saving..." : "Save Changes"}
            onPress={() => {
              void handleSaveChanges();
            }}
            disabled={!hasChanges || saving}
          />

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
          data={benefits.filter((item) => !item.isDeleted)}
          keyExtractor={(item) => item.id}
          emptyMessage="No benefits configured."
          actions={[
            {
              label: "Edit",
              onPress: handleEdit,
            },
            {
              label: "Delete",
              onPress: handleDelete,
            },
          ]}
        />
      )}

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
            benefitCategories={benefitCategories}
            benefitTypes={benefitTypes}
            benefitStatuses={benefitStatuses}
            products={products}
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
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
  },

  center: {
    minHeight: 160,
    alignItems: "center",
    justifyContent: "center",
  },
});
