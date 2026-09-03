import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";

import type {
  Benefit,
  MembershipProduct,
  ReferenceDataItem,
  Status,
} from "@/src/core";

import { services } from "@/src/core";

import { APP_ROUTES } from "@/src/constants/navigation";
import { membershipDraftStore } from "@/src/core/services/membership-draft-store";
import { useBusiness } from "@/src/providers";
import { Button, DataTable, type DataTableColumn, Modal, Text } from "@/src/ui";

import { MembershipForm } from "@/src/ui/admin/MembershipForm";

function cloneProducts(products: MembershipProduct[]): MembershipProduct[] {
  return products.map((product) => ({
    ...product,
    plans: product.plans.map((plan) => ({
      ...plan,
    })),
    benefitIds: [...product.benefitIds],
  }));
}

function productsEqual(
  first: MembershipProduct[],
  second: MembershipProduct[],
): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}

export default function OrgAdminMemberships() {
  const { organization } = useBusiness();
  const router = useRouter();

  const [committedProducts, setCommittedProducts] = useState<
    MembershipProduct[]
  >([]);

  const [products, setProducts] = useState<MembershipProduct[]>([]);

  const [benefits, setBenefits] = useState<Benefit[]>([]);

  const [benefitStatuses, setBenefitStatuses] = useState<Status[]>([]);
  const [productCategories, setProductCategories] = useState<
    ReferenceDataItem[]
  >([]);
  const [productTypes, setProductTypes] = useState<ReferenceDataItem[]>([]);
  const [productStatuses, setProductStatuses] = useState<Status[]>([]);
  const [subscriptionPlanStatuses, setSubscriptionPlanStatuses] = useState<
    Status[]
  >([]);
  const [currencies, setCurrencies] = useState<ReferenceDataItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [formVisible, setFormVisible] = useState(false);
  const [editingProduct, setEditingProduct] =
    useState<MembershipProduct | null>(null);

  /* ---------------------------------------------------------------------- */
  /* LOAD                                                                   */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);

      try {
        const [
          persistedProducts,
          benefitList,
          benefitStatusList,
          categoryList,
          typeList,
          productStatusList,
          planStatusList,
          currencyList,
        ] = await Promise.all([
          services.membershipProduct.listProducts(organization.id),
          services.benefit.listByOrganization(organization.id),
          services.status.listBenefitStatuses(),
          services.referenceData.listProductCategories(),
          services.referenceData.listProductTypes(),
          services.status.listMembershipProductStatuses(),
          services.status.listSubscriptionPlanStatuses(),
          services.referenceData.listCurrencies(),
        ]);

        if (!mounted) {
          return;
        }

        const committedSnapshot = cloneProducts(persistedProducts);

        const existingDraft = membershipDraftStore.get(organization.id);

        const workingSnapshot = existingDraft
          ? cloneProducts(existingDraft)
          : cloneProducts(committedSnapshot);

        setCommittedProducts(committedSnapshot);
        setProducts(workingSnapshot);

        setBenefits(benefitList);
        setBenefitStatuses(benefitStatusList);
        setProductCategories(categoryList);
        setProductTypes(typeList);
        setProductStatuses(productStatusList);
        setSubscriptionPlanStatuses(planStatusList);
        setCurrencies(currencyList);
      } catch (error) {
        if (!mounted) {
          return;
        }

        Alert.alert(
          "Unable to load memberships",
          error instanceof Error
            ? error.message
            : "Unable to load memberships.",
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
    () => !productsEqual(committedProducts, products),
    [committedProducts, products],
  );

  const activeBenefits = useMemo(
    () =>
      benefits.filter((benefit) => {
        if (benefit.isDeleted) {
          return false;
        }

        const status = benefitStatuses.find(
          (item) => item.id === benefit.benefitStatusId,
        );

        return (
          status?.statusCode?.trim().toUpperCase() === "ACTIVE" ||
          status?.statusName?.trim().toLowerCase() === "active"
        );
      }),
    [benefits, benefitStatuses],
  );

  /* ---------------------------------------------------------------------- */
  /* LOOKUPS                                                                */
  /* ---------------------------------------------------------------------- */

  const getReferenceName = (
    items: ReferenceDataItem[],
    id?: string,
  ): string => {
    if (!id) {
      return "—";
    }

    return items.find((item) => item.id === id)?.name ?? "Unknown";
  };

  const getStatusName = (items: Status[], id?: string): string => {
    if (!id) {
      return "—";
    }

    const status = items.find((item) => item.id === id);

    return status?.statusName ?? status?.statusCode ?? "Unknown";
  };

  /* ---------------------------------------------------------------------- */
  /* MEMBERSHIP CODE                                                        */
  /* ---------------------------------------------------------------------- */

  const generateMembershipCode = (): string => {
    const prefix = "MEMBERSHIP";

    const usedCodes = new Set(
      products.map((product) =>
        product.membershipProductCode.trim().toUpperCase(),
      ),
    );

    let sequence = 1;

    while (usedCodes.has(`${prefix}-${String(sequence).padStart(3, "0")}`)) {
      sequence += 1;
    }

    return `${prefix}-${String(sequence).padStart(3, "0")}`;
  };

  /* ---------------------------------------------------------------------- */
  /* PLAN                                                                   */
  /* ---------------------------------------------------------------------- */

  const createInitialPlan = () => {
    const now = new Date().toISOString();

    const activeStatus = subscriptionPlanStatuses.find(
      (status) =>
        status.statusCode?.trim().toUpperCase() === "ACTIVE" ||
        status.statusName?.trim().toLowerCase() === "active",
    );

    const inrCurrency =
      currencies.find(
        (currency) =>
          currency.code?.trim().toUpperCase() === "INR" ||
          currency.name?.trim().toUpperCase() === "INR",
      ) ?? currencies[0];

    const productId = `membership-product-${Date.now()}`;

    return {
      id: `membership-plan-${Date.now()}`,
      membershipProductId: productId,
      subscriptionPlanCode: `PLAN-${Date.now()}`,
      subscriptionPlanName: "Monthly",
      subscriptionPlanStatusId:
        activeStatus?.id ?? "subscription-plan-status-active",
      currencyId: inrCurrency?.id ?? "",
      subscriptionPeriod: 1,
      subscriptionPeriodUnit: "MONTH",
      price: {
        amountMinor: 0,
        currency: inrCurrency?.code ?? "CAD",
      },
      billingInterval: "MONTHLY",
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
  /* EMPTY PRODUCT                                                          */
  /* ---------------------------------------------------------------------- */

  const createEmptyProduct = (): MembershipProduct => {
    const now = new Date().toISOString();
    const productId = `membership-product-${Date.now()}`;

    const activeStatus = productStatuses.find(
      (status) =>
        status.statusCode?.trim().toUpperCase() === "ACTIVE" ||
        status.statusName?.trim().toLowerCase() === "active",
    );

    const initialPlan = createInitialPlan();

    return {
      id: productId,

      organizationId: organization.id,

      membershipProductCode: generateMembershipCode(),

      membershipProductName: "",

      displayName: undefined,

      productCategoryId: "",

      productTypeId: "",

      productStatusId: activeStatus?.id ?? "membership-product-status-active",

      description: undefined,

      benefitIds: [],

      plans: [
        {
          ...initialPlan,
          membershipProductId: productId,
        },
      ],

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
    setEditingProduct(createEmptyProduct());
    setFormVisible(true);
  };

  /* ---------------------------------------------------------------------- */
  /* EDIT                                                                   */
  /* ---------------------------------------------------------------------- */

  const handleEdit = (product: MembershipProduct) => {
    setEditingProduct(cloneProducts([product])[0]);
    setFormVisible(true);
  };

  /* ---------------------------------------------------------------------- */
  /* SAVE DRAFT                                                             */
  /* ---------------------------------------------------------------------- */

  const handleSaveDraft = async (product: MembershipProduct) => {
    setProducts((current) => {
      const next = [...current];

      const index = next.findIndex((item) => item.id === product.id);

      const clonedProduct = cloneProducts([product])[0];

      if (index === -1) {
        next.push(clonedProduct);
      } else {
        next[index] = clonedProduct;
      }

      membershipDraftStore.set(organization.id, next);

      return next;
    });

    setFormVisible(false);
    setEditingProduct(null);
  };

  /* ---------------------------------------------------------------------- */
  /* DELETE                                                                 */
  /* ---------------------------------------------------------------------- */

  const handleDelete = (product: MembershipProduct) => {
    setProducts((current) => {
      const existsInCommitted = committedProducts.some(
        (item) => item.id === product.id,
      );

      let next: MembershipProduct[];

      if (!existsInCommitted) {
        next = current.filter((item) => item.id !== product.id);
      } else {
        next = current.map((item) =>
          item.id === product.id
            ? {
                ...item,
                isDeleted: true,
              }
            : item,
        );
      }

      membershipDraftStore.set(organization.id, next);

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
        committedProducts.map((product) => [product.id, product]),
      );

      const workingById = new Map(
        products.map((product) => [product.id, product]),
      );

      for (const product of products) {
        if (product.isDeleted || committedById.has(product.id)) {
          continue;
        }

        await services.membershipProduct.createProduct(
          organization.id,
          product,
        );
      }

      for (const product of products) {
        const committed = committedById.get(product.id);

        if (!committed || product.isDeleted) {
          continue;
        }

        if (JSON.stringify(committed) !== JSON.stringify(product)) {
          await services.membershipProduct.updateProduct(
            organization.id,
            product,
          );
        }
      }

      for (const committed of committedProducts) {
        const working = workingById.get(committed.id);

        if (working?.isDeleted || !working) {
          await services.membershipProduct.deleteProduct(
            organization.id,
            committed.id,
          );
        }
      }

      const refreshed = await services.membershipProduct.listProducts(
        organization.id,
      );

      const snapshot = cloneProducts(refreshed);

      setCommittedProducts(cloneProducts(snapshot));
      setProducts(cloneProducts(snapshot));

      membershipDraftStore.clear(organization.id);

      Alert.alert(
        "Changes saved",
        "Your membership changes have been saved successfully.",
      );
    } catch (error) {
      Alert.alert(
        "Unable to save changes",
        error instanceof Error
          ? error.message
          : "Unable to save membership changes.",
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

    const restored = cloneProducts(committedProducts);

    setProducts(restored);

    membershipDraftStore.clear(organization.id);
  };

  /* ---------------------------------------------------------------------- */
  /* PREVIEW                                                                */
  /* ---------------------------------------------------------------------- */

  const handlePreview = () => {
    router.push({
      pathname: APP_ROUTES.orgAdmin.customerExperienceSection(
        "membership",
      ) as never,
      params: {
        currentProduct:
          committedProducts.length > 0
            ? JSON.stringify(committedProducts[0])
            : "",
        proposedProduct: products.length > 0 ? JSON.stringify(products[0]) : "",
      },
    });
  };

  /* ---------------------------------------------------------------------- */
  /* TABLE                                                                  */
  /* ---------------------------------------------------------------------- */

  const columns = useMemo<DataTableColumn<MembershipProduct>[]>(
    () => [
      {
        key: "membershipProductCode",
        title: "Membership Code",
        width: 170,
      },

      {
        key: "membershipProductName",
        title: "Membership Name",
        width: 240,
        render: (item) => (
          <Text variant="body" color="text">
            {item.displayName ?? item.membershipProductName}
          </Text>
        ),
      },

      {
        key: "productCategoryId",
        title: "Category",
        width: 160,
        render: (item) => (
          <Text variant="body" color="text">
            {getReferenceName(productCategories, item.productCategoryId)}
          </Text>
        ),
      },

      {
        key: "productTypeId",
        title: "Type",
        width: 140,
        render: (item) => (
          <Text variant="body" color="text">
            {getReferenceName(productTypes, item.productTypeId)}
          </Text>
        ),
      },

      {
        key: "productStatusId",
        title: "Status",
        width: 130,
        render: (item) => (
          <Text variant="body" color="text">
            {getStatusName(productStatuses, item.productStatusId)}
          </Text>
        ),
      },

      {
        key: "plans",
        title: "Plans",
        width: 100,
        render: (item) => (
          <Text variant="body" color="text">
            {item.plans.filter((plan) => !plan.isDeleted).length}
          </Text>
        ),
      },

      {
        key: "benefitIds",
        title: "Benefits",
        width: 110,
        render: (item) => (
          <Text variant="body" color="text">
            {item.benefitIds.length}
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
    ],
    [productCategories, productTypes, productStatuses],
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
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text variant="title" color="text">
            Memberships
          </Text>

          <Text variant="bodySmall" color="textMuted">
            Manage the membership products offered to your customers.
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
            disabled={saving || products.length === 0}
            style={({ pressed }) => [
              styles.secondaryButton,
              {
                opacity:
                  saving || products.length === 0 ? 0.5 : pressed ? 0.8 : 1,
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
              + Add Membership
            </Text>
          </Pressable>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <Text variant="body" color="textMuted">
            Loading memberships...
          </Text>
        </View>
      ) : (
        <DataTable<MembershipProduct>
          columns={columns}
          data={products.filter((product) => !product.isDeleted)}
          keyExtractor={(item) => item.id}
          emptyMessage="No memberships configured."
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

      <Modal
        visible={formVisible}
        onClose={() => {
          if (saving) {
            return;
          }

          setFormVisible(false);
          setEditingProduct(null);
        }}
        title={
          editingProduct &&
          committedProducts.some((item) => item.id === editingProduct.id)
            ? "Edit Membership"
            : "Add Membership"
        }
        scrollable
        testID="membership-form-modal"
      >
        {editingProduct ? (
          <MembershipForm
            product={editingProduct}
            isNewProduct={
              !committedProducts.some((item) => item.id === editingProduct.id)
            }
            benefits={activeBenefits}
            productCategories={productCategories}
            productTypes={productTypes}
            productStatuses={productStatuses}
            subscriptionPlanStatuses={subscriptionPlanStatuses}
            currencies={currencies}
            onSave={handleSaveDraft}
            onCancel={() => {
              setFormVisible(false);
              setEditingProduct(null);
            }}
          />
        ) : null}
      </Modal>
    </ScrollView>
  );
}

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
