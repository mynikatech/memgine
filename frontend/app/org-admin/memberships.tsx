import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";

import type {
  Benefit,
  MembershipProduct,
  ReferenceDataItem,
  Status,
} from "@/src/core";

import { services } from "@/src/core";

import { useBusiness } from "@/src/providers";
import { DataTable, type DataTableColumn, Modal, Text } from "@/src/ui";

import { MembershipForm } from "@/src/ui/admin/MembershipForm";

export default function MembershipsAdmin() {
  const { organization } = useBusiness();

  const [products, setProducts] = useState<MembershipProduct[]>([]);

  const [benefits, setBenefits] = useState<Benefit[]>([]);

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
          categoryList,
          typeList,
          statusList,
          planStatusList,
          currencyList,
        ] = await Promise.all([
          services.membershipProduct.listProducts(organization.id),

          services.benefit.listByOrganization(organization.id),

          services.referenceData.listProductCategories(),
          services.referenceData.listProductTypes(),
          services.status.listMembershipProductStatuses(),
          services.status.listSubscriptionPlanStatuses(),
          services.referenceData.listCurrencies(),
        ]);

        if (!mounted) {
          return;
        }

        setProducts(productList);
        setBenefits(benefitList);
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

    load();

    return () => {
      mounted = false;
    };
  }, [organization.id]);

  type ReferenceLookupItem = ReferenceDataItem | Status;

  function getReferenceName(items: ReferenceLookupItem[], id: string): string {
    const item = items.find((candidate) => candidate.id === id);

    if (!item) {
      return "Unknown";
    }

    if ("statusName" in item) {
      return item.statusName;
    }

    return item.name;
  }

  const formatPlanPrice = (amountMinor: number, currency: string) => {
    return `${currency} ${(amountMinor / 100).toFixed(2)}`;
  };

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

  const createEmptyProduct = (): MembershipProduct => {
    const now = new Date().toISOString();

    const activeCategory =
      productCategories.find((item) => item.code === "MEMBERSHIP") ??
      productCategories[0];

    const activeType =
      productTypes.find((item) => item.code === "INDIVIDUAL") ??
      productTypes[0];

    const activeStatus =
      productStatuses.find((item) => item.statusCode === "ACTIVE") ??
      productStatuses[0];

    return {
      id: `prod-${Date.now()}`,

      organizationId: organization.id,

      membershipProductCode: "",
      membershipProductName: "",
      displayName: undefined,

      productCategoryId: activeCategory?.id ?? "",
      productTypeId: activeType?.id ?? "",

      description: undefined,

      productStatusId: activeStatus?.id ?? "",

      effectiveDate: now.substring(0, 10),

      expiryDate: undefined,

      benefitIds: [],

      plans: [],

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
    setEditingProduct(product);
    setFormVisible(true);
  };

  const handleSave = async (updatedProduct: MembershipProduct) => {
    try {
      const existing = products.some((item) => item.id === updatedProduct.id);

      if (existing) {
        const updated = await services.membershipProduct.updateProduct(
          organization.id,
          updatedProduct,
        );

        setProducts((current) =>
          current.map((item) => (item.id === updated.id ? updated : item)),
        );
      } else {
        const created = await services.membershipProduct.createProduct(
          organization.id,
          updatedProduct,
        );

        setProducts((current) => [...current, created]);
      }

      setFormVisible(false);
      setEditingProduct(null);
    } catch (error) {
      Alert.alert(
        "Unable to save membership",
        error instanceof Error ? error.message : "Unable to save membership.",
      );
    }
  };

  const handleDelete = async (product: MembershipProduct) => {
    Alert.alert(
      "Delete Membership",
      `Are you sure you want to delete "${product.membershipProductName}"?`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await services.membershipProduct.deleteProduct(
                organization.id,
                product.id,
              );

              setProducts((current) =>
                current.filter((item) => item.id !== product.id),
              );
            } catch (error) {
              Alert.alert(
                "Unable to delete membership",
                error instanceof Error
                  ? error.message
                  : "Unable to delete membership.",
              );
            }
          },
        },
      ],
    );
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

        <Pressable
          onPress={handleAdd}
          style={({ pressed }) => [
            styles.addButton,
            {
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
          <Text variant="body" color="background">
            + Add Membership
          </Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <Text variant="body" color="textMuted">
            Loading memberships...
          </Text>
        </View>
      ) : (
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
            benefits={benefits}
            productCategories={productCategories}
            productTypes={productTypes}
            productStatuses={productStatuses}
            subscriptionPlanStatuses={subscriptionPlanStatuses}
            currencies={currencies}
            onSave={handleSave}
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

  addButton: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0F766E",
  },

  center: {
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
  },

  nameCell: {
    gap: 3,
  },
});
