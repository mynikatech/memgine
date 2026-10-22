import { useCallback, useMemo, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import * as XLSX from "xlsx";
import { Button, Checkbox, DataTable, Input, Modal, Text } from "@/src/ui";
import { useBusiness, useTheme } from "@/src/providers";
import type { IntegrationConfiguration, Store } from "@/src/core";
import { apis } from "@/src/data/data-registry";
import { APP_ROUTES } from "@/src/constants/navigation";
import {
  organizationProductApi,
  type OrganizationProduct,
  type OrganizationProductCatalog,
  type OrganizationCommerceProductMapping,
  type ProductImportPreview,
  type ProductImportRow,
  type CommerceCatalogSyncPreview,
  type CommerceCatalogSyncPreviewRow,
} from "@/src/data/api/organization-product-api";

const emptyProduct = {
  productCode: "",
  productName: "",
  description: "",
  sku: "",
  basePriceMinor: "",
  currencyCode: "CAD",
  externalProductId: "",
};
const emptyCatalog = {
  catalogName: "",
  source: "MANUAL" as "MANUAL" | "INTEGRATION",
  integrationConfigurationId: "",
  externalCatalogId: "",
  active: true,
};
const productImportTemplateFileName = "Memgine_Product_Import_Template.xlsx";
const productImportHeaders = [
  "Memgine Product ID",
  "External Product ID",
  "Product Code",
  "Product Name",
  "SKU",
  "UPC",
  "Description",
  "Category External ID",
  "Category Name",
  "Base Price",
  "Currency",
  "Active",
];
const productImportColumnWidths = [
  24, 24, 20, 30, 20, 20, 36, 26, 24, 14, 12, 12,
];
function string(value: unknown): string {
  return value == null ? "" : String(value).trim();
}
function moneyToMinor(value: unknown): number {
  const amount = Number(String(value ?? "").replace(/[$,]/g, ""));
  return Number.isFinite(amount) ? Math.round(amount * 100) : NaN;
}

export default function OrgAdminProducts() {
  const { organizationId: routeOrganizationId } = useLocalSearchParams<{
    organizationId: string;
  }>();
  const { organization } = useBusiness();
  const org = routeOrganizationId ?? organization?.id ?? "";
  const router = useRouter();
  const theme = useTheme();
  const [catalogs, setCatalogs] = useState<OrganizationProductCatalog[]>([]);
  const [integrations, setIntegrations] = useState<IntegrationConfiguration[]>(
    [],
  );
  const [stores, setStores] = useState<Store[]>([]);
  const [products, setProducts] = useState<OrganizationProduct[]>([]);
  const [mappings, setMappings] = useState<
    OrganizationCommerceProductMapping[]
  >([]);
  const [error, setError] = useState<string>();
  const [successMessage, setSuccessMessage] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [product, setProduct] = useState<any>(emptyProduct);
  const [editing, setEditing] = useState<OrganizationProduct | null>(null);
  const [catalogId, setCatalogId] = useState("");
  const [showProduct, setShowProduct] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showCatalog, setShowCatalog] = useState(false);
  const [catalogEditing, setCatalogEditing] =
    useState<OrganizationProductCatalog | null>(null);
  const [catalog, setCatalog] = useState<any>(emptyCatalog);
  const [savingCatalog, setSavingCatalog] = useState(false);
  const [mappingProduct, setMappingProduct] =
    useState<OrganizationProduct | null>(null);
  const [selectedMappingId, setSelectedMappingId] = useState("");
  const [resolvingMapping, setResolvingMapping] = useState(false);
  const [importRows, setImportRows] = useState<ProductImportRow[]>([]);
  const [preview, setPreview] = useState<ProductImportPreview[]>([]);
  const [fileName, setFileName] = useState("");
  const [showPosSync, setShowPosSync] = useState(false);
  const [selectedSyncIntegrationId, setSelectedSyncIntegrationId] = useState("");
  const [selectedSyncStoreId, setSelectedSyncStoreId] = useState<string | null>(null);
  const [posPreview, setPosPreview] = useState<CommerceCatalogSyncPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [showApplyConfirmation, setShowApplyConfirmation] = useState(false);
  const [applyingPreview, setApplyingPreview] = useState(false);
  const [applyUncertain, setApplyUncertain] = useState(false);
  const [previewExpired, setPreviewExpired] = useState(false);
  const [previewSearch, setPreviewSearch] = useState("");
  const [previewAction, setPreviewAction] = useState("ALL");
  const applyIdempotencyKey = useRef<string | null>(null);
  const load = useCallback(async () => {
    if (!org) return;
    setLoading(true);
    const [c, p, i, m, storeResult] = await Promise.all([
      organizationProductApi.catalogs(org),
      organizationProductApi.products(org),
      apis.integrationConfiguration.list(org),
      organizationProductApi.mappings(org),
      apis.store.list(org),
    ]);
    if (!c.success) setError(c.error?.message);
    else {
      setCatalogs(c.data);
      setCatalogId((v) => v || c.data[0]?.productCatalogId || "");
    }
    if (!p.success) setError(p.error?.message);
    else setProducts(p.data);
    if (!i.success) setError(i.error?.message);
    else setIntegrations(i.data);
    if (!m.success) setError(m.error?.message);
    else setMappings(m.data);
    if (!storeResult.success) setError(storeResult.error?.message);
    else setStores(storeResult.data);
    setLoading(false);
  }, [org]);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  const activeCatalog = catalogs.find((c) => c.productCatalogId === catalogId);
  const blockingPreviewRows = posPreview?.rows.filter(
    (row) => row.action === "CONFLICT" || row.action === "INVALID",
  ) ?? [];
  const filteredPreviewRows = useMemo(() => {
    if (!posPreview) return [] as CommerceCatalogSyncPreviewRow[];
    const search = previewSearch.trim().toLowerCase();
    return posPreview.rows.filter((row) => {
      const actionMatches = previewAction === "ALL" || row.action === previewAction;
      const textMatches = !search || [row.productName, row.externalSku, row.externalProductId, row.externalVariantId, row.canonicalProductId, row.reason].some((value) => value?.toLowerCase().includes(search));
      return actionMatches && textMatches;
    });
  }, [posPreview, previewAction, previewSearch]);
  const summaryValue = (action: string) =>
    posPreview && Object.prototype.hasOwnProperty.call(posPreview.summary, action)
      ? posPreview.summary[action]
      : "—";
  const formatMinor = (minor: number, currency: string) =>
    `${currency} ${(minor / 100).toFixed(2)}`;
  const resetPosSync = () => {
    setShowPosSync(false);
    setSelectedSyncIntegrationId("");
    setSelectedSyncStoreId(null);
    setPosPreview(null);
    setPreviewSearch("");
    setPreviewAction("ALL");
    setApplyUncertain(false);
    setPreviewExpired(false);
    applyIdempotencyKey.current = null;
  };
  const fetchPosPreview = async () => {
    if (!catalogId || !selectedSyncIntegrationId) {
      setError("Choose a canonical catalog and an integration configuration.");
      return;
    }
    setPreviewLoading(true);
    setError(undefined);
    setSuccessMessage(undefined);
    const result = await organizationProductApi.previewPosCatalog(org, selectedSyncIntegrationId, { productCatalogId: catalogId, storeId: selectedSyncStoreId });
    setPreviewLoading(false);
    if (!result.success) {
      setError(result.error?.message ?? "Unable to fetch the POS catalog preview.");
      return;
    }
    setPosPreview(result.data);
    setShowPosSync(false);
    setPreviewSearch("");
    setPreviewAction("ALL");
    setApplyUncertain(false);
    setPreviewExpired(false);
    applyIdempotencyKey.current = null;
  };
  const applyPosPreview = async () => {
    if (!posPreview || blockingPreviewRows.length > 0) return;
    if (!applyIdempotencyKey.current) {
      applyIdempotencyKey.current = `catalog-sync-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
    setApplyingPreview(true);
    setApplyUncertain(false);
    setError(undefined);
    const result = await organizationProductApi.applyPosCatalogSync(org, posPreview.previewId, {
      approved: true,
      idempotencyKey: applyIdempotencyKey.current,
    });
    setApplyingPreview(false);
    if (!result.success) {
      const code = result.error?.code?.toUpperCase() ?? "";
      const message = result.error?.message ?? "";
      setPreviewExpired(code.includes("EXPIRED") || code.includes("STALE") || /expired|stale/i.test(message));
      setApplyUncertain(true);
      setShowApplyConfirmation(false);
      setError(message || "We could not confirm the catalog sync outcome. Retry uses the same approval key.");
      return;
    }
    setShowApplyConfirmation(false);
    setSuccessMessage(`Catalog sync applied: ${result.data.createdCount} created, ${result.data.appliedCount} updated, ${result.data.mappedCount} mappings changed.`);
    setPosPreview(null);
    applyIdempotencyKey.current = null;
    await load();
  };
  const mappingHealth = (item: OrganizationProduct) => {
    if (!item.integrationConfigurationId) return { label: "—" };
    const activeCount = mappings.filter(
      (mapping) =>
        mapping.active &&
        mapping.productId === item.productId &&
        mapping.integrationConfigurationId ===
          item.integrationConfigurationId &&
        !mapping.storeId,
    ).length;
    if (activeCount === 1) return { label: "Mapped" };
    return {
      label: "Needs attention",
      detail:
        activeCount === 0
          ? "No active mapping"
          : `${activeCount} active mappings`,
    };
  };
  const activeMappingsForProduct = (item: OrganizationProduct) =>
    mappings.filter(
      (mapping) =>
        mapping.active &&
        mapping.productId === item.productId &&
        mapping.integrationConfigurationId === item.integrationConfigurationId,
    );
  const activeOrganizationScopeMappings = (item: OrganizationProduct) =>
    activeMappingsForProduct(item).filter((mapping) => !mapping.storeId);
  const recommendedMappingIds = (item: OrganizationProduct) => {
    const canonicalSku = item.sku?.trim().toUpperCase();
    if (!canonicalSku) return [];
    return activeOrganizationScopeMappings(item)
      .filter(
        (mapping) => mapping.externalSku?.trim().toUpperCase() === canonicalSku,
      )
      .map((mapping) => mapping.mappingId);
  };
  const openMappingFix = (item: OrganizationProduct) => {
    const recommendedIds = recommendedMappingIds(item);
    setError(undefined);
    setSuccessMessage(undefined);
    setSelectedMappingId(recommendedIds.length === 1 ? recommendedIds[0] : "");
    setMappingProduct(item);
  };
  const resolveMapping = async () => {
    if (!mappingProduct || !selectedMappingId) {
      setError("Choose the one active mapping to keep.");
      return;
    }
    setResolvingMapping(true);
    const result = await organizationProductApi.resolveMapping(
      org,
      mappingProduct.productId,
      selectedMappingId,
    );
    setResolvingMapping(false);
    if (!result.success) {
      setError(result.error?.message);
      return;
    }
    setMappingProduct(null);
    setSelectedMappingId("");
    setSuccessMessage("Mapping fixed.");
    await load();
  };
  const saveCatalog = async () => {
    if (!catalog.catalogName?.trim()) {
      setError("Catalog Name is required.");
      return;
    }
    if (
      catalog.source === "INTEGRATION" &&
      !catalog.integrationConfigurationId
    ) {
      setError(
        "Select an Integration Configuration for an integration catalog.",
      );
      return;
    }
    setSavingCatalog(true);
    const result = await organizationProductApi.saveCatalog(org, {
      productCatalogId: catalogEditing?.productCatalogId,
      catalogName: catalog.catalogName.trim(),
      description: undefined,
      integrationConfigurationId:
        catalog.source === "INTEGRATION"
          ? catalog.integrationConfigurationId
          : null,
      externalCatalogId:
        catalog.source === "INTEGRATION"
          ? catalog.externalCatalogId.trim() || null
          : null,
      active: catalog.active,
      versionNo: catalogEditing?.versionNo,
    });
    setSavingCatalog(false);
    if (!result.success) {
      setError(result.error?.message);
      return;
    }
    setCatalogId(result.data.productCatalogId);
    setShowCatalog(false);
    setCatalogEditing(null);
    setCatalog(emptyCatalog);
    await load();
  };
  const openCatalog = (selected?: OrganizationProductCatalog) => {
    setError(undefined);
    setCatalogEditing(selected ?? null);
    setCatalog(
      selected
        ? {
            catalogName: selected.catalogName,
            source: selected.integrationConfigurationId
              ? "INTEGRATION"
              : "MANUAL",
            integrationConfigurationId:
              selected.integrationConfigurationId ?? "",
            externalCatalogId: selected.externalCatalogId ?? "",
            active: selected.active,
          }
        : emptyCatalog,
    );
    setShowCatalog(true);
  };
  const save = async () => {
    if (
      !catalogId ||
      !product.productCode ||
      !product.productName ||
      !product.basePriceMinor
    )
      return setError("Catalog, code, name and price are required.");
    const result = await organizationProductApi.saveProduct(org, {
      ...(editing ?? {}),
      productId: editing?.productId,
      productCatalogId: catalogId,
      productCode: product.productCode,
      productName: product.productName,
      description: product.description || undefined,
      sku: product.sku || undefined,
      basePriceMinor: Number(product.basePriceMinor),
      currencyCode: product.currencyCode || "CAD",
      externalProductId: product.externalProductId || undefined,
      active: true,
      versionNo: editing?.versionNo,
    });
    if (!result.success) return setError(result.error?.message);
    setShowProduct(false);
    setEditing(null);
    setProduct(emptyProduct);
    await load();
  };
  const downloadImportTemplate = () => {
    if (Platform.OS !== "web") {
      setError("Excel template download is available in Org Admin web.");
      return;
    }
    const workbook = XLSX.utils.book_new();
    const productImportSheet = XLSX.utils.aoa_to_sheet([productImportHeaders]);
    productImportSheet["!cols"] = productImportColumnWidths.map((wch) => ({
      wch,
    }));
    const instructionsSheet = XLSX.utils.aoa_to_sheet([
      ["Memgine Product Import Template"],
      ["Keep the Product Import sheet blank and enter one product per row."],
      [],
      ["Column", "Instructions"],
      [
        "Memgine Product ID",
        "Leave blank for new Products. Use only when intentionally updating a known Memgine Product.",
      ],
      [
        "External Product ID",
        "Optional. For integrations without a separate external Product ID, leave blank; SKU can be used as the integration identity.",
      ],
      [
        "Product Code",
        "Required. Must be unique within the organization/import.",
      ],
      ["Product Name", "Required."],
      [
        "SKU",
        "For integration-linked catalogs this is the primary POS Product identity. It must be unique in the import. The same Product Code with a different SKU represents a different Product and must use a unique Product Code.",
      ],
      ["UPC", "Optional."],
      ["Category External ID", "Optional."],
      ["Category Name", "Optional."],
      [
        "Base Price",
        "Required. Use a normal currency amount, for example 4.99.",
      ],
      ["Currency", "Required 3-letter ISO code, for example CAD."],
      [
        "Active",
        "TRUE/FALSE. Defaults to TRUE if the existing importer behavior supports that.",
      ],
    ]);
    instructionsSheet["!cols"] = [{ wch: 28 }, { wch: 112 }];
    XLSX.utils.book_append_sheet(
      workbook,
      productImportSheet,
      "Product Import",
    );
    XLSX.utils.book_append_sheet(workbook, instructionsSheet, "Instructions");

    const workbookBytes = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "array",
    });
    const blobBytes = new Uint8Array(workbookBytes);
    const url = URL.createObjectURL(
      new Blob([blobBytes.buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = productImportTemplateFileName;
    link.click();
    URL.revokeObjectURL(url);
  };
  const selectFile = async (event: any) => {
    const file: File | undefined = event?.target?.files?.[0];
    if (!file) return;
    setError(undefined);
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: "",
      });
      const rows = records.map((r, index) => ({
        rowNumber: index + 2,
        productId: string(r["Memgine Product ID"]),
        externalProductId: string(r["External Product ID"]),
        productCode: string(r["Product Code"]),
        productName: string(r["Product Name"]),
        sku: string(r["SKU"]),
        upc: string(r["UPC"]),
        description: string(r["Description"]),
        categoryExternalId: string(r["Category External ID"]),
        categoryName: string(r["Category Name"]),
        basePriceMinor: moneyToMinor(r["Base Price"]),
        currencyCode: (string(r["Currency"]) || "CAD").toUpperCase(),
        active: string(r["Active"]).toLowerCase() !== "false",
      }));
      setFileName(file.name);
      setImportRows(rows);
      setPreview([]);
    } catch {
      setError(
        "Unable to read this Excel workbook. Use the documented column names and a .xlsx file.",
      );
    }
  };
  const previewImport = async () => {
    if (!catalogId || !importRows.length)
      return setError("Choose a catalog and Excel file first.");
    const result = await organizationProductApi.preview(org, {
      productCatalogId: catalogId,
      fileName,
      rows: importRows,
    });
    if (!result.success) return setError(result.error?.message);
    setPreview(result.data);
  };
  const commitImport = async () => {
    if (preview.some((r) => r.classification === "ERROR")) return;
    const result = await organizationProductApi.commit(org, {
      productCatalogId: catalogId,
      fileName,
      rows: importRows,
    });
    if (!result.success) return setError(result.error?.message);
    setShowImport(false);
    setImportRows([]);
    setPreview([]);
    await load();
  };
  const importErrors = preview.filter(
    (p) => p.classification === "ERROR",
  ).length;
  if (loading)
    return (
      <View style={{ padding: theme.spacing.xl }}>
        <Text>Loading products…</Text>
      </View>
    );
  return (
    <ScrollView
      contentContainerStyle={{
        padding: theme.spacing.xl,
        gap: theme.spacing.lg,
      }}
    >
      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="h1">Products</Text>
        <Text color="textMuted">
          Manage your organization’s catalog. Integration-linked products keep
          their canonical Memgine Product identity.
        </Text>
      </View>
      {error ? <Text color="danger">{error}</Text> : null}
      {successMessage ? <Text color="success">{successMessage}</Text> : null}
      <View
        style={{
          gap: theme.spacing.sm,
          padding: theme.spacing.md,
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.lg,
        }}
      >
        <Text variant="bodyStrong">Catalog</Text>
        {catalogs.length ? (
          <View style={{ gap: theme.spacing.sm }}>
            {catalogs.map((item) => (
              <Pressable
                key={item.productCatalogId}
                onPress={() => setCatalogId(item.productCatalogId)}
                style={{
                  padding: theme.spacing.sm,
                  borderWidth: 1,
                  borderColor:
                    catalogId === item.productCatalogId
                      ? theme.colors.primary
                      : theme.colors.border,
                  borderRadius: theme.radius.md,
                }}
              >
                <Text variant="bodyStrong">{item.catalogName}</Text>
                <Text color="textMuted">
                  {item.integrationName
                    ? `${item.integrationName} · ${item.provider ?? "Integration"}`
                    : "Manual"}
                </Text>
              </Pressable>
            ))}
            {activeCatalog ? (
              <Button
                label="Edit Catalog"
                size="sm"
                variant="outline"
                onPress={() => openCatalog(activeCatalog)}
              />
            ) : null}
          </View>
        ) : (
          <Text color="textMuted">
            No product catalog configured yet. Create a catalog before adding or
            importing products.
          </Text>
        )}
        <Button label="Add Catalog" size="sm" onPress={() => openCatalog()} />
      </View>
      <View
        style={{
          flexDirection: "row",
          gap: theme.spacing.sm,
          flexWrap: "wrap",
        }}
      >
        <Button
          label="Add Product"
          disabled={!catalogId}
          onPress={() => {
            setEditing(null);
            setProduct(emptyProduct);
            setShowProduct(true);
          }}
        />
        <Button
          label="Upload Excel"
          variant="outline"
          disabled={!catalogId}
          onPress={() => setShowImport(true)}
        />
        <Button
          label="Sync from POS"
          variant="outline"
          disabled={!catalogId || !integrations.length}
          onPress={() => {
            setError(undefined);
            setSuccessMessage(undefined);
            setSelectedSyncIntegrationId(integrations.length === 1 ? integrations[0].id : "");
            setSelectedSyncStoreId(null);
            setShowPosSync(true);
          }}
        />
        <Button
          label="Download Template"
          variant="outline"
          onPress={downloadImportTemplate}
        />
      </View>
      <DataTable
        data={products}
        keyExtractor={(p) => p.productId}
        columns={[
          {
            key: "name",
            title: "Product",
            render: (p) => (
              <View>
                <Text variant="bodyStrong">{p.productName}</Text>
                <Text color="textMuted">{p.productCode}</Text>
              </View>
            ),
          },
          {
            key: "catalog",
            title: "Catalog",
            render: (p) => <Text>{p.catalogName ?? "—"}</Text>,
          },
          {
            key: "price",
            title: "Price",
            render: (p) => (
              <Text>
                {p.basePriceMinor != null
                  ? `${p.currencyCode ?? ""} ${(p.basePriceMinor / 100).toFixed(2)}`
                  : "—"}
              </Text>
            ),
          },
          {
            key: "external",
            title: "External ID",
            render: (p) => <Text>{p.externalProductIds ?? "—"}</Text>,
          },
          {
            key: "mapping",
            title: "Mapping",
            render: (p) => {
              const health = mappingHealth(p);
              const canFix =
                health.label === "Needs attention" &&
                activeOrganizationScopeMappings(p).length > 1;
              return (
                <View>
                  <Text
                    variant={
                      health.label === "Needs attention" ? "bodyStrong" : "body"
                    }
                    color={
                      health.label === "Needs attention" ? "danger" : "text"
                    }
                  >
                    {health.label}
                  </Text>
                  {health.detail ? (
                    <Text color="textMuted">{health.detail}</Text>
                  ) : null}
                  {canFix ? (
                    <Button
                      label="Fix mapping"
                      size="sm"
                      variant="outline"
                      onPress={() => openMappingFix(p)}
                    />
                  ) : null}
                </View>
              );
            },
          },
        ]}
        actions={[
          {
            label: "Edit",
            onPress: (p) => {
              setEditing(p);
              setCatalogId(p.productCatalogId ?? catalogId);
              setProduct({
                ...p,
                basePriceMinor: String(p.basePriceMinor ?? ""),
                externalProductId: p.externalProductIds?.split(", ")[0] ?? "",
              });
              setShowProduct(true);
            },
          },
        ]}
        emptyMessage="No products yet. Add products manually or import an Excel workbook."
      />
      <Modal
        visible={showPosSync}
        onClose={resetPosSync}
        title="Sync from POS"
        scrollable
      >
        <View style={{ gap: theme.spacing.md }}>
          <Text color="textMuted">
            Fetch a read-only preview from a POS integration. The selected canonical catalog remains the destination; membership and subscription products are never imported here.
          </Text>
          <View style={{ gap: theme.spacing.xs }}>
            <Text variant="bodyStrong">Canonical catalog</Text>
            <Text>{activeCatalog?.catalogName ?? "No catalog selected"}</Text>
          </View>
          <View style={{ gap: theme.spacing.sm }}>
            <Text variant="bodyStrong">POS integration</Text>
            {integrations.map((integration) => (
              <Pressable
                key={integration.id}
                onPress={() => setSelectedSyncIntegrationId(integration.id)}
                style={{
                  padding: theme.spacing.sm,
                  borderWidth: 1,
                  borderColor: selectedSyncIntegrationId === integration.id ? theme.colors.primary : theme.colors.border,
                  borderRadius: theme.radius.md,
                }}
              >
                <Text variant="bodyStrong">{selectedSyncIntegrationId === integration.id ? "●" : "○"} {integration.integrationName}</Text>
                <Text color="textMuted">{integration.provider}</Text>
              </Pressable>
            ))}
          </View>
          <View style={{ gap: theme.spacing.sm }}>
            <Text variant="bodyStrong">Store scope</Text>
            <Pressable
              onPress={() => setSelectedSyncStoreId(null)}
              style={{
                padding: theme.spacing.sm,
                borderWidth: 1,
                borderColor: selectedSyncStoreId === null ? theme.colors.primary : theme.colors.border,
                borderRadius: theme.radius.md,
              }}
            >
              <Text>{selectedSyncStoreId === null ? "●" : "○"} Organization-wide</Text>
            </Pressable>
            {stores.map((store) => (
              <Pressable
                key={store.id}
                onPress={() => setSelectedSyncStoreId(store.id)}
                style={{
                  padding: theme.spacing.sm,
                  borderWidth: 1,
                  borderColor: selectedSyncStoreId === store.id ? theme.colors.primary : theme.colors.border,
                  borderRadius: theme.radius.md,
                }}
              >
                <Text>{selectedSyncStoreId === store.id ? "●" : "○"} {store.name}</Text>
                <Text color="textMuted">{store.storeCode}</Text>
              </Pressable>
            ))}
          </View>
          <Text color="textMuted">The server verifies that the selected integration supports catalog synchronization.</Text>
          <View style={{ flexDirection: "row", gap: theme.spacing.sm, flexWrap: "wrap" }}>
            <Button label="Cancel" variant="outline" onPress={resetPosSync} />
            <Button label={previewLoading ? "Fetching preview…" : "Fetch & Preview"} disabled={previewLoading || !catalogId || !selectedSyncIntegrationId} onPress={() => void fetchPosPreview()} />
          </View>
        </View>
      </Modal>
      <Modal
        visible={posPreview !== null}
        onClose={() => {
          setPosPreview(null);
          setShowApplyConfirmation(false);
        }}
        title="POS catalog preview"
        scrollable
      >
        {posPreview ? (
          <View style={{ gap: theme.spacing.md }}>
            <View style={{ gap: theme.spacing.xs }}>
              <Text variant="bodyStrong">{activeCatalog?.catalogName ?? posPreview.productCatalogId}</Text>
              <Text color="textMuted">Integration: {integrations.find((item) => item.id === posPreview.integrationConfigurationId)?.integrationName ?? posPreview.integrationConfigurationId}</Text>
              <Text color="textMuted">Scope: {posPreview.storeId ?? "Organization-wide"}</Text>
              <Text color="textMuted">Preview status: {posPreview.status}. It expires after 30 minutes; generate a fresh preview if apply reports expiry.</Text>
            </View>
            {!posPreview.fullCatalogComplete ? (
              <View style={{ gap: theme.spacing.xs, padding: theme.spacing.sm, borderWidth: 1, borderColor: theme.colors.danger, borderRadius: theme.radius.md }}>
                <Text color="danger" variant="bodyStrong">Incomplete provider catalog</Text>
                <Text color="textMuted">The provider did not return a complete catalog. Missing records are not treated as absent and this preview cannot safely apply changes.</Text>
              </View>
            ) : null}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
              {(["NEW", "MATCHED", "UPDATE", "UNCHANGED", "INACTIVE", "MISSING", "CONFLICT", "INVALID"] as const).map((action) => (
                <Text key={action} color={action === "CONFLICT" || action === "INVALID" ? "danger" : "textMuted"}>{action}: {summaryValue(action)}</Text>
              ))}
            </View>
            {blockingPreviewRows.length > 0 ? (
              <View style={{ gap: theme.spacing.xs, padding: theme.spacing.md, borderWidth: 1, borderColor: theme.colors.danger, borderRadius: theme.radius.md }}>
                <Text color="danger" variant="bodyStrong">{blockingPreviewRows.length} blocking record{blockingPreviewRows.length === 1 ? "" : "s"}</Text>
                <Text color="textMuted">P3 applies approved previews atomically. No valid rows will be imported until every conflict and invalid record is resolved and a fresh preview is generated. Partial import is unavailable.</Text>
              </View>
            ) : null}
            <Input label="Search preview" value={previewSearch} onChangeText={setPreviewSearch} placeholder="Name, SKU, external ID, canonical ID, reason" />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.xs }}>
              {["ALL", "NEW", "MATCHED", "UPDATE", "UNCHANGED", "INACTIVE", "MISSING", "CONFLICT", "INVALID"].map((action) => (
                <Button key={action} label={action} size="sm" variant={previewAction === action ? "primary" : "outline"} onPress={() => setPreviewAction(action)} />
              ))}
            </View>
            <DataTable
              data={filteredPreviewRows}
              keyExtractor={(row) => row.rowId}
              minTableWidth={1480}
              columns={[
                { key: "classification", title: "Classification", width: 120, render: (row) => <Text color={row.action === "CONFLICT" || row.action === "INVALID" ? "danger" : "text"}>{row.action}</Text> },
                { key: "product", title: "External Product", width: 220, render: (row) => <View><Text variant="bodyStrong">{row.productName}</Text>{row.externalVariantId ? <Text color="textMuted">Variant: {row.externalVariantId}</Text> : null}</View> },
                { key: "sku", title: "SKU", width: 160, render: (row) => <Text>{row.externalSku ?? "—"}</Text> },
                { key: "externalId", title: "External ID", width: 220, render: (row) => <Text>{row.externalProductId}</Text> },
                { key: "canonical", title: "Canonical Product", width: 220, render: (row) => <Text>{row.canonicalProductId ?? "—"}</Text> },
                { key: "price", title: "External Price", width: 150, render: (row) => <Text>{formatMinor(row.unitPriceMinor, row.currencyCode)}</Text> },
                { key: "state", title: "Provider State", width: 140, render: (row) => <Text>{row.active ? "Active" : "Inactive"}</Text> },
                { key: "proposed", title: "Proposed Action", width: 260, render: (row) => <View><Text>{row.action === "UPDATE" ? "Provider snapshot update; canonical product attributes stay unchanged." : row.action === "MATCHED" ? "Additional POS mapping." : row.eligibleForApply ? "Eligible for atomic apply." : "Not applied."}</Text>{row.hasDependentBusinessRules ? <Text color="danger">Dependent business rules require review.</Text> : null}</View> },
                { key: "reason", title: "Reason", width: 280, render: (row) => <Text color={row.action === "CONFLICT" || row.action === "INVALID" ? "danger" : "textMuted"}>{row.reason ?? "—"}</Text> },
              ]}
              emptyMessage="No preview rows match the current filters."
            />
            {applyUncertain ? <Text color="danger">The server did not confirm apply. Do not create a new preview; retry uses the same approval key.</Text> : null}
            {previewExpired ? <Text color="danger">This preview is no longer valid. Generate a fresh preview before applying any changes.</Text> : null}
            <View style={{ flexDirection: "row", gap: theme.spacing.sm, flexWrap: "wrap" }}>
              <Button label="Close" variant="outline" onPress={() => setPosPreview(null)} />
              <Button label="Generate fresh preview" variant="outline" onPress={() => { setPosPreview(null); setShowPosSync(true); }} />
              <Button label="Apply approved changes" disabled={blockingPreviewRows.length > 0 || !posPreview.fullCatalogComplete || previewExpired || applyingPreview} onPress={() => setShowApplyConfirmation(true)} />
            </View>
          </View>
        ) : null}
      </Modal>
      <Modal
        visible={showApplyConfirmation}
        onClose={() => setShowApplyConfirmation(false)}
        title="Apply catalog sync"
      >
        <View style={{ gap: theme.spacing.md }}>
          <Text variant="bodyStrong">Apply this approved preview to the selected canonical catalog?</Text>
          <Text color="textMuted">Apply is all-or-nothing. The server rejects the entire preview if it has expired, changed, or contains blocking records. No partial import will occur.</Text>
          <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
            <Button label="Cancel" variant="outline" onPress={() => setShowApplyConfirmation(false)} />
            <Button label={applyingPreview ? "Applying…" : "Confirm apply"} disabled={applyingPreview} onPress={() => void applyPosPreview()} />
          </View>
        </View>
      </Modal>
      <Modal
        visible={mappingProduct !== null}
        onClose={() => {
          setMappingProduct(null);
          setSelectedMappingId("");
        }}
        title="Fix mapping"
        scrollable
      >
        <View style={{ gap: theme.spacing.md }}>
          {mappingProduct ? (
            <>
              <View style={{ gap: theme.spacing.xs }}>
                <Text variant="bodyStrong">{mappingProduct.productName}</Text>
                <Text color="textMuted">
                  Canonical Product SKU: {mappingProduct.sku || "Not set"}
                </Text>
                <Text color="textMuted">
                  {mappingProduct.integrationName ?? "Integration"} ·
                  Organization-wide
                </Text>
              </View>
              <Text color="textMuted">
                Choose the one active mapping to keep. The other active mappings
                in this Product&apos;s integration and store scope will be
                deactivated.
              </Text>
              {activeOrganizationScopeMappings(mappingProduct).map(
                (mapping) => {
                  const recommended = recommendedMappingIds(
                    mappingProduct,
                  ).includes(mapping.mappingId);
                  const selected = selectedMappingId === mapping.mappingId;
                  return (
                    <Pressable
                      key={mapping.mappingId}
                      onPress={() => setSelectedMappingId(mapping.mappingId)}
                      style={{
                        gap: theme.spacing.xs,
                        padding: theme.spacing.md,
                        borderWidth: 1,
                        borderColor: selected
                          ? theme.colors.primary
                          : theme.colors.border,
                        borderRadius: theme.radius.md,
                      }}
                    >
                      <Text variant="bodyStrong">
                        {selected ? "●" : "○"}{" "}
                        {mapping.externalSku || mapping.externalProductId}
                        {recommended ? "  Recommended" : ""}
                      </Text>
                      <Text color="textMuted">
                        External Product ID: {mapping.externalProductId}
                      </Text>
                      {mapping.externalSku ? (
                        <Text color="textMuted">
                          SKU: {mapping.externalSku}
                        </Text>
                      ) : null}
                      <Text color="textMuted">
                        Integration:{" "}
                        {mappingProduct.integrationName ?? "Integration"}
                      </Text>
                      <Text color="textMuted">Store: Organization-wide</Text>
                    </Pressable>
                  );
                },
              )}
              <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
                <Button
                  label="Cancel"
                  variant="outline"
                  onPress={() => {
                    setMappingProduct(null);
                    setSelectedMappingId("");
                  }}
                />
                <Button
                  label={resolvingMapping ? "Saving…" : "Save mapping"}
                  disabled={!selectedMappingId || resolvingMapping}
                  onPress={() => void resolveMapping()}
                />
              </View>
            </>
          ) : null}
        </View>
      </Modal>
      <Modal
        visible={showCatalog}
        onClose={() => setShowCatalog(false)}
        title={catalogEditing ? "Edit Catalog" : "Add Catalog"}
        scrollable
      >
        <View style={{ gap: theme.spacing.md }}>
          <Input
            label="Catalog Name"
            required
            value={catalog.catalogName ?? ""}
            onChangeText={(value) =>
              setCatalog((current: any) => ({ ...current, catalogName: value }))
            }
          />
          <Text variant="bodyStrong">Source</Text>
          {(["MANUAL", "INTEGRATION"] as const).map((source) => (
            <Pressable
              key={source}
              onPress={() =>
                setCatalog((current: any) => ({
                  ...current,
                  source,
                  integrationConfigurationId:
                    source === "MANUAL"
                      ? ""
                      : current.integrationConfigurationId,
                }))
              }
              style={{
                padding: theme.spacing.sm,
                borderWidth: 1,
                borderColor:
                  catalog.source === source
                    ? theme.colors.primary
                    : theme.colors.border,
                borderRadius: theme.radius.md,
              }}
            >
              <Text>{source === "MANUAL" ? "Manual" : "Integration"}</Text>
            </Pressable>
          ))}
          {catalog.source === "INTEGRATION" ? (
            <View style={{ gap: theme.spacing.sm }}>
              <Text variant="bodyStrong">Integration Configuration</Text>
              {integrations.length ? (
                <View style={{ gap: theme.spacing.sm }}>
                  {integrations.map((integration) => (
                    <Pressable
                      key={integration.id}
                      onPress={() =>
                        setCatalog((current: any) => ({
                          ...current,
                          integrationConfigurationId: integration.id,
                        }))
                      }
                      style={{
                        padding: theme.spacing.sm,
                        borderWidth: 1,
                        borderColor:
                          catalog.integrationConfigurationId === integration.id
                            ? theme.colors.primary
                            : theme.colors.border,
                        borderRadius: theme.radius.md,
                      }}
                    >
                      <Text variant="bodyStrong">
                        {integration.integrationName}
                      </Text>
                      <Text color="textMuted">{integration.provider}</Text>
                    </Pressable>
                  ))}
                  <Button
                    label="Manage Integrations"
                    size="sm"
                    variant="ghost"
                    onPress={() =>
                      router.push(
                        APP_ROUTES.orgAdmin.settings.integrations(org) as never,
                      )
                    }
                  />
                </View>
              ) : (
                <View style={{ gap: theme.spacing.sm }}>
                  <Text color="textMuted">
                    No Integration Configurations are available for this
                    organization.
                  </Text>
                  <Button
                    label="Set Up Integration"
                    size="sm"
                    onPress={() =>
                      router.push(
                        APP_ROUTES.orgAdmin.settings.integrations(org) as never,
                      )
                    }
                  />
                </View>
              )}
              <Input
                label="External Catalog ID"
                value={catalog.externalCatalogId ?? ""}
                onChangeText={(value) =>
                  setCatalog((current: any) => ({
                    ...current,
                    externalCatalogId: value,
                  }))
                }
              />
            </View>
          ) : null}
          <Checkbox
            label="Active"
            value={catalog.active !== false}
            onValueChange={(active) =>
              setCatalog((current: any) => ({ ...current, active }))
            }
          />
          <Button
            label={savingCatalog ? "Saving…" : "Save Catalog"}
            disabled={savingCatalog}
            onPress={() => void saveCatalog()}
          />
        </View>
      </Modal>
      <Modal
        visible={showProduct}
        onClose={() => setShowProduct(false)}
        title={editing ? "Edit Product" : "Add Product"}
        scrollable
      >
        <View style={{ gap: theme.spacing.md }}>
          <Text color="textMuted">Catalog</Text>
          {catalogs.map((c) => (
            <Pressable
              key={c.productCatalogId}
              onPress={() => setCatalogId(c.productCatalogId)}
              style={{
                padding: theme.spacing.sm,
                borderWidth: 1,
                borderColor:
                  catalogId === c.productCatalogId
                    ? theme.colors.primary
                    : theme.colors.border,
                borderRadius: theme.radius.md,
              }}
            >
              <Text>
                {c.catalogName}
                {c.integrationName ? ` · ${c.integrationName}` : " · Manual"}
              </Text>
            </Pressable>
          ))}
          <Input
            label="Product Code"
            value={product.productCode ?? ""}
            onChangeText={(v) =>
              setProduct((p: any) => ({ ...p, productCode: v }))
            }
          />
          <Input
            label="Product Name"
            value={product.productName ?? ""}
            onChangeText={(v) =>
              setProduct((p: any) => ({ ...p, productName: v }))
            }
          />
          <Input
            label="SKU"
            value={product.sku ?? ""}
            onChangeText={(v) => setProduct((p: any) => ({ ...p, sku: v }))}
          />
          <Input
            label="Base price (major units)"
            keyboardType="decimal-pad"
            value={
              product.basePriceMinor
                ? String(Number(product.basePriceMinor) / 100)
                : ""
            }
            onChangeText={(v) =>
              setProduct((p: any) => ({
                ...p,
                basePriceMinor: String(moneyToMinor(v)),
              }))
            }
          />
          <Input
            label="Currency"
            value={product.currencyCode ?? "CAD"}
            maxLength={3}
            onChangeText={(v) =>
              setProduct((p: any) => ({ ...p, currencyCode: v.toUpperCase() }))
            }
          />
          {activeCatalog?.integrationConfigurationId ? (
            <Input
              label="External Product ID"
              value={product.externalProductId ?? ""}
              onChangeText={(v) =>
                setProduct((p: any) => ({ ...p, externalProductId: v }))
              }
            />
          ) : null}
          <Button label="Save Product" onPress={() => void save()} />
        </View>
      </Modal>
      <Modal
        visible={showImport}
        onClose={() => setShowImport(false)}
        title="Upload Product Excel"
        scrollable
      >
        <View style={{ gap: theme.spacing.md }}>
          <Text color="textMuted">
            Choose a catalog, then upload .xlsx columns: Memgine Product ID,
            External Product ID, Product Code, Product Name, SKU, UPC,
            Description, Category External ID, Category Name, Base Price,
            Currency, Active.
          </Text>
          {catalogs.map((c) => (
            <Pressable
              key={c.productCatalogId}
              onPress={() => setCatalogId(c.productCatalogId)}
              style={{
                padding: theme.spacing.sm,
                borderWidth: 1,
                borderColor:
                  catalogId === c.productCatalogId
                    ? theme.colors.primary
                    : theme.colors.border,
                borderRadius: theme.radius.md,
              }}
            >
              <Text>{c.catalogName}</Text>
            </Pressable>
          ))}
          {Platform.OS === "web" ? (
            <input type="file" accept=".xlsx" onChange={selectFile as any} />
          ) : (
            <Text color="textMuted">
              Excel upload is available in Org Admin web.
            </Text>
          )}
          <Button
            label="Validate & Preview"
            disabled={!importRows.length}
            onPress={() => void previewImport()}
          />
          {preview.length ? (
            <View style={{ gap: theme.spacing.xs }}>
              <Text>
                {preview.length} rows:{" "}
                {preview.filter((r) => r.classification === "NEW").length} new,{" "}
                {preview.filter((r) => r.classification === "UPDATE").length}{" "}
                updates,{" "}
                {preview.filter((r) => r.classification === "UNCHANGED").length}{" "}
                unchanged, {importErrors} errors.
              </Text>
              {preview
                .filter((r) => r.classification === "ERROR")
                .map((r) => (
                  <Text key={r.rowNumber} color="danger">
                    Row {r.rowNumber}: {r.reason}
                  </Text>
                ))}
              <Button
                label="Commit Import"
                disabled={importErrors > 0}
                onPress={() => void commitImport()}
              />
            </View>
          ) : null}
        </View>
      </Modal>
    </ScrollView>
  );
}
