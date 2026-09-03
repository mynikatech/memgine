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
import { DataTable, type DataTableColumn, Modal, Text } from "@/src/ui";

import { MembershipForm } from "@/src/ui/admin/MembershipForm";

function cloneProducts(products: MembershipProduct[]): MembershipProduct[] {
  return products.map((product) => ({
    ...product,
    benefitIds: [...product.benefitIds],
    plans: product.plans.map((plan) => ({
      ...plan,
      price: { ...plan.price },
    })),
  }));
}

function productsEqual(
  first: MembershipProduct[],
  second: MembershipProduct[],
): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}

function isActiveStatus(status: Status | undefined): boolean {
  return (
    status?.statusCode?.trim().toUpperCase() === "ACTIVE" ||
    status?.statusName?.trim().toLowerCase() === "active"
  );
}

export default function MembershipsAdmin() {
  const router = useRouter();
  const { organization } = useBusiness();

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

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);

      try {
        const [
          productList,
          benefitList,
          benefitStatusList,
          categoryList,
          typeList,
          statusList,
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

        const committed = cloneProducts(productList);
        const existingDraft = membershipDraftStore.get(organization.id);
        const working = existingDraft
          ? cloneProducts(existingDraft)
          : cloneProducts(committed);

        setCommittedProducts(committed);
        setProducts(working);
        setBenefits(benefitList);
        setBenefitStatuses(benefitStatusList);
        setProductCategories(categoryList);
        setProductTypes(typeList);
        setProductStatuses(statusList);
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

  const hasChanges = useMemo(
    () => !productsEqual(committedProducts, products),
    [committedProducts, products],
  );

  const activeBenefits = useMemo(() => {
    const activeIds = new Set(
      benefitStatuses.filter(isActiveStatus).map((status) => status.id),
    );

    return benefits.filter(
      (benefit) => !benefit.isDeleted && activeIds.has(benefit.benefitStatusId),
    );
  }, [benefits, benefitStatuses]);

  type ReferenceLookupItem = ReferenceDataItem | Status;

  function getReferenceName(items: ReferenceLookupItem[], id: string): string {
    const item = items.find((candidate) => candidate.id === id);

    if (!item) {
      return "Unknown";
    }

    return "statusName" in item ? item.statusName : item.name;
  }

  const formatPlanPrice = (amountMinor: number, currency: string) =>
    `${currency} ${(amountMinor / 100).toFixed(2)}`;

  const getPlanSummary = (product: MembershipProduct) => {
    const activePlans = product.plans.filter((plan) => !plan.isDeleted);

    if (activePlans.length === 0) {
      return "No plans";
    }

    return activePlans
      .map(
        (plan) =>
          `${plan.subscriptionPlanName} · ${formatPlanPrice(
            plan.price.amountMinor,
            plan.price.currency,
          )}`,
      )
      .join(", ");
  };

  const columns = useMemo<DataTableColumn<MembershipProduct>[]>(
    () => [
      {
        key: "membershipProductCode",
        title: "Product Code",
        width: 180,
      },
      {
        key: "membershipProductName",
        title: "Membership",
        width: 220,
        render: (item) => (
          <View style={styles.nameCell}>
            <Text variant="body" color="text">
              {item.displayName ?? item.membershipProductName}
            </Text>
            {item.displayName ? (
              <Text variant="bodySmall" color="textMuted">
                {item.membershipProductName}
              </Text>
            ) : null}
          </View>
        ),
      },
      {
        key: "productCategoryId",
        title: "Category",
        width: 150,
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
        key: "benefitIds",
        title: "Benefits",
        width: 100,
        render: (item) => (
          <Text variant="body" color="text">
            {item.benefitIds.length}
          </Text>
        ),
      },
      {
        key: "plans",
        title: "Plans",
        width: 300,
        render: (item) => (
          <Text variant="body" color="text">
            {getPlanSummary(item)}
          </Text>
        ),
      },
      {
        key: "productStatusId",
        title: "Status",
        width: 130,
        render: (item) => (
          <Text variant="body" color="text">
            {getReferenceName(productStatuses, item.productStatusId)}
          </Text>
        ),
      },
    ],
    [productCategories, productTypes, productStatuses],
  );

  const generateMembershipCode = (): string => {
    const usedCodes = new Set(
      products.map((product) =>
        product.membershipProductCode.trim().toUpperCase(),
      ),
    );

    let sequence = 1;
    while (usedCodes.has(`MEMBERSHIP-${String(sequence).padStart(3, "0")}`)) {
      sequence += 1;
    }

    return `MEMBERSHIP-${String(sequence).padStart(3, "0")}`;
  };

  const createInitialPlan = (
    membershipProductId: string,
    effectiveDate: string,
  ) => {
    const now = new Date().toISOString();
    const activePlanStatus = subscriptionPlanStatuses.find(isActiveStatus);
    const defaultCurrency =
      currencies.find((item) => item.code?.toUpperCase() === "INR") ??
      currencies[0];

    return {
      id: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      membershipProductId,
      subscriptionPlanCode: "",
      subscriptionPlanName: "",
      description: undefined,
      subscriptionPeriod: 1,
      subscriptionPeriodUnit: "MONTH",
      price: {
        amountMinor: 0,
        currency: defaultCurrency?.code ?? "INR",
      },
      currencyId: defaultCurrency?.id ?? "",
      subscriptionPlanStatusId: activePlanStatus?.id ?? "",
      effectiveDate,
      expiryDate: undefined,
      createdAt: now,
      createdBy: "user-system",
      updatedAt: now,
      updatedBy: "user-system",
      isDeleted: false,
      versionNo: 1,
    };
  };

  const createEmptyProduct = (): MembershipProduct => {
    const now = new Date().toISOString();
    const id = `prod-${Date.now()}`;

    const activeCategory =
      productCategories.find((item) => item.code === "MEMBERSHIP") ??
      productCategories[0];

    const activeType =
      productTypes.find((item) => item.code === "INDIVIDUAL") ??
      productTypes[0];

    const activeStatus = productStatuses.find(isActiveStatus);

    return {
      id,
      organizationId: organization.id,
      membershipProductCode: generateMembershipCode(),
      membershipProductName: "",
      displayName: undefined,
      productCategoryId: activeCategory?.id ?? "",
      productTypeId: activeType?.id ?? "",
      description: undefined,
      productStatusId: activeStatus?.id ?? "",
      effectiveDate: now.substring(0, 10),
      expiryDate: undefined,
      benefitIds: [],
      plans: [createInitialPlan(id, now.substring(0, 10))],
      createdAt: now,
      createdBy: "user-system",
      updatedAt: now,
      updatedBy: "user-system",
      isDeleted: false,
      versionNo: 1,
    };
  };

  const handleAdd = () => {
    setEditingProduct(createEmptyProduct());
    setFormVisible(true);
  };

  const handleEdit = (product: MembershipProduct) => {
    setEditingProduct(cloneProducts([product])[0]);
    setFormVisible(true);
  };

  const handleSaveDraft = async (updatedProduct: MembershipProduct) => {
    setProducts((current) => {
      const next = [...current];
      const index = next.findIndex((item) => item.id === updatedProduct.id);

      if (index === -1) {
        next.push(cloneProducts([updatedProduct])[0]);
      } else {
        next[index] = cloneProducts([updatedProduct])[0];
      }

      membershipDraftStore.set(organization.id, next);
      return next;
    });

    setFormVisible(false);
    setEditingProduct(null);
  };

  const handleDelete = (product: MembershipProduct) => {
    setProducts((current) => {
      const next = current.map((item) =>
        item.id === product.id ? { ...item, isDeleted: true } : item,
      );

      membershipDraftStore.set(organization.id, next);
      return next;
    });
  };

  const handleSaveChanges = async () => {
    if (!hasChanges || saving) {
      return;
    }

    const activePlanStatusIds = new Set(
      subscriptionPlanStatuses
        .filter(isActiveStatus)
        .map((status) => status.id),
    );

    for (const product of products) {
      if (product.isDeleted) {
        continue;
      }

      const committed = committedProducts.find(
        (item) => item.id === product.id,
      );
      const productWasActive = committed
        ? isActiveStatus(
            productStatuses.find(
              (status) => status.id === committed.productStatusId,
            ),
          )
        : false;
      const productIsActive = isActiveStatus(
        productStatuses.find((status) => status.id === product.productStatusId),
      );

      if (productWasActive && !productIsActive) {
        const hasActivePlan = product.plans.some(
          (plan) =>
            !plan.isDeleted &&
            activePlanStatusIds.has(plan.subscriptionPlanStatusId),
        );

        if (hasActivePlan) {
          Alert.alert(
            "Active Plans Required",
            "Inactivate all active subscription plans before inactivating this membership product.",
          );
          return;
        }
      }
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

  const handleDiscardChanges = () => {
    if (!hasChanges || saving) {
      return;
    }

    const restored = cloneProducts(committedProducts);
    setProducts(restored);
    membershipDraftStore.clear(organization.id);
  };

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
            Configure membership products, benefits and subscription plans.
          </Text>
        </View>

        <View style={styles.headerActions}>
          <Pressable
            onPress={handleAdd}
            disabled={saving}
            style={({ pressed }) => [
              styles.addButton,
              { opacity: pressed || saving ? 0.7 : 1 },
            ]}
          >
            <Text variant="body" color="background">
              + Add Membership
            </Text>
          </Pressable>

          <Pressable
            onPress={handleSaveChanges}
            disabled={!hasChanges || saving}
            style={({ pressed }) => [
              styles.saveButton,
              {
                opacity: !hasChanges || saving || pressed ? 0.55 : 1,
              },
            ]}
          >
            <Text variant="body" color="background">
              {saving ? "Saving..." : "Save Changes"}
            </Text>
          </Pressable>

          <Pressable
            onPress={handleDiscardChanges}
            disabled={!hasChanges || saving}
            style={({ pressed }) => [
              styles.discardButton,
              {
                opacity: !hasChanges || saving || pressed ? 0.55 : 1,
              },
            ]}
          >
            <Text variant="body" color="text">
              Discard
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
        <>
          <DataTable
            columns={columns}
            data={products.filter((item) => !item.isDeleted)}
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

          <Pressable
            onPress={() =>
              router.push(
                APP_ROUTES.orgAdmin.customerExperienceSection(
                  "membership",
                ) as never,
              )
            }
            style={({ pressed }) => [
              styles.previewLink,
              { opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <Text variant="body" color="primary">
              Preview
            </Text>
          </Pressable>
        </>
      )}

      <Modal
        visible={formVisible}
        onClose={() => {
          setFormVisible(false);
          setEditingProduct(null);
        }}
        title={
          editingProduct &&
          products.some((item) => item.id === editingProduct.id)
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
  scroll: { flex: 1 },
  screen: { padding: 24, gap: 24 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  headerText: { flex: 1, gap: 4 },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  previewLink: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  addButton: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0F766E",
  },
  saveButton: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0F766E",
  },
  discardButton: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#D1D5DB",
  },
  center: {
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
  },
  nameCell: { gap: 3 },
});
