import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import * as XLSX from "xlsx";
import {
  Button,
  Checkbox,
  Input,
  Modal,
  ReferenceSelect,
  Text,
} from "@/src/ui";
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
  type CommerceCatalogCategoryCorrespondence,
  type CommerceCatalogSyncExternalCategory,
} from "@/src/data/api/organization-product-api";
import { catalogScopedProductsApi } from "@/src/data/api/catalog-scoped-products-api";
import { CommerceStoreCatalogSourceApi } from "@/src/data/api/commerce-store-catalog-source-api";
import { organizationPoyntOperationalApi } from "@/src/data/api/platform-poynt-payment-api";
import {
  commerceManualRelinkApi,
  type CommerceManualRelinkPreview,
  type CommerceManualRelinkCandidate,
} from "@/src/data/api/commerce-manual-relink-api";

type ProductSection =
  | "PRODUCTS"
  | "CATEGORIES"
  | "MAPPINGS"
  | "SYNCHRONIZATION";

type CatalogMaintenanceContext = {
  key: string;
  storeId: string;
  integrationConfigurationId?: string | null;
  integrationName?: string | null;
  provider?: string | null;
  externalCatalogId?: string | null;
  externalCatalogName?: string | null;
  productCatalogId?: string | null;
  catalogName?: string | null;
  available: boolean;
  canSynchronize: boolean;
  reason?: string;
};

type ProductMappingHealth = {
  label:
    | "Linked to Business System"
    | "Not linked"
    | "Needs attention"
    | "Not applicable";
  detail?: string;
  scope?: "STORE" | "ORGANIZATION";
  effectiveMappings?: OrganizationCommerceProductMapping[];
};

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
  const { height: viewportHeight } = useWindowDimensions();
  const [catalogs, setCatalogs] = useState<OrganizationProductCatalog[]>([]);
  const [integrations, setIntegrations] = useState<IntegrationConfiguration[]>(
    [],
  );
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [maintenanceContexts, setMaintenanceContexts] = useState<
    CatalogMaintenanceContext[]
  >([]);
  const [selectedMaintenanceContextKey, setSelectedMaintenanceContextKey] =
    useState("");
  const [selectedManualCatalogId, setSelectedManualCatalogId] = useState("");
  const [runtimeCatalogIntegrationId, setRuntimeCatalogIntegrationId] =
    useState<string | null>(null);
  const [runtimeExternalCatalogId, setRuntimeExternalCatalogId] = useState<
    string | null
  >(null);
  const [runtimeCatalogName, setRuntimeCatalogName] = useState<string | null>(
    null,
  );
  const [maintenanceLoading, setMaintenanceLoading] = useState(false);
  const [maintenanceError, setMaintenanceError] = useState<string>();
  const [activeSection, setActiveSection] =
    useState<ProductSection>("PRODUCTS");
  // Selected catalog only: no organization-wide Product preload.
  const [products, setProducts] = useState<OrganizationProduct[]>([]);
  const [productsRefreshToken, setProductsRefreshToken] = useState(0);
  const [scopedProducts, setScopedProducts] = useState<OrganizationProduct[]>(
    [],
  );
  const [scopedProductsLoading, setScopedProductsLoading] = useState(false);
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
  const [catalogSetupContext, setCatalogSetupContext] =
    useState<CatalogMaintenanceContext | null>(null);
  const [catalogManualOnly, setCatalogManualOnly] = useState(false);
  const [catalog, setCatalog] = useState<any>(emptyCatalog);
  const [savingCatalog, setSavingCatalog] = useState(false);
  const [mappingProduct, setMappingProduct] =
    useState<OrganizationProduct | null>(null);
  const [selectedMappingId, setSelectedMappingId] = useState("");
  const [relinkMapping, setRelinkMapping] =
    useState<OrganizationCommerceProductMapping | null>(null);
  const [relinkTargetId, setRelinkTargetId] = useState("");
  const [relinkSearch, setRelinkSearch] = useState("");
  const [relinkCandidates, setRelinkCandidates] = useState<
    CommerceManualRelinkCandidate[]
  >([]);
  const [relinkCandidatesLoading, setRelinkCandidatesLoading] = useState(false);
  const [relinkCandidatesError, setRelinkCandidatesError] = useState<string>();
  const [mappingSearch, setMappingSearch] = useState("");
  const [expandedProductDetailsId, setExpandedProductDetailsId] = useState<
    string | null
  >(null);
  const [expandedProductTechnicalId, setExpandedProductTechnicalId] = useState<
    string | null
  >(null);
  const [expandedMappingDetailsId, setExpandedMappingDetailsId] = useState<
    string | null
  >(null);
  const [expandedMappingTechnicalId, setExpandedMappingTechnicalId] = useState<
    string | null
  >(null);
  const [showCatalogTechnicalDetails, setShowCatalogTechnicalDetails] =
    useState(false);
  const [relinkReason, setRelinkReason] = useState("");
  const [showRelinkTechnicalDetails, setShowRelinkTechnicalDetails] =
    useState(false);
  const [showMappingFixTechnicalDetails, setShowMappingFixTechnicalDetails] =
    useState(false);
  const [expandedCategoryTechnicalId, setExpandedCategoryTechnicalId] =
    useState<string | null>(null);
  const [showPreviewTechnicalDetails, setShowPreviewTechnicalDetails] =
    useState(false);
  const [relinkPreview, setRelinkPreview] =
    useState<CommerceManualRelinkPreview | null>(null);
  const [relinkBusy, setRelinkBusy] = useState(false);
  const [relinkError, setRelinkError] = useState<string>();

  const [resolvingMapping, setResolvingMapping] = useState(false);
  const [importRows, setImportRows] = useState<ProductImportRow[]>([]);
  const [preview, setPreview] = useState<ProductImportPreview[]>([]);
  const [fileName, setFileName] = useState("");
  const [showPosSync, setShowPosSync] = useState(false);
  const [selectedSyncIntegrationId, setSelectedSyncIntegrationId] =
    useState("");
  const [selectedSyncStoreId, setSelectedSyncStoreId] = useState<string | null>(
    null,
  );
  const [posPreview, setPosPreview] =
    useState<CommerceCatalogSyncPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [showApplyConfirmation, setShowApplyConfirmation] = useState(false);
  const [showReviewChanges, setShowReviewChanges] = useState(false);
  const [previewDetailsRow, setPreviewDetailsRow] =
    useState<CommerceCatalogSyncPreviewRow | null>(null);
  const [applyingPreview, setApplyingPreview] = useState(false);
  const [applyUncertain, setApplyUncertain] = useState(false);
  const [previewExpired, setPreviewExpired] = useState(false);
  const [previewSearch, setPreviewSearch] = useState("");
  const [previewAction, setPreviewAction] = useState("CHANGES");
  const previewListRef = useRef<ScrollView>(null);
  const [previewListScrolled, setPreviewListScrolled] = useState(false);
  const [resolvingPreviewRow, setResolvingPreviewRow] =
    useState<CommerceCatalogSyncPreviewRow | null>(null);
  const [selectedCanonicalProductId, setSelectedCanonicalProductId] =
    useState("");
  const [savingResolution, setSavingResolution] = useState(false);
  const [showCategoryCorrespondences, setShowCategoryCorrespondences] =
    useState(false);
  const [categoryCorrespondences, setCategoryCorrespondences] = useState<
    CommerceCatalogCategoryCorrespondence[]
  >([]);
  const [availableExternalCategories, setAvailableExternalCategories] =
    useState<CommerceCatalogSyncExternalCategory[]>([]);
  const [selectedExternalCategory, setSelectedExternalCategory] =
    useState<CommerceCatalogSyncExternalCategory | null>(null);
  const [selectedCanonicalCategoryId, setSelectedCanonicalCategoryId] =
    useState("");
  const [savingCategoryCorrespondence, setSavingCategoryCorrespondence] =
    useState(false);
  const [correspondenceToDeactivate, setCorrespondenceToDeactivate] =
    useState<CommerceCatalogCategoryCorrespondence | null>(null);
  const applyIdempotencyKey = useRef<string | null>(null);
  const maintenanceRequestVersion = useRef(0);
  const maintenanceStoreId = useRef("");
  const maintenanceContextKey = useRef("");
  const catalogSourceApi = useMemo(
    () => new CommerceStoreCatalogSourceApi(),
    [],
  );
  const load = useCallback(async () => {
    if (!org) return;
    setLoading(true);
    const [c, i, m, storeResult] = await Promise.all([
      organizationProductApi.catalogs(org),
      apis.integrationConfiguration.list(org),
      organizationProductApi.mappings(org),
      apis.store.list(org),
    ]);
    if (!c.success) setError(c.error?.message);
    else {
      setCatalogs(c.data);
    }
    if (!i.success) setError(i.error?.message);
    else setIntegrations(i.data);
    if (!m.success) setError(m.error?.message);
    else setMappings(m.data);
    if (!storeResult.success) setError(storeResult.error?.message);
    else {
      const activeStores = storeResult.data.filter((store) => !store.isDeleted);
      setStores(activeStores);
      setSelectedStoreId((current) => current || activeStores[0]?.id || "");
    }
    setProductsRefreshToken((current) => current + 1);
    setLoading(false);
  }, [org]);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    if (!org || !selectedStoreId) {
      setMaintenanceContexts([]);
      setSelectedMaintenanceContextKey("");
      setSelectedManualCatalogId("");
      maintenanceStoreId.current = "";
      maintenanceContextKey.current = "";
      setRuntimeCatalogIntegrationId(null);
      setRuntimeExternalCatalogId(null);
      setRuntimeCatalogName(null);
      return;
    }

    const requestVersion = ++maintenanceRequestVersion.current;
    const storeChanged = maintenanceStoreId.current !== selectedStoreId;
    maintenanceStoreId.current = selectedStoreId;
    setMaintenanceLoading(true);
    setMaintenanceError(undefined);
    if (storeChanged) {
      setMaintenanceContexts([]);
      setSelectedMaintenanceContextKey("");
      setSelectedManualCatalogId("");
      maintenanceContextKey.current = "";
      setCatalogId("");
      setRuntimeCatalogIntegrationId(null);
      setRuntimeExternalCatalogId(null);
      setRuntimeCatalogName(null);
      setPosPreview(null);
      setShowPosSync(false);
      setShowCategoryCorrespondences(false);
      setCategoryCorrespondences([]);
      setAvailableExternalCategories([]);
      setSelectedExternalCategory(null);
      setSelectedCanonicalCategoryId("");
      setResolvingPreviewRow(null);
      setShowApplyConfirmation(false);
      applyIdempotencyKey.current = null;
    }

    void (async () => {
      const poyntIntegrations = integrations.filter(
        (integration) =>
          !integration.isDeleted &&
          integration.provider.trim().toUpperCase() === "POYNT",
      );
      const [runtimeResult, configurationResults] = await Promise.all([
        catalogSourceApi.get(org, selectedStoreId),
        Promise.all(
          poyntIntegrations.map(async (integration) => ({
            integration,
            result: await organizationPoyntOperationalApi.configurations(
              org,
              integration.id,
            ),
          })),
        ),
      ]);

      if (requestVersion !== maintenanceRequestVersion.current) return;

      if (runtimeResult.success) {
        setRuntimeCatalogIntegrationId(
          runtimeResult.data.source?.integrationConfigurationId ?? null,
        );
        setRuntimeExternalCatalogId(
          runtimeResult.data.source?.catalogId ?? null,
        );
        setRuntimeCatalogName(
          runtimeResult.data.source?.catalogName ??
            runtimeResult.data.source?.catalogId ??
            null,
        );
      } else {
        setMaintenanceError(
          runtimeResult.error?.message ??
            "Unable to load the Store runtime catalog selection.",
        );
      }

      const contexts = new Map<string, CatalogMaintenanceContext>();
      for (const { integration, result } of configurationResults) {
        if (!result.success) {
          continue;
        }
        const configuration = result.data.find(
          (item) => item.storeId === selectedStoreId,
        );
        if (!configuration) continue;
        const externalCatalogId =
          configuration.effectiveCatalogId?.trim() || null;
        if (!externalCatalogId) continue;
        const pairKey = `${integration.id}:${externalCatalogId}`;
        const linkedCatalogs = externalCatalogId
          ? catalogs.filter(
              (catalog) =>
                catalog.integrationConfigurationId === integration.id &&
                catalog.externalCatalogId === externalCatalogId,
            )
          : [];
        const linkedCatalog =
          linkedCatalogs.length === 1 ? linkedCatalogs[0] : undefined;
        const reason = !externalCatalogId
          ? "This Store configuration has no verified external catalog ID."
          : linkedCatalogs.length > 1
            ? "More than one canonical catalog has this integration and external catalog identity."
            : !linkedCatalog
              ? "No canonical Memgine catalog is linked to this verified external catalog."
              : undefined;
        contexts.set(`configured:${pairKey}`, {
          key: `configured:${pairKey}`,
          storeId: selectedStoreId,
          integrationConfigurationId: integration.id,
          integrationName: integration.integrationName,
          provider: integration.provider,
          externalCatalogId,
          externalCatalogName: configuration.effectiveCatalogName,
          productCatalogId: linkedCatalog?.productCatalogId,
          catalogName: linkedCatalog?.catalogName,
          available: Boolean(linkedCatalog),
          canSynchronize: Boolean(linkedCatalog && externalCatalogId),
          reason,
        });
      }

      const resolvedContexts = [...contexts.values()].sort((left, right) =>
        `${left.integrationName ?? left.catalogName ?? ""}`.localeCompare(
          `${right.integrationName ?? right.catalogName ?? ""}`,
        ),
      );
      const runtimeSource = runtimeResult.success
        ? runtimeResult.data.source
        : null;
      if (
        runtimeSource &&
        !resolvedContexts.some(
          (context) =>
            context.integrationConfigurationId ===
              runtimeSource.integrationConfigurationId &&
            context.externalCatalogId === runtimeSource.catalogId,
        )
      ) {
        setMaintenanceError(
          "The runtime catalog source has no matching persisted Store catalog configuration. Review Integrations → Manage Store Terminals.",
        );
      }
      setMaintenanceContexts(resolvedContexts);
      const retainedContext = resolvedContexts.find(
        (context) => context.key === maintenanceContextKey.current,
      );
      if (retainedContext) {
        setCatalogId(retainedContext.productCatalogId ?? "");
      } else if (
        resolvedContexts.length === 1 &&
        resolvedContexts[0].available
      ) {
        setSelectedMaintenanceContextKey(resolvedContexts[0].key);
        maintenanceContextKey.current = resolvedContexts[0].key;
        setCatalogId(resolvedContexts[0].productCatalogId ?? "");
      } else {
        setSelectedMaintenanceContextKey("");
        maintenanceContextKey.current = "";
        setCatalogId("");
      }
      setMaintenanceLoading(false);
    })().catch((loadError: unknown) => {
      if (requestVersion !== maintenanceRequestVersion.current) return;
      setMaintenanceError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load Store catalog maintenance contexts.",
      );
      setMaintenanceLoading(false);
    });
  }, [catalogSourceApi, catalogs, integrations, org, selectedStoreId]);

  const selectedMaintenanceContext = maintenanceContexts.find(
    (context) => context.key === selectedMaintenanceContextKey,
  );
  const hasConfiguredCatalogContext = Boolean(
    selectedMaintenanceContext?.available &&
    selectedMaintenanceContext.externalCatalogId,
  );
  const activeCatalog = catalogs.find((c) => c.productCatalogId === catalogId);
  const manualCatalogs = useMemo(
    () => catalogs.filter((catalog) => !catalog.integrationConfigurationId),
    [catalogs],
  );
  const hasManualCatalogContext = Boolean(
    selectedManualCatalogId &&
    activeCatalog?.productCatalogId === selectedManualCatalogId &&
    !activeCatalog.integrationConfigurationId,
  );
  const hasProductMaintenanceContext =
    hasConfiguredCatalogContext || hasManualCatalogContext;
  const canSetUpStoreCatalog = Boolean(
    selectedMaintenanceContext &&
    !selectedMaintenanceContext.available &&
    selectedMaintenanceContext.integrationConfigurationId &&
    selectedMaintenanceContext.externalCatalogId &&
    !catalogs.some(
      (catalog) =>
        catalog.integrationConfigurationId ===
          selectedMaintenanceContext.integrationConfigurationId &&
        catalog.externalCatalogId ===
          selectedMaintenanceContext.externalCatalogId,
    ),
  );

  const applyMaintenanceContext = (contextKey: string) => {
    const context = maintenanceContexts.find((item) => item.key === contextKey);
    if (!context) return;
    setShowCatalogTechnicalDetails(false);
    setSelectedMaintenanceContextKey(contextKey);
    setSelectedManualCatalogId("");
    maintenanceContextKey.current = contextKey;
    setCatalogId(context.productCatalogId ?? "");
    setPosPreview(null);
    setShowPosSync(false);
    setShowCategoryCorrespondences(false);
    setCategoryCorrespondences([]);
    setAvailableExternalCategories([]);
    setSelectedExternalCategory(null);
    setSelectedCanonicalCategoryId("");
    setResolvingPreviewRow(null);
    setShowApplyConfirmation(false);
    applyIdempotencyKey.current = null;
  };

  const selectMaintenanceContext = (contextKey: string) => {
    if (contextKey === selectedMaintenanceContextKey) return;
    if (posPreview || showPosSync) {
      Alert.alert(
        "Discard synchronization work?",
        "Changing catalog maintenance context discards the current preview and any unresolved rows. Persisted products and mappings are unchanged.",
        [
          { text: "Keep current context", style: "cancel" },
          {
            text: "Discard and switch",
            style: "destructive",
            onPress: () => applyMaintenanceContext(contextKey),
          },
        ],
      );
      return;
    }
    applyMaintenanceContext(contextKey);
  };

  const selectManualCatalog = (manualCatalogId: string) => {
    if (!manualCatalogId) {
      setSelectedManualCatalogId("");
      setCatalogId("");
      return;
    }
    const catalog = manualCatalogs.find(
      (item) => item.productCatalogId === manualCatalogId,
    );
    if (!catalog) return;
    const switchCatalog = () => {
      setSelectedManualCatalogId(manualCatalogId);
      setSelectedMaintenanceContextKey("");
      maintenanceContextKey.current = "";
      setCatalogId(manualCatalogId);
      setPosPreview(null);
      setShowPosSync(false);
      setShowCategoryCorrespondences(false);
      setCategoryCorrespondences([]);
      setAvailableExternalCategories([]);
      setSelectedExternalCategory(null);
      setSelectedCanonicalCategoryId("");
      setResolvingPreviewRow(null);
      setShowApplyConfirmation(false);
      applyIdempotencyKey.current = null;
    };
    if (posPreview || showPosSync) {
      Alert.alert(
        "Discard synchronization work?",
        "Manual catalogs are organization-scoped and cannot use the current Store synchronization preview.",
        [
          { text: "Keep current context", style: "cancel" },
          {
            text: "Discard and switch",
            style: "destructive",
            onPress: switchCatalog,
          },
        ],
      );
      return;
    }
    switchCatalog();
  };

  const selectStore = (storeId: string) => {
    if (storeId === selectedStoreId) return;
    const switchStore = () => {
      maintenanceRequestVersion.current += 1;
      setShowCatalogTechnicalDetails(false);
      setExpandedMappingDetailsId(null);
      setSelectedStoreId(storeId);
      setMaintenanceContexts([]);
      setSelectedMaintenanceContextKey("");
      setSelectedManualCatalogId("");
      maintenanceContextKey.current = "";
      setCatalogId("");
      setRuntimeCatalogIntegrationId(null);
      setRuntimeExternalCatalogId(null);
      setRuntimeCatalogName(null);
      setPosPreview(null);
      setShowPosSync(false);
      setShowCategoryCorrespondences(false);
      setCategoryCorrespondences([]);
      setAvailableExternalCategories([]);
      setSelectedExternalCategory(null);
      setSelectedCanonicalCategoryId("");
      setResolvingPreviewRow(null);
      setShowApplyConfirmation(false);
      applyIdempotencyKey.current = null;
    };
    if (posPreview || showPosSync) {
      Alert.alert(
        "Discard synchronization work?",
        "Changing Stores discards the current preview and any unresolved rows. Persisted products and mappings are unchanged.",
        [
          { text: "Keep current Store", style: "cancel" },
          {
            text: "Discard and switch",
            style: "destructive",
            onPress: switchStore,
          },
        ],
      );
      return;
    }
    switchStore();
  };

  // W229: the main Products list uses a server-filtered query, not an org-wide
  // array filtered in the browser. Do not dedupe by name or SKU.
  const catalogProducts = scopedProducts;
  useEffect(() => {
    let cancelled = false;
    setScopedProducts([]);
    setProducts([]);
    if (!org || !catalogId) {
      setScopedProductsLoading(false);
      return;
    }
    setScopedProductsLoading(true);
    void catalogScopedProductsApi
      .list(org, catalogId)
      .then((response) => {
        if (cancelled) return;
        if (response.success) {
          setScopedProducts(response.data);
          setProducts(response.data);
        } else {
          setError(
            response.error?.message ||
              "Unable to load this catalog's Products.",
          );
        }
      })
      .catch(() => {
        if (!cancelled) setError("Unable to load this catalog's Products.");
      })
      .finally(() => {
        if (!cancelled) setScopedProductsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [org, catalogId, productsRefreshToken]);
  // W222 adds externalCatalogId to mapping API responses, but the current
  // OrganizationCommerceProductMapping TypeScript declaration has not yet
  // declared it. Read the optional field without altering existing API types.
  // Missing IDs must never be replaced by the selected Store's catalog ID.
  const mappingExternalCatalogId = (
    mapping: OrganizationCommerceProductMapping,
  ): string | null =>
    (
      mapping as OrganizationCommerceProductMapping & {
        externalCatalogId?: string | null;
      }
    ).externalCatalogId?.trim() || null;

  // Mapping ownership is scoped by its Store/integration, NOT by the catalog
  // containing its canonical Product. A relink may intentionally target a
  // canonical Product from another catalog in the same organization.
  const catalogMappings = useMemo(
    () =>
      mappings.filter(
        (mapping) =>
          Boolean(selectedStoreId) &&
          mapping.storeId === selectedStoreId &&
          Boolean(selectedMaintenanceContext?.integrationConfigurationId) &&
          mapping.integrationConfigurationId ===
            selectedMaintenanceContext?.integrationConfigurationId &&
          mappingExternalCatalogId(mapping) ===
            selectedMaintenanceContext?.externalCatalogId,
      ),
    [
      mappings,
      selectedStoreId,
      selectedMaintenanceContext?.integrationConfigurationId,
      selectedMaintenanceContext?.externalCatalogId,
    ],
  );
  const productNameById = useMemo(
    () =>
      new Map(
        products
          .filter((product) => product.organizationId === org)
          .map((product) => [product.productId, product]),
      ),
    [products, org],
  );
  // Resolve the external Poynt catalog, not the canonical Product's catalog.
  const externalCatalogLabel = (
    mapping: OrganizationCommerceProductMapping,
  ): string => {
    const externalCatalogId = mappingExternalCatalogId(mapping);
    if (!externalCatalogId) return "Catalog not specified";
    const linked = catalogs.find(
      (item) =>
        item.integrationConfigurationId ===
          mapping.integrationConfigurationId &&
        item.externalCatalogId === externalCatalogId,
    );
    if (
      selectedMaintenanceContext?.integrationConfigurationId ===
        mapping.integrationConfigurationId &&
      selectedMaintenanceContext?.externalCatalogId === externalCatalogId &&
      selectedMaintenanceContext.externalCatalogName?.trim()
    )
      return selectedMaintenanceContext.externalCatalogName.trim();
    return linked?.catalogName?.trim() || "Catalog name unavailable";
  };
  const filteredCatalogMappings = useMemo(() => {
    const term = mappingSearch.trim().toLocaleLowerCase();
    return catalogMappings
      .filter((mapping) => {
        const product = mapping.productId
          ? productNameById.get(mapping.productId)
          : undefined;
        return (
          !term ||
          [
            product?.productName,
            product?.categoryName,
            product?.sku,
            product?.productCode,
            mapping.externalSku,
            mapping.externalProductId,
            externalCatalogLabel(mapping),
            mapping.mappingId,
            mapping.productId,
            mapping.storeId,
          ].some((value) => value?.toLocaleLowerCase().includes(term))
        );
      })
      .sort((a, b) => {
        const pa = a.productId ? productNameById.get(a.productId) : undefined;
        const pb = b.productId ? productNameById.get(b.productId) : undefined;
        return (
          (
            pa?.productName ||
            a.externalSku ||
            a.externalProductId
          ).localeCompare(
            pb?.productName || b.externalSku || b.externalProductId,
            undefined,
            { sensitivity: "base" },
          ) ||
          (a.externalSku ?? "").localeCompare(b.externalSku ?? "") ||
          a.mappingId.localeCompare(b.mappingId)
        );
      });
  }, [
    catalogMappings,
    mappingSearch,
    productNameById,
    catalogs,
    selectedMaintenanceContext,
  ]);
  const blockingPreviewRows =
    posPreview?.rows.filter(
      (row) => row.action === "CONFLICT" || row.action === "INVALID",
    ) ?? [];
  const filteredPreviewRows = useMemo(() => {
    if (!posPreview) return [] as CommerceCatalogSyncPreviewRow[];
    const search = previewSearch.trim().toLowerCase();
    const rows = posPreview.rows.filter((row) => {
      const actionMatches =
        previewAction === "ALL" ||
        (previewAction === "CHANGES" &&
          row.action !== "MATCHED" &&
          row.action !== "UNCHANGED") ||
        row.action === previewAction;
      const textMatches =
        !search ||
        [
          row.productName,
          row.externalSku,
          row.externalProductId,
          row.externalVariantId,
          row.canonicalProductId,
          row.reason,
        ].some((value) => value?.toLowerCase().includes(search));
      return actionMatches && textMatches;
    });
    if (previewAction !== "ALL" && previewAction !== "CHANGES") return rows;
    const priority = (action: CommerceCatalogSyncPreviewRow["action"]) =>
      action === "CONFLICT" ? 0 : action === "INVALID" ? 1 : 2;
    return rows.sort(
      (left, right) => priority(left.action) - priority(right.action),
    );
  }, [posPreview, previewAction, previewSearch]);
  const summaryValue = (action: string) =>
    posPreview &&
    Object.prototype.hasOwnProperty.call(posPreview.summary, action)
      ? posPreview.summary[action]
      : "—";
  const openPreviewResolution = (row: CommerceCatalogSyncPreviewRow) => {
    setResolvingPreviewRow(row);
    setSelectedCanonicalProductId("");
  };
  const formatMinor = (minor: number, currency: string) =>
    `${currency} ${(minor / 100).toFixed(2)}`;
  // Only compare attributes supplied by the preview API. Never invent a previous value.
  const previewAttributeRows = (row: CommerceCatalogSyncPreviewRow) => {
    const before = row.previousAttributes;
    const after = row.proposedAttributes;
    if (!before || !after) return null;
    const columns: Array<{
      label: string;
      before: string;
      after: string;
      changed: boolean;
    }> = [
      {
        label: "Product name",
        before: before.productName ?? "—",
        after: after.productName ?? "—",
        changed: before.productName !== after.productName,
      },
      {
        label: "SKU",
        before: before.externalSku ?? "—",
        after: after.externalSku ?? "—",
        changed: (before.externalSku ?? null) !== (after.externalSku ?? null),
      },
      {
        label: "Price",
        before: formatMinor(before.unitPriceMinor, before.currencyCode),
        after: formatMinor(after.unitPriceMinor, after.currencyCode),
        changed:
          before.unitPriceMinor !== after.unitPriceMinor ||
          before.currencyCode !== after.currencyCode,
      },
      {
        label: "Description",
        before: before.description ?? "—",
        after: after.description ?? "—",
        changed: (before.description ?? null) !== (after.description ?? null),
      },
      {
        label: "Active",
        before: before.active ? "Yes" : "No",
        after: after.active ? "Yes" : "No",
        changed: before.active !== after.active,
      },
    ];
    return columns;
  };
  const previewChangeSummary = (row: CommerceCatalogSyncPreviewRow) => {
    if (row.action !== "UPDATE") return null;
    const details = previewAttributeRows(row);
    if (!details) return "Change details unavailable";
    const changed = details
      .filter((entry) => entry.changed && entry.label !== "Source updated")
      .map((entry) => entry.label);
    return changed.length
      ? `Changes: ${changed.join(", ")}`
      : "No differences in supplied attributes";
  };
  const previewCategoryLabel = (row: CommerceCatalogSyncPreviewRow) =>
    row.externalCategories?.length
      ? row.externalCategories
          .map(
            (category) => category.categoryName?.trim() || "Unnamed category",
          )
          .join(", ")
      : row.categoryMetadataAvailable
        ? "Uncategorized"
        : "Category metadata unavailable";

  const resolutionCandidates = resolvingPreviewRow
    ? products.filter(
        (product) =>
          product.productCatalogId === catalogId &&
          product.active &&
          product.sku?.trim().toUpperCase() ===
            resolvingPreviewRow.externalSku?.trim().toUpperCase(),
      )
    : [];
  const externalCategories = useMemo(() => {
    const byId = new Map<string, CommerceCatalogSyncExternalCategory>();
    posPreview?.rows.forEach((row) =>
      row.externalCategories?.forEach((category) =>
        byId.set(category.externalCategoryId, category),
      ),
    );
    return [...byId.values()].sort((a, b) =>
      (a.categoryName ?? a.externalCategoryId).localeCompare(
        b.categoryName ?? b.externalCategoryId,
      ),
    );
  }, [posPreview]);
  const canonicalCategories = useMemo(() => {
    const byId = new Map<string, string>();
    products
      .filter(
        (product) =>
          product.productCatalogId === catalogId &&
          product.productCatalogCategoryId,
      )
      .forEach((product) =>
        byId.set(
          product.productCatalogCategoryId!,
          product.categoryName ?? product.productCatalogCategoryId!,
        ),
      );
    return [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [catalogId, products]);
  const loadCategoryCorrespondences = async () => {
    if (!selectedSyncIntegrationId || !catalogId) return;
    const result = await organizationProductApi.categoryCorrespondences(
      org,
      selectedSyncIntegrationId,
      catalogId,
    );
    if (!result.success) {
      setError(
        result.error?.message ?? "Unable to load category correspondences.",
      );
      return;
    }
    setCategoryCorrespondences(result.data);
  };
  const openCategoryCorrespondences = async () => {
    await loadCategoryCorrespondences();
    setAvailableExternalCategories(externalCategories);
    setSelectedExternalCategory(null);
    setSelectedCanonicalCategoryId("");
    setShowCategoryCorrespondences(true);
  };
  const saveCategoryCorrespondence = async () => {
    if (
      !selectedExternalCategory ||
      !selectedCanonicalCategoryId ||
      !selectedSyncIntegrationId ||
      !catalogId
    )
      return;
    setSavingCategoryCorrespondence(true);
    const existing = categoryCorrespondences.find(
      (item) =>
        item.externalCategoryId === selectedExternalCategory.externalCategoryId,
    );
    const result = await organizationProductApi.saveCategoryCorrespondence(
      org,
      selectedSyncIntegrationId,
      catalogId,
      {
        externalCategoryId: selectedExternalCategory.externalCategoryId,
        externalCategoryName: selectedExternalCategory.categoryName,
        externalParentCategoryId:
          selectedExternalCategory.parentExternalCategoryId,
        productCatalogCategoryId: selectedCanonicalCategoryId,
        versionNo: existing?.versionNo,
      },
    );
    setSavingCategoryCorrespondence(false);
    if (!result.success) {
      setError(
        result.error?.message ?? "Unable to save category correspondence.",
      );
      return;
    }
    await loadCategoryCorrespondences();
    setPosPreview(null);
    setSuccessMessage(
      "Category correspondence saved. Generate a fresh preview before applying synchronization.",
    );
  };
  const deactivateCategoryCorrespondence = async (
    item: CommerceCatalogCategoryCorrespondence,
  ) => {
    const result =
      await organizationProductApi.deactivateCategoryCorrespondence(
        org,
        item.correspondenceId,
        item.versionNo,
      );
    if (!result.success) {
      setError(
        result.error?.message ??
          "Unable to deactivate category correspondence.",
      );
      return;
    }
    await loadCategoryCorrespondences();
    setPosPreview(null);
    setCorrespondenceToDeactivate(null);
    setSuccessMessage(
      "Category correspondence deactivated. Generate a fresh preview before applying synchronization.",
    );
  };
  const resolvePreviewRow = async () => {
    if (!posPreview || !resolvingPreviewRow || !selectedCanonicalProductId)
      return;
    const product = resolutionCandidates.find(
      (item) => item.productId === selectedCanonicalProductId,
    );
    if (!product) return;
    setSavingResolution(true);
    const result = await organizationProductApi.resolvePosCatalogConflict(
      org,
      posPreview.previewId,
      resolvingPreviewRow.rowId,
      {
        canonicalProductId: product.productId,
        expectedCanonicalProductVersionNo: product.versionNo,
      },
    );
    setSavingResolution(false);
    if (!result.success) {
      setError(
        result.error?.message ?? "Unable to save the catalog resolution.",
      );
      return;
    }
    setPosPreview((current) =>
      current
        ? {
            ...current,
            rows: current.rows.map((row) =>
              row.rowId === resolvingPreviewRow.rowId
                ? {
                    ...row,
                    canonicalProductId: product.productId,
                    action: "MATCHED",
                    eligibleForApply: true,
                    reason:
                      "Administrator selected canonical product for ambiguous SKU",
                  }
                : row,
            ),
            summary: {
              ...current.summary,
              CONFLICT: Math.max(0, (current.summary.CONFLICT ?? 0) - 1),
              MATCHED: (current.summary.MATCHED ?? 0) + 1,
            },
          }
        : current,
    );
    setResolvingPreviewRow(null);
    setSelectedCanonicalProductId("");
  };
  const resetPosSync = () => {
    setShowPosSync(false);
    setSelectedSyncIntegrationId("");
    setSelectedSyncStoreId(null);
    setPosPreview(null);
    setPreviewSearch("");
    setPreviewAction("CHANGES");
    setApplyUncertain(false);
    setPreviewExpired(false);
    setPreviewListScrolled(false);
    applyIdempotencyKey.current = null;
  };
  const fetchPosPreview = async () => {
    if (
      !catalogId ||
      !selectedMaintenanceContext?.canSynchronize ||
      selectedMaintenanceContext.productCatalogId !== catalogId ||
      selectedMaintenanceContext.integrationConfigurationId !==
        selectedSyncIntegrationId ||
      selectedSyncStoreId !== selectedStoreId
    ) {
      setError(
        "Select one verified Store catalog maintenance context before generating a preview.",
      );
      return;
    }
    setPreviewLoading(true);
    setError(undefined);
    setSuccessMessage(undefined);
    const result = await organizationProductApi.previewPosCatalog(
      org,
      selectedSyncIntegrationId,
      { productCatalogId: catalogId, storeId: selectedSyncStoreId },
    );
    setPreviewLoading(false);
    if (!result.success) {
      setError(
        result.error?.message ?? "Unable to fetch the POS catalog preview.",
      );
      return;
    }
    setPosPreview(result.data);
    setShowPosSync(false);
    setPreviewSearch("");
    setPreviewAction("CHANGES");
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
    const result = await organizationProductApi.applyPosCatalogSync(
      org,
      posPreview.previewId,
      {
        approved: true,
        idempotencyKey: applyIdempotencyKey.current,
      },
    );
    setApplyingPreview(false);
    if (!result.success) {
      const code = result.error?.code?.toUpperCase() ?? "";
      const message = result.error?.message ?? "";
      setPreviewExpired(
        code.includes("EXPIRED") ||
          code.includes("STALE") ||
          /expired|stale/i.test(message),
      );
      setApplyUncertain(true);
      setShowApplyConfirmation(false);
      setError(
        message ||
          "We could not confirm the catalog sync outcome. Retry uses the same approval key.",
      );
      return;
    }
    setShowApplyConfirmation(false);
    setSuccessMessage(
      `Catalog sync applied: ${result.data.createdCount} created, ${result.data.appliedCount} updated, ${result.data.mappedCount} mappings changed.`,
    );
    setPosPreview(null);
    applyIdempotencyKey.current = null;
    await load();
  };
  const activeMappingsForProduct = (item: OrganizationProduct) => {
    const integrationConfigurationId =
      selectedMaintenanceContext?.integrationConfigurationId;
    if (!integrationConfigurationId) return [];
    return mappings.filter(
      (mapping) =>
        mapping.active &&
        mapping.productId === item.productId &&
        mapping.integrationConfigurationId === integrationConfigurationId &&
        mappingExternalCatalogId(mapping) ===
          selectedMaintenanceContext?.externalCatalogId,
    );
  };
  const activeStoreScopeMappings = (item: OrganizationProduct) =>
    activeMappingsForProduct(item).filter(
      (mapping) => mapping.storeId === selectedStoreId,
    );
  // W230-B1: external attributes are always read from the mapping's own snapshot.
  const selectedSnapshotForProduct = (item: OrganizationProduct) =>
    activeStoreScopeMappings(item).length === 1
      ? activeStoreScopeMappings(item)[0].snapshot
      : null;
  const productCategoryLabel = (item: OrganizationProduct) => {
    const snapshot = selectedSnapshotForProduct(item);
    if (!snapshot) return item.categoryName || "Uncategorized";
    if (!snapshot.categoryMetadataAvailable) return "Category unavailable";
    return snapshot.externalCategories?.length
      ? snapshot.externalCategories
          .map((c) => c.categoryName?.trim() || c.externalCategoryId)
          .join(", ")
      : "Uncategorized";
  };
  const activeOrganizationScopeMappings = (item: OrganizationProduct) =>
    activeMappingsForProduct(item).filter((mapping) => !mapping.storeId);
  const mappingHealth = (item: OrganizationProduct): ProductMappingHealth => {
    if (
      !selectedStoreId ||
      !selectedMaintenanceContext?.integrationConfigurationId
    ) {
      return {
        label: "Not applicable",
        detail: "Select a configured POS catalog to review mappings.",
      };
    }

    const storeMappings = activeStoreScopeMappings(item);
    if (storeMappings.length > 1) {
      return {
        label: "Needs attention",
        detail: `${storeMappings.length} active Store-specific mappings`,
        scope: "STORE",
        effectiveMappings: storeMappings,
      };
    }
    if (storeMappings.length === 1) {
      return {
        label: "Linked to Business System",
        detail: "Store-specific mapping",
        scope: "STORE",
        effectiveMappings: storeMappings,
      };
    }

    const organizationMappings = activeOrganizationScopeMappings(item);
    if (organizationMappings.length > 1) {
      return {
        label: "Needs attention",
        detail: `${organizationMappings.length} active organization-wide mappings`,
        scope: "ORGANIZATION",
        effectiveMappings: organizationMappings,
      };
    }
    if (organizationMappings.length === 1) {
      return {
        label: "Linked to Business System",
        detail: "Organization-wide mapping",
        scope: "ORGANIZATION",
        effectiveMappings: organizationMappings,
      };
    }
    return {
      label: "Not linked",
      detail: "No active mapping for this Store and integration.",
    };
  };
  const canFixOrganizationScopeMapping = (item: OrganizationProduct) => {
    const health = mappingHealth(item);
    return (
      health.label === "Needs attention" &&
      health.scope === "ORGANIZATION" &&
      (health.effectiveMappings?.length ?? 0) > 1
    );
  };
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
    setShowMappingFixTechnicalDetails(false);
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
  const openManualRelink = (mapping: OrganizationCommerceProductMapping) => {
    setRelinkMapping(mapping);
    setShowRelinkTechnicalDetails(false);
    setRelinkTargetId("");
    setRelinkSearch("");
    setRelinkCandidates([]);
    setRelinkCandidatesError(undefined);
    setRelinkReason("");
    setRelinkPreview(null);
    setRelinkError(undefined);
  };
  const previewManualRelink = async () => {
    if (!relinkMapping || !relinkTargetId) return;
    setRelinkBusy(true);
    setRelinkPreview(null);
    setRelinkError(undefined);
    try {
      const result = await commerceManualRelinkApi.preview(
        org,
        relinkMapping.mappingId,
        relinkTargetId,
      );
      if (!result.success) {
        setRelinkError(
          result.error?.message ?? "Cannot preview this mapping change.",
        );
      } else {
        setRelinkPreview(result.data);
      }
    } catch {
      setRelinkError("Unable to load a verified mapping preview.");
    } finally {
      setRelinkBusy(false);
    }
  };
  const confirmManualRelink = async () => {
    if (!relinkMapping || !relinkPreview || relinkBusy || !relinkReason.trim())
      return;
    if (
      relinkPreview.mappingId !== relinkMapping.mappingId ||
      relinkPreview.targetProductId !== relinkTargetId ||
      relinkPreview.alreadyLinked
    )
      return;
    setRelinkBusy(true);
    setRelinkError(undefined);
    try {
      const result = await commerceManualRelinkApi.confirm(
        org,
        relinkMapping.mappingId,
        {
          targetProductId: relinkPreview.targetProductId,
          expectedMappingVersionNo: relinkPreview.expectedMappingVersionNo,
          expectedTargetProductVersionNo: relinkPreview.targetProductVersionNo,
          reason: relinkReason.trim(),
        },
      );
      if (!result.success) {
        setRelinkError(
          result.error?.message ??
            "Mapping change rejected. Generate a fresh preview.",
        );
        setRelinkPreview(null);
      } else {
        setRelinkMapping(null);
        setRelinkPreview(null);
        setPosPreview(null);
        setSuccessMessage(
          "Product mapping linked. Generate a fresh catalog sync preview before applying another sync.",
        );
        await load();
      }
    } catch {
      setRelinkError(
        "Unable to confirm mapping change. Refresh mappings before retrying.",
      );
      setRelinkPreview(null);
    } finally {
      setRelinkBusy(false);
    }
  };
  // All authorization, Store integration scoping and exclusion of the current
  // canonical Product take place in PostgreSQL. Never fall back to local products.
  useEffect(() => {
    if (!relinkMapping || !org) {
      setRelinkCandidates([]);
      setRelinkCandidatesLoading(false);
      return;
    }
    let cancelled = false;
    setRelinkCandidatesLoading(true);
    setRelinkCandidatesError(undefined);
    // No automatic retry or local fallback on errors.
    void commerceManualRelinkApi
      .candidates(org, relinkMapping.mappingId, relinkSearch)
      .then((result) => {
        if (cancelled) return;
        if (result.success) setRelinkCandidates(result.data);
        else {
          setRelinkCandidates([]);
          setRelinkCandidatesError(
            result.error?.message ?? "Cannot load eligible Products.",
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRelinkCandidates([]);
          setRelinkCandidatesError("Cannot load eligible Products.");
        }
      })
      .finally(() => {
        if (!cancelled) setRelinkCandidatesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [org, relinkMapping?.mappingId, relinkSearch]);

  const saveCatalog = async () => {
    if (!catalog.catalogName?.trim()) {
      setError("Catalog Name is required.");
      return;
    }
    if (catalogSetupContext) {
      const currentContext = maintenanceContexts.find(
        (context) => context.key === catalogSetupContext.key,
      );
      const alreadyLinked = catalogs.some(
        (item) =>
          item.integrationConfigurationId ===
            catalogSetupContext.integrationConfigurationId &&
          item.externalCatalogId === catalogSetupContext.externalCatalogId,
      );
      if (
        selectedStoreId !== catalogSetupContext.storeId ||
        selectedMaintenanceContextKey !== catalogSetupContext.key ||
        !currentContext ||
        currentContext.available ||
        !catalogSetupContext.integrationConfigurationId ||
        !catalogSetupContext.externalCatalogId ||
        alreadyLinked
      ) {
        setError(
          "This Store catalog configuration changed or is already linked. Refresh the selected Store before setting up a catalog.",
        );
        return;
      }
      const [configurationResult, catalogsResult] = await Promise.all([
        organizationPoyntOperationalApi.configurations(
          org,
          catalogSetupContext.integrationConfigurationId,
        ),
        organizationProductApi.catalogs(org),
      ]);
      const verifiedConfiguration = configurationResult.success
        ? configurationResult.data.find(
            (configuration) =>
              configuration.storeId === catalogSetupContext.storeId &&
              configuration.effectiveCatalogId?.trim() ===
                catalogSetupContext.externalCatalogId,
          )
        : null;
      const refreshedLinkExists = catalogsResult.success
        ? catalogsResult.data.some(
            (item) =>
              item.integrationConfigurationId ===
                catalogSetupContext.integrationConfigurationId &&
              item.externalCatalogId === catalogSetupContext.externalCatalogId,
          )
        : true;
      if (!verifiedConfiguration || refreshedLinkExists) {
        setError(
          "This Store catalog configuration changed or is already linked. Refresh the selected Store before setting up a catalog.",
        );
        return;
      }
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
      integrationConfigurationId: catalogSetupContext
        ? catalogSetupContext.integrationConfigurationId
        : catalog.source === "INTEGRATION"
          ? catalog.integrationConfigurationId
          : null,
      externalCatalogId: catalogSetupContext
        ? catalogSetupContext.externalCatalogId
        : catalog.source === "INTEGRATION"
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
    setCatalogSetupContext(null);
    setCatalogManualOnly(false);
    setCatalog(emptyCatalog);
    await load();
  };
  const openCatalog = (
    selected?: OrganizationProductCatalog,
    manualOnly = false,
  ) => {
    setError(undefined);
    setCatalogSetupContext(null);
    setCatalogManualOnly(manualOnly);
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
  const openStoreCatalogSetup = () => {
    if (
      !selectedMaintenanceContext ||
      !canSetUpStoreCatalog ||
      !selectedMaintenanceContext.integrationConfigurationId ||
      !selectedMaintenanceContext.externalCatalogId
    ) {
      return;
    }
    setError(undefined);
    setCatalogEditing(null);
    setCatalogSetupContext(selectedMaintenanceContext);
    setCatalogManualOnly(false);
    setCatalog({
      catalogName:
        selectedMaintenanceContext.externalCatalogName?.trim() ||
        selectedMaintenanceContext.integrationName?.trim() ||
        "Memgine Product Catalog",
      source: "INTEGRATION",
      integrationConfigurationId:
        selectedMaintenanceContext.integrationConfigurationId,
      externalCatalogId: selectedMaintenanceContext.externalCatalogId,
      active: true,
    });
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
        <Text variant="h1">Products & Catalogs</Text>
        <Text color="textMuted">
          View and maintain configured catalogs by Store. Changing this
          maintenance context never changes the operational Product Catalog
          selection in Integrations.
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
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: theme.spacing.md,
          }}
        >
          <View style={{ flexGrow: 1, minWidth: 220 }}>
            <ReferenceSelect
              label="Memgine Store"
              value={selectedStoreId}
              items={stores}
              getItemId={(store) => store.id}
              renderItemLabel={(store) => store.name}
              onChange={selectStore}
              placeholder="Select a Memgine Store"
            />
          </View>
          <View style={{ flexGrow: 1, minWidth: 260 }}>
            <ReferenceSelect
              label="Catalog Configuration"
              value={selectedMaintenanceContextKey}
              items={maintenanceContexts}
              getItemId={(context) => context.key}
              renderItemLabel={(context) =>
                `${context.integrationName ?? context.catalogName ?? "Catalog configuration"} — ${context.externalCatalogName ?? context.catalogName ?? "Catalog unavailable"}`
              }
              onChange={selectMaintenanceContext}
              placeholder={
                maintenanceLoading
                  ? "Loading configured catalogs…"
                  : "Select a catalog configuration"
              }
              disabled={!selectedStoreId || maintenanceLoading}
            />
          </View>
        </View>
        {manualCatalogs.length ? (
          <View style={{ gap: theme.spacing.xs }}>
            <ReferenceSelect
              label="Manual Catalog (organization-wide)"
              value={selectedManualCatalogId}
              items={manualCatalogs}
              getItemId={(catalog) => catalog.productCatalogId}
              renderItemLabel={(catalog) => catalog.catalogName}
              onChange={selectManualCatalog}
              placeholder="Select a manual catalog"
              allowClear
            />
            <Text color="textMuted">
              Manual catalogs are maintained independently and are not attached
              to this Store or a Poynt catalog.
            </Text>
          </View>
        ) : null}
        {maintenanceError ? (
          <Text color="danger">{maintenanceError}</Text>
        ) : null}
        {selectedMaintenanceContext ? (
          <View style={{ gap: theme.spacing.xs }}>
            <Text variant="bodyStrong">
              {selectedMaintenanceContext.catalogName ??
                selectedMaintenanceContext.externalCatalogName ??
                "Unlinked catalog configuration"}
            </Text>
            <Text color="textMuted">
              {selectedMaintenanceContext.provider ?? "Provider"} ·{" "}
              {selectedMaintenanceContext.integrationName ?? "No integration"}
            </Text>
            <Text color="textMuted">
              Poynt Catalog:{" "}
              {selectedMaintenanceContext.externalCatalogName?.trim() ||
                selectedMaintenanceContext.catalogName ||
                "Not available"}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                showCatalogTechnicalDetails
                  ? "Hide Store and catalog technical details"
                  : "Show Store and catalog technical details"
              }
              onPress={() => setShowCatalogTechnicalDetails((value) => !value)}
              style={{
                alignSelf: "flex-start",
                paddingVertical: theme.spacing.xs,
              }}
            >
              <Text color="textMuted">
                {showCatalogTechnicalDetails
                  ? "Hide technical details ▲"
                  : "Technical details ▼"}
              </Text>
            </Pressable>
            {showCatalogTechnicalDetails ? (
              <View
                style={{
                  gap: theme.spacing.xs,
                  padding: theme.spacing.sm,
                  backgroundColor: theme.colors.surfaceAlt,
                  borderRadius: theme.radius.sm,
                }}
              >
                <Text color="textMuted">Store ID: {selectedStoreId}</Text>
                <Text color="textMuted">
                  Store Code:{" "}
                  {stores.find((item) => item.id === selectedStoreId)
                    ?.storeCode ?? "—"}
                </Text>
                <Text color="textMuted">
                  External Catalog ID:{" "}
                  {selectedMaintenanceContext.externalCatalogId ??
                    "Not configured"}
                </Text>
                <Text color="textMuted">
                  Integration ID:{" "}
                  {selectedMaintenanceContext.integrationConfigurationId ??
                    "Not configured"}
                </Text>
                <Text color="textMuted">
                  Memgine Catalog ID:{" "}
                  {selectedMaintenanceContext.productCatalogId ??
                    "Not configured"}
                </Text>
              </View>
            ) : null}
            {runtimeCatalogIntegrationId && runtimeExternalCatalogId ? (
              runtimeCatalogIntegrationId ===
                selectedMaintenanceContext.integrationConfigurationId &&
              runtimeExternalCatalogId ===
                selectedMaintenanceContext.externalCatalogId ? (
                <View style={{ gap: theme.spacing.xs }}>
                  <Text variant="bodyStrong">Selected for Store</Text>
                  <Text color="textMuted">
                    This catalog is selected for this Store in Integrations.
                  </Text>
                </View>
              ) : (
                <View style={{ gap: theme.spacing.xs }}>
                  <Text variant="bodyStrong">Not selected for Store</Text>
                  <Text color="textMuted">
                    This Store has selected{" "}
                    {runtimeCatalogName || "another catalog"} in Integrations.
                    You can maintain this catalog here without changing that
                    selection.
                  </Text>
                  <Text color="textMuted">
                    To change the Store selection, go to Integrations → Store
                    Capability Configuration.
                  </Text>
                </View>
              )
            ) : (
              <Text color="textMuted">
                No catalog selected for Store in Integrations.
              </Text>
            )}
            {selectedMaintenanceContext.reason ? (
              <Text
                color={
                  selectedMaintenanceContext.available ? "textMuted" : "danger"
                }
              >
                {selectedMaintenanceContext.reason}
              </Text>
            ) : null}
          </View>
        ) : selectedManualCatalogId ? (
          <Text color="textMuted">
            Manual catalog selected. It is organization-scoped and does not
            configure this Store’s POS catalog.
          </Text>
        ) : selectedStoreId && !maintenanceLoading ? (
          <Text color="textMuted">
            {maintenanceContexts.length
              ? "Select a catalog configuration. An unambiguous context is selected automatically; otherwise no catalog is assumed."
              : "No product catalog configured for this Store. Configure one in Integrations → Manage Store Terminals."}
          </Text>
        ) : null}
      </View>
      <View
        style={{
          flexDirection: "row",
          gap: theme.spacing.sm,
          flexWrap: "wrap",
        }}
      >
        {(
          ["PRODUCTS", "CATEGORIES", "MAPPINGS", "SYNCHRONIZATION"] as const
        ).map((section) => (
          <Button
            key={section}
            label={section[0] + section.slice(1).toLowerCase()}
            size="sm"
            variant={activeSection === section ? "primary" : "outline"}
            onPress={() => setActiveSection(section)}
          />
        ))}
      </View>
      {activeSection === "PRODUCTS" ? (
        <>
          <View
            style={{
              flexDirection: "row",
              gap: theme.spacing.sm,
              flexWrap: "wrap",
            }}
          >
            <Button
              label="Add Product"
              disabled={!catalogId || !hasProductMaintenanceContext}
              onPress={() => {
                setEditing(null);
                setProduct(emptyProduct);
                setShowProduct(true);
              }}
            />
            <Button
              label="Resync Catalog"
              variant="outline"
              disabled={
                maintenanceLoading ||
                previewLoading ||
                applyingPreview ||
                !selectedMaintenanceContext?.canSynchronize ||
                !catalogId ||
                Boolean(posPreview)
              }
              onPress={() => {
                setActiveSection("SYNCHRONIZATION");
                setError(undefined);
                setSuccessMessage(undefined);
                setSelectedSyncIntegrationId(
                  selectedMaintenanceContext?.integrationConfigurationId ?? "",
                );
                setSelectedSyncStoreId(selectedStoreId || null);
                setShowPosSync(true);
              }}
            />
            <Button
              label="Upload Excel"
              variant="outline"
              disabled={!catalogId || !hasProductMaintenanceContext}
              onPress={() => setShowImport(true)}
            />
            {activeCatalog ? (
              <Button
                label="Edit Catalog"
                size="sm"
                variant="outline"
                disabled={!hasProductMaintenanceContext}
                onPress={() => openCatalog(activeCatalog)}
              />
            ) : null}
            {canSetUpStoreCatalog ? (
              <Button
                label="Set Up Memgine Catalog"
                size="sm"
                variant="outline"
                onPress={openStoreCatalogSetup}
              />
            ) : null}
            <Button
              label="Add Manual Catalog"
              size="sm"
              variant="outline"
              onPress={() => openCatalog(undefined, true)}
            />
            <Button
              label="Download Template"
              variant="outline"
              onPress={downloadImportTemplate}
            />
          </View>
          <View style={{ gap: theme.spacing.sm }}>
            <Text color="textMuted">
              {scopedProductsLoading
                ? "Loading selected catalog…"
                : `Showing ${catalogProducts.length} Products in the selected catalog.`}
              Expand a Product to view its details and available actions.
            </Text>
            <View
              style={{
                flexDirection: "row",
                paddingHorizontal: theme.spacing.sm,
                paddingVertical: theme.spacing.xs,
                borderBottomWidth: 1,
                borderColor: theme.colors.border,
                gap: theme.spacing.sm,
              }}
            >
              <Text variant="bodyStrong" style={{ flex: 3 }}>
                Product
              </Text>
              <Text variant="bodyStrong" style={{ flex: 2 }}>
                Category
              </Text>
              <Text variant="bodyStrong" style={{ flex: 2 }}>
                Price
              </Text>
              <Text variant="bodyStrong" style={{ flex: 2 }}>
                Mapping
              </Text>
              <Text variant="bodyStrong" style={{ width: 24 }}>
                {" "}
              </Text>
            </View>
            {catalogProducts.length ? (
              catalogProducts.map((p) => {
                const health = mappingHealth(p);
                const canFix = canFixOrganizationScopeMapping(p);
                const expanded = expandedProductDetailsId === p.productId;
                return (
                  <View
                    key={p.productId}
                    style={{
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      borderRadius: theme.radius.sm,
                      overflow: "hidden",
                    }}
                  >
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${expanded ? "Collapse" : "Expand"} details for ${p.productName}`}
                      accessibilityState={{ expanded }}
                      onPress={() =>
                        setExpandedProductDetailsId(
                          expanded ? null : p.productId,
                        )
                      }
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: theme.spacing.sm,
                        padding: theme.spacing.sm,
                      }}
                    >
                      <View style={{ flex: 3, minWidth: 0 }}>
                        <Text variant="bodyStrong">
                          {selectedSnapshotForProduct(p)?.productName ??
                            p.productName}
                        </Text>
                        <Text color="textMuted">
                          {selectedSnapshotForProduct(p)?.externalSku ??
                            p.sku ??
                            p.productCode ??
                            "No SKU"}
                        </Text>
                      </View>
                      <View style={{ flex: 2, minWidth: 0 }}>
                        <Text>{productCategoryLabel(p)}</Text>
                      </View>
                      <View style={{ flex: 2, minWidth: 0 }}>
                        <Text>
                          {selectedSnapshotForProduct(p)
                            ? `${selectedSnapshotForProduct(p)!.currencyCode} ${(selectedSnapshotForProduct(p)!.unitPriceMinorSnapshot / 100).toFixed(2)}`
                            : p.basePriceMinor != null
                              ? `${p.currencyCode ?? ""} ${(p.basePriceMinor / 100).toFixed(2)}`
                              : "—"}
                        </Text>
                      </View>
                      <View style={{ flex: 2, minWidth: 0 }}>
                        <Text
                          variant={
                            health.label === "Needs attention"
                              ? "bodyStrong"
                              : "body"
                          }
                          color={
                            health.label === "Needs attention"
                              ? "danger"
                              : "text"
                          }
                        >
                          {health.label}
                        </Text>
                      </View>
                      <Text
                        color="textMuted"
                        style={{ width: 24, textAlign: "center" }}
                      >
                        {expanded ? "−" : "+"}
                      </Text>
                    </Pressable>
                    {expanded ? (
                      <View
                        style={{
                          gap: theme.spacing.sm,
                          padding: theme.spacing.md,
                          backgroundColor: theme.colors.surfaceAlt,
                          borderTopWidth: 1,
                          borderColor: theme.colors.border,
                        }}
                      >
                        <Text variant="bodyStrong">Product details</Text>
                        <Text>Category: {productCategoryLabel(p)}</Text>
                        <Text>Catalog: {p.catalogName || "—"}</Text>
                        <Text>Product code: {p.productCode || "—"}</Text>
                        <Text>SKU: {p.sku || "—"}</Text>
                        <Text>Mapping: {health.label}</Text>
                        {health.detail ? (
                          <Text color="textMuted">{health.detail}</Text>
                        ) : null}
                        <View
                          style={{
                            flexDirection: "row",
                            flexWrap: "wrap",
                            gap: theme.spacing.sm,
                          }}
                        >
                          <Button
                            label="Edit Product"
                            size="sm"
                            variant="outline"
                            onPress={() => {
                              setEditing(p);
                              setProduct({
                                ...p,
                                basePriceMinor: String(p.basePriceMinor ?? ""),
                                externalProductId:
                                  p.externalProductIds?.split(", ")[0] ?? "",
                              });
                              setShowProduct(true);
                            }}
                          />
                          {canFix ? (
                            <Button
                              label="Fix mapping"
                              size="sm"
                              variant="outline"
                              onPress={() => openMappingFix(p)}
                            />
                          ) : null}
                        </View>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() =>
                            setExpandedProductTechnicalId((current) =>
                              current === p.productId ? null : p.productId,
                            )
                          }
                          style={{
                            paddingVertical: theme.spacing.xs,
                            alignSelf: "flex-start",
                          }}
                        >
                          <Text color="textMuted">
                            {expandedProductTechnicalId === p.productId
                              ? "Hide technical details ▲"
                              : "Technical details ▼"}
                          </Text>
                        </Pressable>
                        {expandedProductTechnicalId === p.productId ? (
                          <View style={{ gap: theme.spacing.xs }}>
                            <Text color="textMuted">
                              Canonical Product ID: {p.productId}
                            </Text>
                            <Text color="textMuted">
                              External Product IDs:{" "}
                              {p.externalProductIds || "—"}
                            </Text>
                            <Text color="textMuted">
                              Canonical Catalog ID: {p.productCatalogId}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                );
              })
            ) : (
              <Text color="textMuted">
                {catalogId
                  ? "No products are associated with this canonical catalog."
                  : "Select a linked canonical catalog to view products."}
              </Text>
            )}
          </View>
        </>
      ) : null}
      {activeSection === "CATEGORIES" ? (
        <View
          style={{
            gap: theme.spacing.sm,
            padding: theme.spacing.md,
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.md,
          }}
        >
          <Text variant="bodyStrong">Canonical categories</Text>
          {canonicalCategories.length ? (
            canonicalCategories.map((category) => (
              <Text key={category.id}>
                {category.name} · {category.id}
              </Text>
            ))
          ) : (
            <Text color="textMuted">
              No canonical category data is available for this catalog.
            </Text>
          )}
          <Text color="textMuted">
            External Poynt category correspondences are managed from a
            synchronization preview because the existing API exposes external
            categories only in that verified preview.
          </Text>
          <Button
            label="Open synchronization"
            size="sm"
            variant="outline"
            disabled={!selectedMaintenanceContext?.canSynchronize}
            onPress={() => setActiveSection("SYNCHRONIZATION")}
          />
        </View>
      ) : null}
      {activeSection === "MAPPINGS" ? (
        <View
          style={{
            gap: theme.spacing.sm,
            padding: theme.spacing.md,
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.md,
          }}
        >
          <Text variant="bodyStrong">Product mappings</Text>
          <Input
            label="Search mappings"
            value={mappingSearch}
            onChangeText={setMappingSearch}
            placeholder="Product name, category or SKU"
          />
          <Text color="textMuted">
            Showing {filteredCatalogMappings.length} of {catalogMappings.length}{" "}
            mappings for the selected Store and integration.
          </Text>
          <Text color="textMuted">
            Store-specific Poynt Product mappings. Technical identifiers are
            available under Details when needed for reconciliation.
          </Text>
          <View
            style={{
              flexDirection: "row",
              gap: theme.spacing.sm,
              padding: theme.spacing.sm,
              borderBottomWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <Text variant="bodyStrong" style={{ flex: 3 }}>
              Product
            </Text>
            <Text variant="bodyStrong" style={{ flex: 2 }}>
              Category
            </Text>
            <Text variant="bodyStrong" style={{ flex: 2 }}>
              SKU
            </Text>
            <Text variant="bodyStrong" style={{ flex: 2 }}>
              POS Catalog
            </Text>
            <Text variant="bodyStrong" style={{ flex: 2 }}>
              Status
            </Text>
            <Text variant="bodyStrong" style={{ width: 38 }}>
              Link
            </Text>
            <Text variant="bodyStrong" style={{ width: 28 }}>
              {" "}
            </Text>
          </View>
          {filteredCatalogMappings.length ? (
            filteredCatalogMappings.map((mapping) => {
              const canonical = mapping.productId
                ? productNameById.get(mapping.productId)
                : undefined;
              const isExpanded = expandedMappingDetailsId === mapping.mappingId;
              return (
                <View
                  key={mapping.mappingId}
                  style={{
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    borderRadius: theme.radius.sm,
                    overflow: "hidden",
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: theme.spacing.sm,
                      padding: theme.spacing.sm,
                    }}
                  >
                    <Text style={{ flex: 3 }} variant="bodyStrong">
                      {canonical?.productName ||
                        (mapping.productId
                          ? "Linked Memgine Product"
                          : "Unlinked Product")}
                    </Text>
                    <Text style={{ flex: 2 }}>
                      {mapping.snapshot?.categoryMetadataAvailable
                        ? mapping.snapshot.externalCategories
                            ?.map((c) => c.categoryName || c.externalCategoryId)
                            .join(", ") || "Uncategorized"
                        : "Category unavailable"}
                    </Text>
                    <Text style={{ flex: 2 }}>
                      {mapping.externalSku || canonical?.sku || "—"}
                    </Text>
                    <Text style={{ flex: 2 }}>
                      {externalCatalogLabel(mapping)}
                    </Text>
                    <Text
                      style={{ flex: 2 }}
                      color={
                        !mapping.active || !mapping.productId
                          ? "danger"
                          : "text"
                      }
                    >
                      {!mapping.active
                        ? "Inactive"
                        : mapping.productId
                          ? "Linked to Business System"
                          : "Not linked"}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Link or change Product for ${canonical?.productName || mapping.externalSku || "POS item"}`}
                      disabled={!mapping.active || !mapping.storeId}
                      onPress={() => openManualRelink(mapping)}
                      style={{
                        width: 38,
                        minHeight: 40,
                        justifyContent: "center",
                        alignItems: "center",
                        opacity: mapping.active && mapping.storeId ? 1 : 0.35,
                      }}
                    >
                      <Text color="primary" style={{ fontSize: 21 }}>
                        ↗
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={
                        isExpanded
                          ? "Hide mapping details"
                          : "Show mapping details"
                      }
                      accessibilityState={{ expanded: isExpanded }}
                      onPress={() =>
                        setExpandedMappingDetailsId(
                          isExpanded ? null : mapping.mappingId,
                        )
                      }
                      style={{
                        width: 28,
                        minHeight: 40,
                        justifyContent: "center",
                        alignItems: "center",
                      }}
                    >
                      <Text color="textMuted">{isExpanded ? "−" : "+"}</Text>
                    </Pressable>
                  </View>
                  {isExpanded ? (
                    <View
                      style={{
                        gap: theme.spacing.xs,
                        padding: theme.spacing.md,
                        backgroundColor: theme.colors.surfaceAlt,
                        borderTopWidth: 1,
                        borderColor: theme.colors.border,
                      }}
                    >
                      <Text variant="bodyStrong">
                        External Product Link details
                      </Text>
                      <Text>
                        Product:{" "}
                        {canonical?.productName ||
                          (mapping.productId
                            ? "Linked Memgine Product (other catalog)"
                            : "Not linked to a Memgine Product")}
                      </Text>
                      <Text>
                        Store:{" "}
                        {stores.find((store) => store.id === mapping.storeId)
                          ?.name || "Store unavailable"}
                      </Text>
                      <Text>POS catalog: {externalCatalogLabel(mapping)}</Text>
                      <Text>SKU: {mapping.externalSku || "—"}</Text>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() =>
                          setExpandedMappingTechnicalId((current) =>
                            current === mapping.mappingId
                              ? null
                              : mapping.mappingId,
                          )
                        }
                        style={{
                          alignSelf: "flex-start",
                          paddingVertical: theme.spacing.xs,
                        }}
                      >
                        <Text color="textMuted">
                          {expandedMappingTechnicalId === mapping.mappingId
                            ? "Hide technical details ▲"
                            : "Technical details ▼"}
                        </Text>
                      </Pressable>
                      {expandedMappingTechnicalId === mapping.mappingId ? (
                        <View style={{ gap: theme.spacing.xs }}>
                          <Text color="textMuted">
                            Canonical Product ID: {mapping.productId || "—"}
                          </Text>
                          <Text color="textMuted">
                            Mapping ID: {mapping.mappingId}
                          </Text>
                          <Text color="textMuted">
                            External Product ID:{" "}
                            {mapping.externalProductId || "—"}
                          </Text>
                          <Text color="textMuted">
                            External Catalog ID:{" "}
                            {mappingExternalCatalogId(mapping) || "—"}
                          </Text>
                          <Text color="textMuted">
                            Integration ID: {mapping.integrationConfigurationId}
                          </Text>
                          <Text color="textMuted">
                            Store ID: {mapping.storeId || "—"}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              );
            })
          ) : (
            <Text color="textMuted">
              No mappings match this Store, catalog and search.
            </Text>
          )}
        </View>
      ) : null}
      <Modal
        visible={relinkMapping !== null}
        onClose={() => {
          if (!relinkBusy) setRelinkMapping(null);
        }}
        title="Link to Existing Memgine Product"
        scrollable
      >
        <View style={{ gap: theme.spacing.md }}>
          <Text color="textMuted">
            Only this Store-specific Poynt mapping will be reassigned. Existing
            Products, Benefits, Offers, and historical transactions will not be
            merged.
          </Text>
          {relinkMapping ? (
            <View
              style={{
                gap: theme.spacing.xs,
                padding: theme.spacing.md,
                borderRadius: theme.radius.md,
                backgroundColor: theme.colors.surfaceAlt,
              }}
            >
              <Text variant="bodyStrong">
                {(relinkMapping.productId
                  ? productNameById.get(relinkMapping.productId)?.productName
                  : undefined) ??
                  (relinkMapping.productId
                    ? "Linked Memgine Product (other catalog)"
                    : "Unlinked Product")}
              </Text>
              <Text color="textMuted">
                Currently linked ·{" "}
                {relinkMapping.externalSku
                  ? `SKU ${relinkMapping.externalSku}`
                  : "No SKU"}
              </Text>
              <Text color="textMuted">
                Store:{" "}
                {stores.find((item) => item.id === relinkMapping.storeId)
                  ?.name ?? "Store name unavailable"}
              </Text>
              <Text color="textMuted">
                POS Catalog: {externalCatalogLabel(relinkMapping)}
              </Text>
            </View>
          ) : null}
          <Text color="textMuted">
            Choose a Product from the eligible results below. Products with the
            same name in different catalogs remain separate until you explicitly
            select one.
          </Text>
          <Input
            label="Search existing Memgine Products"
            value={relinkSearch}
            onChangeText={(value) => {
              setRelinkSearch(value);
              setRelinkCandidates([]);
              setRelinkTargetId("");
              setRelinkPreview(null);
            }}
            placeholder="Search by Product name or SKU"
          />
          <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled>
            {relinkCandidatesLoading ? (
              <Text color="textMuted">Loading eligible Products…</Text>
            ) : null}
            {relinkCandidatesError ? (
              <Text color="danger">{relinkCandidatesError}</Text>
            ) : null}
            {!relinkCandidatesLoading &&
            !relinkCandidatesError &&
            relinkCandidates.length === 0 ? (
              <Text color="textMuted">No eligible Products found.</Text>
            ) : null}
            {relinkCandidates.map((item) => (
              <Pressable
                key={item.productId}
                onPress={() => {
                  setRelinkTargetId(item.productId);
                  setRelinkPreview(null);
                  setRelinkError(undefined);
                }}
                style={{
                  padding: theme.spacing.sm,
                  backgroundColor:
                    relinkTargetId === item.productId
                      ? theme.colors.surfaceAlt
                      : "transparent",
                }}
              >
                <Text variant="bodyStrong">
                  {item.productName} (
                  {item.categoryName?.trim() || "Uncategorized"})
                </Text>
                <Text color="textMuted">
                  Catalog: {item.catalogName || "Not specified"} · SKU:{" "}
                  {item.sku || "—"}
                </Text>
                <Text color="textMuted">
                  {item.basePriceMinor == null
                    ? "Price unavailable"
                    : `${item.currencyCode || ""} ${(item.basePriceMinor / 100).toFixed(2)}`}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          <Button
            label="Preview mapping change"
            variant="outline"
            disabled={
              !relinkTargetId ||
              relinkBusy ||
              relinkCandidatesLoading ||
              Boolean(relinkCandidatesError) ||
              !relinkCandidates.some(
                (item) => item.productId === relinkTargetId,
              )
            }
            onPress={() => void previewManualRelink()}
          />
          {relinkPreview ? (
            <View
              style={{
                gap: theme.spacing.sm,
                padding: theme.spacing.md,
                borderWidth: 1,
                borderColor: theme.colors.border,
                borderRadius: theme.radius.md,
              }}
            >
              <Text variant="bodyStrong">Review linking change</Text>
              <Text>Current Product: {relinkPreview.currentProductName}</Text>
              <Text>New linked Product: {relinkPreview.targetProductName}</Text>
              {relinkPreview.alreadyLinked ? (
                <Text color="textMuted">
                  This POS item is already linked to the selected Product.
                </Text>
              ) : (
                <Text color="textMuted">
                  Only this POS item’s Product link will change. No Products are
                  merged.
                </Text>
              )}
              {relinkPreview.pendingCatalogPreviewCount > 0 ? (
                <Text color="danger">
                  {relinkPreview.pendingCatalogPreviewCount} pending catalog
                  preview(s) may require regeneration.
                </Text>
              ) : null}
              {relinkPreview.warning ? (
                <Text color="textMuted">{relinkPreview.warning}</Text>
              ) : null}
            </View>
          ) : null}
          <Pressable
            accessibilityRole="button"
            onPress={() => setShowRelinkTechnicalDetails((value) => !value)}
            style={{
              alignSelf: "flex-start",
              paddingVertical: theme.spacing.xs,
            }}
          >
            <Text color="textMuted">
              {showRelinkTechnicalDetails
                ? "▾ Hide technical details"
                : "▸ Technical details"}
            </Text>
          </Pressable>
          {showRelinkTechnicalDetails && relinkMapping ? (
            <View
              style={{
                gap: theme.spacing.xs,
                backgroundColor: theme.colors.surfaceAlt,
                padding: theme.spacing.md,
                borderRadius: theme.radius.md,
              }}
            >
              <Text color="textMuted">Organization ID: {org}</Text>
              <Text color="textMuted">
                External Product ID: {relinkMapping.externalProductId}
              </Text>
              <Text color="textMuted">
                Mapping ID: {relinkMapping.mappingId}
              </Text>
              <Text color="textMuted">
                Canonical Product ID: {relinkMapping.productId ?? "—"}
              </Text>
              <Text color="textMuted">
                Store ID: {relinkMapping.storeId ?? "—"}
              </Text>
              <Text color="textMuted">
                Integration ID: {relinkMapping.integrationConfigurationId}
              </Text>
              <Text color="textMuted">
                External Catalog ID:{" "}
                {mappingExternalCatalogId(relinkMapping) ?? "—"}
              </Text>
              {relinkPreview ? (
                <>
                  <Text color="textMuted">
                    Previous Product ID: {relinkPreview.currentProductId}
                  </Text>
                  <Text color="textMuted">
                    Selected Product ID: {relinkPreview.targetProductId}
                  </Text>
                  <Text color="textMuted">
                    Preview Catalog ID: {relinkPreview.externalCatalogId}
                  </Text>
                </>
              ) : null}
              {relinkCandidates.find(
                (item) => item.productId === relinkTargetId,
              ) ? (
                <Text color="textMuted">
                  Selected Product code:{" "}
                  {relinkCandidates.find(
                    (item) => item.productId === relinkTargetId,
                  )?.productCode ?? "—"}
                </Text>
              ) : null}
            </View>
          ) : null}
          <Input
            label="Reason for reconciliation"
            value={relinkReason}
            onChangeText={setRelinkReason}
            placeholder="Confirmed identical product across stores"
          />
          {relinkError ? <Text color="danger">{relinkError}</Text> : null}
          <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
            <Button
              label="Cancel"
              variant="outline"
              disabled={relinkBusy}
              onPress={() => setRelinkMapping(null)}
            />
            <Button
              label="Confirm Link"
              disabled={
                relinkBusy ||
                !relinkPreview ||
                relinkPreview.alreadyLinked ||
                relinkPreview.targetProductId !== relinkTargetId ||
                !relinkReason.trim() ||
                relinkReason.length > 500
              }
              onPress={() => void confirmManualRelink()}
            />
          </View>
        </View>
      </Modal>
      {activeSection === "SYNCHRONIZATION" ? (
        <View
          style={{
            gap: theme.spacing.sm,
            padding: theme.spacing.md,
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.md,
          }}
        >
          <Text variant="bodyStrong">Synchronization</Text>
          <Text color="textMuted">
            Preview and apply are locked to the selected Store, integration, and
            canonical catalog. Opening this section does not fetch or apply
            changes.
          </Text>
          <Button
            label="Sync from POS"
            variant="outline"
            disabled={!selectedMaintenanceContext?.canSynchronize || !catalogId}
            onPress={() => {
              setError(undefined);
              setSuccessMessage(undefined);
              setSelectedSyncIntegrationId(
                selectedMaintenanceContext?.integrationConfigurationId ?? "",
              );
              setSelectedSyncStoreId(selectedStoreId || null);
              setShowPosSync(true);
            }}
          />
          {!selectedMaintenanceContext?.canSynchronize ? (
            <Text color="textMuted">
              Synchronization is unavailable until this Store configuration has
              one verified external catalog and an exact canonical catalog
              association.
            </Text>
          ) : null}
        </View>
      ) : null}
      <Modal
        visible={showPosSync}
        onClose={resetPosSync}
        title="Sync from POS"
        scrollable
      >
        <View style={{ gap: theme.spacing.md }}>
          <Text color="textMuted">
            Fetch a read-only preview from a POS integration. The selected
            canonical catalog remains the destination; membership and
            subscription products are never imported here.
          </Text>
          <View style={{ gap: theme.spacing.xs }}>
            <Text variant="bodyStrong">Canonical catalog</Text>
            <Text>{activeCatalog?.catalogName ?? "No catalog selected"}</Text>
          </View>
          <View style={{ gap: theme.spacing.sm }}>
            <Text variant="bodyStrong">Locked maintenance context</Text>
            <Text>
              {selectedMaintenanceContext?.integrationName ??
                "Integration unavailable"}
            </Text>
            <Text color="textMuted">
              Store:{" "}
              {stores.find((store) => store.id === selectedStoreId)?.name ??
                selectedStoreId}
              {selectedMaintenanceContext?.externalCatalogId
                ? ` · Poynt Catalog: ${selectedMaintenanceContext.externalCatalogName?.trim() || selectedMaintenanceContext.externalCatalogId}`
                : ""}
            </Text>
          </View>
          <Text color="textMuted">
            The server verifies this selected integration and Store context.
            Change the maintenance context before opening a different preview.
          </Text>
          <View
            style={{
              flexDirection: "row",
              gap: theme.spacing.sm,
              flexWrap: "wrap",
            }}
          >
            <Button label="Cancel" variant="outline" onPress={resetPosSync} />
            <Button
              label={previewLoading ? "Fetching preview…" : "Fetch & Preview"}
              disabled={
                previewLoading ||
                !selectedMaintenanceContext?.canSynchronize ||
                !catalogId
              }
              onPress={() => void fetchPosPreview()}
            />
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
        scrollable={false}
      >
        {posPreview ? (
          <View
            style={{
              height: viewportHeight * 0.86,
              maxHeight: viewportHeight * 0.9,
              minHeight: 0,
              flexShrink: 1,
              position: "relative",
            }}
          >
            <ScrollView
              ref={previewListRef}
              style={{
                flex: 1,
                minHeight: 0,
                ...(Platform.OS === "web"
                  ? ({ overflowY: "auto" } as any)
                  : {}),
              }}
              contentContainerStyle={{
                gap: theme.spacing.md,
                paddingBottom: theme.spacing.xl,
              }}
              showsVerticalScrollIndicator
              onScroll={(event) =>
                setPreviewListScrolled(event.nativeEvent.contentOffset.y > 40)
              }
              scrollEventThrottle={16}
            >
              <View style={{ gap: theme.spacing.md }}>
                <View style={{ gap: theme.spacing.xs }}>
                  <Text variant="bodyStrong">
                    {activeCatalog?.catalogName ?? posPreview.productCatalogId}
                  </Text>
                  <Text color="textMuted">
                    Integration:{" "}
                    {integrations.find(
                      (item) =>
                        item.id === posPreview.integrationConfigurationId,
                    )?.integrationName ?? posPreview.integrationConfigurationId}
                  </Text>
                  <Text color="textMuted">
                    Scope: {posPreview.storeId ?? "Organization-wide"}
                  </Text>
                  <Text color="textMuted">
                    Preview status: {posPreview.status}. It expires after 30
                    minutes; generate a fresh preview if apply reports expiry.
                  </Text>
                </View>
                {!posPreview.fullCatalogComplete ? (
                  <View
                    style={{
                      gap: theme.spacing.xs,
                      padding: theme.spacing.sm,
                      borderWidth: 1,
                      borderColor: theme.colors.danger,
                      borderRadius: theme.radius.md,
                    }}
                  >
                    <Text color="danger" variant="bodyStrong">
                      Incomplete provider catalog
                    </Text>
                    <Text color="textMuted">
                      The provider did not return a complete catalog. Missing
                      records are not treated as absent and this preview cannot
                      safely apply changes.
                    </Text>
                  </View>
                ) : null}
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: theme.spacing.sm,
                  }}
                >
                  {(
                    [
                      "NEW",
                      "MATCHED",
                      "UPDATE",
                      "UNCHANGED",
                      "INACTIVE",
                      "MISSING",
                      "CONFLICT",
                      "INVALID",
                    ] as const
                  ).map((action) => (
                    <Text
                      key={action}
                      color={
                        action === "CONFLICT" || action === "INVALID"
                          ? "danger"
                          : "textMuted"
                      }
                    >
                      {action}: {summaryValue(action)}
                    </Text>
                  ))}
                </View>
                {blockingPreviewRows.length > 0 ? (
                  <View
                    style={{
                      gap: theme.spacing.xs,
                      padding: theme.spacing.md,
                      borderWidth: 1,
                      borderColor: theme.colors.danger,
                      borderRadius: theme.radius.md,
                    }}
                  >
                    <Text color="danger" variant="bodyStrong">
                      {blockingPreviewRows.length} blocking record
                      {blockingPreviewRows.length === 1 ? "" : "s"}
                    </Text>
                    <Text color="textMuted">
                      P3 applies approved previews atomically. No valid rows
                      will be imported until every conflict and invalid record
                      is resolved and a fresh preview is generated. Partial
                      import is unavailable.
                    </Text>
                  </View>
                ) : null}
                <View
                  style={{
                    gap: theme.spacing.sm,
                    paddingBottom: theme.spacing.sm,
                    borderBottomWidth: 1,
                    borderColor: theme.colors.border,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      gap: theme.spacing.sm,
                      flexWrap: "wrap",
                    }}
                  >
                    <Button
                      label="Category correspondences"
                      variant="outline"
                      onPress={() => void openCategoryCorrespondences()}
                    />
                    <Button
                      label="Generate fresh preview"
                      variant="outline"
                      onPress={() => {
                        setPosPreview(null);
                        setShowPosSync(true);
                      }}
                    />
                    <Button
                      label="Review changes"
                      disabled={previewExpired}
                      onPress={() => setShowReviewChanges(true)}
                    />
                  </View>
                  <Input
                    label="Search preview"
                    value={previewSearch}
                    onChangeText={setPreviewSearch}
                    placeholder="Name, SKU, external ID, canonical ID, reason"
                  />
                  {/* W229: Status overview keeps hidden rows discoverable. */}
                  <View
                    style={{
                      flexDirection: "row",
                      gap: theme.spacing.sm,
                      flexWrap: "wrap",
                    }}
                  >
                    {(
                      [
                        { label: "New", action: "NEW" },
                        { label: "Updates", action: "UPDATE" },
                        { label: "Unchanged", action: "UNCHANGED" },
                      ] as const
                    ).map((item) => (
                      <Pressable
                        key={item.action}
                        accessibilityRole="button"
                        accessibilityLabel={`Show ${item.label.toLowerCase()} records`}
                        onPress={() => setPreviewAction(item.action)}
                        style={{
                          flexGrow: 1,
                          flexBasis: 110,
                          minWidth: 110,
                          gap: theme.spacing.xs,
                          padding: theme.spacing.md,
                          borderWidth: 1,
                          borderColor: theme.colors.border,
                          borderRadius: theme.radius.md,
                        }}
                      >
                        <Text color="textMuted">{item.label}</Text>
                        <Text variant="bodyStrong">
                          {posPreview?.summary[item.action] ?? 0}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <Text variant="bodyStrong">Display records</Text>
                  <View style={{ gap: theme.spacing.xs }}>
                    {(
                      [
                        {
                          action: "CHANGES",
                          label:
                            "Changes & items requiring attention (default)",
                        },
                        { action: "ALL", label: "All records" },
                        { action: "UNCHANGED", label: "Unchanged only" },
                        { action: "MATCHED", label: "Matched only" },
                      ] as const
                    ).map((item) => (
                      <Pressable
                        key={item.action}
                        accessibilityRole="radio"
                        accessibilityState={{
                          checked: previewAction === item.action,
                        }}
                        onPress={() => setPreviewAction(item.action)}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: theme.spacing.sm,
                          paddingVertical: theme.spacing.xs,
                        }}
                      >
                        <Text
                          color={
                            previewAction === item.action
                              ? "primary"
                              : "textMuted"
                          }
                        >
                          {previewAction === item.action ? "◉" : "○"}
                        </Text>
                        <Text
                          color={
                            previewAction === item.action ? "text" : "textMuted"
                          }
                        >
                          {item.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <Text color="textMuted">Filter by status</Text>
                  <View
                    style={{
                      flexDirection: "row",
                      flexWrap: "wrap",
                      gap: theme.spacing.xs,
                    }}
                  >
                    {[
                      "NEW",
                      "UPDATE",
                      "INACTIVE",
                      "MISSING",
                      "CONFLICT",
                      "INVALID",
                    ].map((action) => (
                      <Button
                        key={action}
                        label={action}
                        size="sm"
                        variant={
                          previewAction === action ? "primary" : "outline"
                        }
                        onPress={() => setPreviewAction(action)}
                      />
                    ))}
                  </View>
                </View>
                <View
                  style={{
                    gap: theme.spacing.sm,
                    paddingVertical: theme.spacing.xs,
                  }}
                >
                  {filteredPreviewRows.length === 0 ? (
                    <Text color="textMuted">
                      No products match the selected display filter and search.
                    </Text>
                  ) : null}
                  {filteredPreviewRows.map((row) => (
                    <View
                      key={row.rowId}
                      style={{
                        gap: theme.spacing.xs,
                        padding: theme.spacing.md,
                        borderWidth: 1,
                        borderColor:
                          row.action === "CONFLICT" || row.action === "INVALID"
                            ? theme.colors.danger
                            : theme.colors.border,
                        borderRadius: theme.radius.md,
                      }}
                    >
                      <Text
                        variant="bodyStrong"
                        color={
                          row.action === "CONFLICT" || row.action === "INVALID"
                            ? "danger"
                            : "text"
                        }
                      >
                        {row.action} · {row.productName}
                      </Text>
                      <Text color="textMuted">
                        {row.externalSku ? `SKU: ${row.externalSku} · ` : ""}
                        {formatMinor(row.unitPriceMinor, row.currencyCode)}
                      </Text>
                      <Text color="textMuted">{previewCategoryLabel(row)}</Text>
                      {row.action === "UPDATE" ? (
                        <Text color="textMuted">
                          {previewChangeSummary(row)}
                        </Text>
                      ) : row.reason ? (
                        <Text color="textMuted">{row.reason}</Text>
                      ) : null}
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => setPreviewDetailsRow(row)}
                        style={{
                          alignSelf: "flex-start",
                          paddingVertical: theme.spacing.xs,
                        }}
                      >
                        <Text color="primary">
                          › View changes and technical details
                        </Text>
                      </Pressable>
                      {row.hasDependentBusinessRules ? (
                        <Text color="danger">
                          Dependent business rules require review.
                        </Text>
                      ) : null}
                      {row.action === "CONFLICT" && row.externalSku ? (
                        <Button
                          label="Resolve"
                          size="sm"
                          variant="outline"
                          onPress={() => openPreviewResolution(row)}
                        />
                      ) : null}
                    </View>
                  ))}
                </View>
                {applyUncertain ? (
                  <Text color="danger">
                    The server did not confirm apply. Do not create a new
                    preview; retry uses the same approval key.
                  </Text>
                ) : null}
                {previewExpired ? (
                  <Text color="danger">
                    This preview is no longer valid. Generate a fresh preview
                    before applying any changes.
                  </Text>
                ) : null}
                <View
                  style={{
                    flexDirection: "row",
                    gap: theme.spacing.sm,
                    flexWrap: "wrap",
                    paddingTop: theme.spacing.sm,
                    borderTopWidth: 1,
                    borderColor: theme.colors.border,
                  }}
                >
                  <Button
                    label="Close"
                    variant="outline"
                    onPress={() => setPosPreview(null)}
                  />
                </View>
              </View>
            </ScrollView>
            {previewListScrolled ? (
              <View
                style={{
                  position: "absolute",
                  right: theme.spacing.sm,
                  bottom: theme.spacing.sm,
                }}
              >
                <Button
                  label="Back to top"
                  size="sm"
                  variant="primary"
                  onPress={() => {
                    previewListRef.current?.scrollTo({ y: 0, animated: true });
                    setPreviewListScrolled(false);
                  }}
                />
              </View>
            ) : null}
          </View>
        ) : null}
      </Modal>
      <Modal
        visible={showCategoryCorrespondences}
        onClose={() => setShowCategoryCorrespondences(false)}
        title="Verified Poynt category correspondences"
        scrollable
      >
        <View style={{ gap: theme.spacing.md }}>
          <Text color="textMuted">
            Approve each correspondence explicitly. Category names are
            informational; the saved IDs control reconciliation. Saving or
            deactivating one invalidates the current preview.
          </Text>
          {availableExternalCategories.map((external) => {
            const existing = categoryCorrespondences.find(
              (item) => item.externalCategoryId === external.externalCategoryId,
            );
            const canonical = canonicalCategories.find(
              (item) => item.id === existing?.productCatalogCategoryId,
            );
            return (
              <Pressable
                key={external.externalCategoryId}
                onPress={() => {
                  setSelectedExternalCategory(external);
                  setSelectedCanonicalCategoryId(
                    existing?.productCatalogCategoryId ?? "",
                  );
                }}
                style={{
                  padding: theme.spacing.sm,
                  borderWidth: 1,
                  borderColor:
                    selectedExternalCategory?.externalCategoryId ===
                    external.externalCategoryId
                      ? theme.colors.primary
                      : theme.colors.border,
                  borderRadius: theme.radius.md,
                }}
              >
                <Text variant="bodyStrong">
                  {external.categoryName ?? "Unnamed Poynt category"}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    setExpandedCategoryTechnicalId((current) =>
                      current === external.externalCategoryId
                        ? null
                        : external.externalCategoryId,
                    )
                  }
                  style={{
                    alignSelf: "flex-start",
                    paddingVertical: theme.spacing.xs,
                  }}
                >
                  <Text color="textMuted">
                    {expandedCategoryTechnicalId === external.externalCategoryId
                      ? "▾ Hide technical details"
                      : "▸ Technical details"}
                  </Text>
                </Pressable>
                {expandedCategoryTechnicalId === external.externalCategoryId ? (
                  <View style={{ gap: theme.spacing.xs }}>
                    <Text color="textMuted">
                      Poynt Category ID: {external.externalCategoryId}
                    </Text>
                    {external.parentExternalCategoryId ? (
                      <Text color="textMuted">
                        Parent Category ID: {external.parentExternalCategoryId}
                      </Text>
                    ) : null}
                    {existing ? (
                      <Text color="textMuted">
                        Memgine Category ID: {existing.productCatalogCategoryId}
                      </Text>
                    ) : null}
                  </View>
                ) : null}
                <Text color={existing ? "text" : "textMuted"}>
                  {existing
                    ? `Approved → ${canonical?.name ?? "Category name unavailable"}`
                    : "No approved correspondence"}
                </Text>
                {existing ? (
                  <Button
                    label="Deactivate"
                    size="sm"
                    variant="outline"
                    onPress={() => setCorrespondenceToDeactivate(existing)}
                  />
                ) : null}
              </Pressable>
            );
          })}
          {!availableExternalCategories.length ? (
            <Text color="textMuted">
              No Poynt categories are available in this preview. Configure the
              provider catalog ID and generate a fresh preview.
            </Text>
          ) : null}
          {selectedExternalCategory ? (
            <View
              style={{
                gap: theme.spacing.sm,
                borderTopWidth: 1,
                borderColor: theme.colors.border,
                paddingTop: theme.spacing.md,
              }}
            >
              <Text variant="bodyStrong">
                Approve correspondence for{" "}
                {selectedExternalCategory.categoryName ??
                  selectedExternalCategory.externalCategoryId}
              </Text>
              <Text color="textMuted">
                Poynt category ID: {selectedExternalCategory.externalCategoryId}
              </Text>
              {canonicalCategories.map((category) => (
                <Pressable
                  key={category.id}
                  onPress={() => setSelectedCanonicalCategoryId(category.id)}
                  style={{
                    padding: theme.spacing.sm,
                    borderWidth: 1,
                    borderColor:
                      selectedCanonicalCategoryId === category.id
                        ? theme.colors.primary
                        : theme.colors.border,
                    borderRadius: theme.radius.md,
                  }}
                >
                  <Text>
                    {selectedCanonicalCategoryId === category.id ? "●" : "○"}{" "}
                    {category.name} · {category.id}
                  </Text>
                </Pressable>
              ))}
              <Button
                label={
                  savingCategoryCorrespondence
                    ? "Saving…"
                    : "Confirm verified correspondence"
                }
                disabled={
                  !selectedCanonicalCategoryId || savingCategoryCorrespondence
                }
                onPress={() => void saveCategoryCorrespondence()}
              />
            </View>
          ) : null}
          <View
            style={{
              flexDirection: "row",
              gap: theme.spacing.sm,
              flexWrap: "wrap",
            }}
          >
            <Button
              label="Close"
              variant="outline"
              onPress={() => setShowCategoryCorrespondences(false)}
            />
            <Button
              label="Generate fresh preview"
              variant="outline"
              onPress={() => {
                setShowCategoryCorrespondences(false);
                setShowPosSync(true);
              }}
            />
          </View>
        </View>
      </Modal>
      <Modal
        visible={correspondenceToDeactivate !== null}
        onClose={() => setCorrespondenceToDeactivate(null)}
        title="Deactivate category correspondence"
      >
        <View style={{ gap: theme.spacing.md }}>
          <Text>
            Deactivate this approved correspondence? It will not change products
            or mappings, but a fresh preview is required.
          </Text>
          <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
            <Button
              label="Cancel"
              variant="outline"
              onPress={() => setCorrespondenceToDeactivate(null)}
            />
            <Button
              label="Deactivate"
              onPress={() =>
                correspondenceToDeactivate &&
                void deactivateCategoryCorrespondence(
                  correspondenceToDeactivate,
                )
              }
            />
          </View>
        </View>
      </Modal>
      <Modal
        visible={resolvingPreviewRow !== null}
        onClose={() => {
          setResolvingPreviewRow(null);
          setSelectedCanonicalProductId("");
        }}
        title="Resolve catalog conflict"
        scrollable
      >
        {resolvingPreviewRow ? (
          <View style={{ gap: theme.spacing.md }}>
            <Text variant="bodyStrong">{resolvingPreviewRow.productName}</Text>
            <Text color="textMuted">
              External SKU: {resolvingPreviewRow.externalSku ?? "Not provided"}
            </Text>
            <Text color="textMuted">
              Poynt categories:{" "}
              {resolvingPreviewRow.externalCategories?.length
                ? resolvingPreviewRow.externalCategories
                    .map(
                      (category) =>
                        `${category.categoryName ?? "Unnamed"} (${category.externalCategoryId})`,
                    )
                    .join(", ")
                : resolvingPreviewRow.categoryMetadataAvailable
                  ? "Uncategorized"
                  : "Metadata unavailable"}
            </Text>
            <Text color="textMuted">
              Select the existing canonical product. This creates no mapping
              until the separate atomic preview apply.
            </Text>
            {resolutionCandidates.map((product) => (
              <Pressable
                key={product.productId}
                onPress={() => setSelectedCanonicalProductId(product.productId)}
                style={{
                  padding: theme.spacing.sm,
                  borderWidth: 1,
                  borderColor:
                    selectedCanonicalProductId === product.productId
                      ? theme.colors.primary
                      : theme.colors.border,
                  borderRadius: theme.radius.md,
                }}
              >
                <Text variant="bodyStrong">
                  {selectedCanonicalProductId === product.productId ? "●" : "○"}{" "}
                  {product.productName}
                </Text>
                <Text color="textMuted">
                  {product.productId} · {product.categoryName ?? "No category"}{" "}
                  · SKU {product.sku ?? "—"}
                </Text>
                <Text color="textMuted">
                  {product.basePriceMinor != null
                    ? formatMinor(
                        product.basePriceMinor,
                        product.currencyCode ?? "",
                      )
                    : "No canonical price"}
                </Text>
              </Pressable>
            ))}
            {!resolutionCandidates.length ? (
              <Text color="danger">
                No eligible same-catalog SKU candidates are available. Correct
                the canonical catalog or source data, then create a fresh
                preview.
              </Text>
            ) : null}
            <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
              <Button
                label="Cancel"
                variant="outline"
                onPress={() => setResolvingPreviewRow(null)}
              />
              <Button
                label={savingResolution ? "Saving…" : "Confirm selection"}
                disabled={!selectedCanonicalProductId || savingResolution}
                onPress={() => void resolvePreviewRow()}
              />
            </View>
          </View>
        ) : null}
      </Modal>
      <Modal
        visible={previewDetailsRow !== null}
        onClose={() => setPreviewDetailsRow(null)}
        title={
          previewDetailsRow
            ? `${previewDetailsRow.productName} — details`
            : "Product details"
        }
        scrollable
      >
        {previewDetailsRow ? (
          <View
            style={{ gap: theme.spacing.md, paddingBottom: theme.spacing.md }}
          >
            <Text variant="bodyStrong">
              {previewDetailsRow.action} · {previewDetailsRow.productName}
            </Text>
            <Text color="textMuted">
              {previewDetailsRow.action === "NEW"
                ? "New POS Product. No existing Memgine snapshot is available for comparison."
                : previewDetailsRow.action === "MATCHED"
                  ? "Existing canonical Memgine Product selected for this external Product."
                  : previewDetailsRow.action === "UNCHANGED"
                    ? "Product attributes match the stored snapshot."
                    : previewDetailsRow.action === "UPDATE"
                      ? "Comparison of the stored Memgine snapshot and incoming POS values. Changed fields are highlighted."
                      : (previewDetailsRow.reason ??
                        "Review the classification and technical details below.")}
            </Text>
            {previewDetailsRow.action === "UPDATE" &&
            previewAttributeRows(previewDetailsRow) ? (
              <View style={{ gap: theme.spacing.sm }}>
                <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyStrong">Current Memgine</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyStrong">Incoming Poynt</Text>
                  </View>
                </View>
                {previewAttributeRows(previewDetailsRow)!.map((field) => (
                  <View
                    key={field.label}
                    style={{
                      gap: theme.spacing.xs,
                      paddingVertical: theme.spacing.xs,
                      borderBottomWidth: 1,
                      borderColor: theme.colors.border,
                    }}
                  >
                    <Text
                      variant="bodyStrong"
                      color={field.changed ? "primary" : "textMuted"}
                    >
                      {field.label}
                      {field.changed ? " · Changed" : ""}
                    </Text>
                    <View
                      style={{ flexDirection: "row", gap: theme.spacing.sm }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text color="textMuted">{field.before}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text>{field.after}</Text>
                      </View>
                    </View>
                  </View>
                ))}
                {previewDetailsRow.action === "UPDATE" &&
                !previewAttributeRows(previewDetailsRow)!.some(
                  (field) => field.changed,
                ) ? (
                  <Text color="textMuted">
                    No differences appear in the attributes supplied by the API.
                    The UPDATE classification may depend on other mapping or
                    sync data; no specific business-field change can be
                    confirmed here.
                  </Text>
                ) : null}
              </View>
            ) : previewDetailsRow.action === "UPDATE" ? (
              <Text color="textMuted">
                Previous and incoming Product attributes are unavailable. The
                specific reason for this UPDATE cannot be confirmed from the
                available data.
              </Text>
            ) : null}
            <View
              style={{
                gap: theme.spacing.xs,
                paddingTop: theme.spacing.sm,
                borderTopWidth: 1,
                borderColor: theme.colors.border,
              }}
            >
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  setShowPreviewTechnicalDetails((value) => !value)
                }
                style={{
                  alignSelf: "flex-start",
                  paddingVertical: theme.spacing.xs,
                }}
              >
                <Text color="textMuted">
                  {showPreviewTechnicalDetails
                    ? "▾ Hide technical details"
                    : "▸ Technical details"}
                </Text>
              </Pressable>
              {showPreviewTechnicalDetails ? (
                <View style={{ gap: theme.spacing.xs }}>
                  {(
                    [
                      ["Poynt Product ID", previewDetailsRow.externalProductId],
                      ["Poynt Variant ID", previewDetailsRow.externalVariantId],
                      [
                        "Canonical Memgine Product ID",
                        previewDetailsRow.canonicalProductId,
                      ],
                      ["Existing mapping ID", previewDetailsRow.mappingId],
                      ["Preview row ID", previewDetailsRow.rowId],
                      ["Store ID", posPreview?.storeId],
                      [
                        "Integration ID",
                        posPreview?.integrationConfigurationId,
                      ],
                      ["Catalog ID", posPreview?.productCatalogId],
                      [
                        "Provider categories",
                        previewDetailsRow.externalCategories
                          ?.map(
                            (category) =>
                              `${category.categoryName ?? "Unnamed"} (${category.externalCategoryId})`,
                          )
                          .join(", "),
                      ],
                      ["Classification reason", previewDetailsRow.reason],
                      [
                        "Previous source timestamp",
                        previewDetailsRow.previousAttributes?.sourceUpdatedAt,
                      ],
                      [
                        "Incoming source timestamp",
                        previewDetailsRow.proposedAttributes?.sourceUpdatedAt,
                      ],
                      [
                        "Eligible to apply",
                        previewDetailsRow.eligibleForApply ? "Yes" : "No",
                      ],
                    ] as Array<[string, string | null | undefined]>
                  ).map(([label, value]) => (
                    <View key={label} style={{ gap: 2 }}>
                      <Text color="textMuted">{label}</Text>
                      <Text>{value || "—"}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
            <Button
              label="Close details"
              variant="outline"
              onPress={() => setPreviewDetailsRow(null)}
            />
          </View>
        ) : null}
      </Modal>
      <Modal
        visible={showReviewChanges}
        onClose={() => setShowReviewChanges(false)}
        title="Review POS synchronization changes"
        scrollable={false}
      >
        {posPreview ? (
          <View
            style={{
              height: viewportHeight * 0.86,
              maxHeight: viewportHeight * 0.9,
              minHeight: 0,
              flexShrink: 1,
            }}
          >
            <ScrollView
              style={{
                flex: 1,
                minHeight: 0,
                ...(Platform.OS === "web"
                  ? ({ overflowY: "auto" } as any)
                  : {}),
              }}
              contentContainerStyle={{
                gap: theme.spacing.md,
                paddingBottom: theme.spacing.md,
              }}
              showsVerticalScrollIndicator
            >
              <View style={{ gap: theme.spacing.md }}>
                <Text color="textMuted">
                  Review every proposed mapping before approval. Apply remains
                  atomic and is unavailable while conflicts or invalid records
                  remain.
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: theme.spacing.sm,
                  }}
                >
                  {(
                    [
                      "NEW",
                      "MATCHED",
                      "UPDATE",
                      "UNCHANGED",
                      "INACTIVE",
                      "MISSING",
                      "CONFLICT",
                      "INVALID",
                    ] as const
                  ).map((action) => (
                    <Text
                      key={action}
                      color={
                        action === "CONFLICT" || action === "INVALID"
                          ? "danger"
                          : "textMuted"
                      }
                    >
                      {action}: {summaryValue(action)}
                    </Text>
                  ))}
                </View>
                {posPreview.rows.map((row) => (
                  <View
                    key={row.rowId}
                    style={{
                      gap: theme.spacing.xs,
                      padding: theme.spacing.sm,
                      borderWidth: 1,
                      borderColor:
                        row.action === "CONFLICT" || row.action === "INVALID"
                          ? theme.colors.danger
                          : theme.colors.border,
                      borderRadius: theme.radius.md,
                    }}
                  >
                    <Text variant="bodyStrong">
                      {row.action} · {row.productName}
                    </Text>
                    <Text color="textMuted">
                      {row.externalSku ? `SKU: ${row.externalSku} · ` : ""}
                      {formatMinor(row.unitPriceMinor, row.currencyCode)}
                    </Text>
                    <Text color="textMuted">{previewCategoryLabel(row)}</Text>
                    {row.action === "UPDATE" ? (
                      <Text color="textMuted">{previewChangeSummary(row)}</Text>
                    ) : row.reason ? (
                      <Text color="textMuted">{row.reason}</Text>
                    ) : null}
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setPreviewDetailsRow(row)}
                      style={{
                        alignSelf: "flex-start",
                        paddingVertical: theme.spacing.xs,
                      }}
                    >
                      <Text color="primary">
                        › View changes and technical details
                      </Text>
                    </Pressable>
                    {row.hasDependentBusinessRules ? (
                      <Text color="danger">
                        Dependent business-rule warning.
                      </Text>
                    ) : null}
                    {row.action === "CONFLICT" && row.externalSku ? (
                      <Button
                        label="Inspect / resolve"
                        size="sm"
                        variant="outline"
                        onPress={() => {
                          setShowReviewChanges(false);
                          openPreviewResolution(row);
                        }}
                      />
                    ) : null}
                  </View>
                ))}
              </View>
            </ScrollView>
            <View
              style={{
                flexDirection: "row",
                gap: theme.spacing.sm,
                flexWrap: "wrap",
                paddingTop: theme.spacing.md,
                borderTopWidth: 1,
                borderColor: theme.colors.border,
              }}
            >
              <Button
                label="Close"
                variant="outline"
                onPress={() => setShowReviewChanges(false)}
              />
              <Button
                label="Approve and continue"
                disabled={
                  blockingPreviewRows.length > 0 ||
                  !posPreview.fullCatalogComplete ||
                  previewExpired ||
                  applyingPreview
                }
                onPress={() => {
                  setShowReviewChanges(false);
                  setShowApplyConfirmation(true);
                }}
              />
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
          <Text variant="bodyStrong">
            Apply this approved preview to the selected canonical catalog?
          </Text>
          <Text color="textMuted">
            Apply is all-or-nothing. The server rejects the entire preview if it
            has expired, changed, or contains blocking records. No partial
            import will occur.
          </Text>
          <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
            <Button
              label="Cancel"
              variant="outline"
              onPress={() => setShowApplyConfirmation(false)}
            />
            <Button
              label={applyingPreview ? "Applying…" : "Confirm apply"}
              disabled={applyingPreview}
              onPress={() => void applyPosPreview()}
            />
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
                        {mapping.externalSku || "POS Product (SKU unavailable)"}
                        {recommended ? "  Recommended" : ""}
                      </Text>
                      {showMappingFixTechnicalDetails ? (
                        <View style={{ gap: theme.spacing.xs }}>
                          <Text color="textMuted">
                            External Product ID: {mapping.externalProductId}
                          </Text>
                          <Text color="textMuted">
                            Mapping ID: {mapping.mappingId}
                          </Text>
                        </View>
                      ) : null}
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
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  setShowMappingFixTechnicalDetails((value) => !value)
                }
                style={{
                  alignSelf: "flex-start",
                  paddingVertical: theme.spacing.xs,
                }}
              >
                <Text color="textMuted">
                  {showMappingFixTechnicalDetails
                    ? "▾ Hide technical details"
                    : "▸ Technical details"}
                </Text>
              </Pressable>
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
        onClose={() => {
          setShowCatalog(false);
          setCatalogSetupContext(null);
          setCatalogManualOnly(false);
        }}
        title={
          catalogSetupContext
            ? "Set Up Memgine Catalog"
            : catalogEditing
              ? "Edit Catalog"
              : "Add Manual Catalog"
        }
        scrollable
      >
        <View style={{ gap: theme.spacing.md }}>
          {catalogSetupContext ? (
            <View style={{ gap: theme.spacing.xs }}>
              <Text color="textMuted">
                Store:{" "}
                {stores.find(
                  (store) => store.id === catalogSetupContext.storeId,
                )?.name ?? catalogSetupContext.storeId}
              </Text>
              <Text color="textMuted">
                Integration: {catalogSetupContext.integrationName ?? "Poynt"}
              </Text>
              <Text color="textMuted">
                Verified Poynt catalog:{" "}
                {catalogSetupContext.externalCatalogName ??
                  catalogSetupContext.externalCatalogId}
              </Text>
              <Text color="textMuted">
                The verified integration and external catalog identities are
                fixed for this setup.
              </Text>
            </View>
          ) : null}
          <Input
            label="Catalog Name"
            required
            value={catalog.catalogName ?? ""}
            onChangeText={(value) =>
              setCatalog((current: any) => ({ ...current, catalogName: value }))
            }
          />
          {!catalogSetupContext && !catalogManualOnly ? (
            <>
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
                              catalog.integrationConfigurationId ===
                              integration.id
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
                            APP_ROUTES.orgAdmin.settings.integrations(
                              org,
                            ) as never,
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
                            APP_ROUTES.orgAdmin.settings.integrations(
                              org,
                            ) as never,
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
            </>
          ) : null}
          {!catalogSetupContext && !catalogManualOnly ? (
            <Checkbox
              label="Active"
              value={catalog.active !== false}
              onValueChange={(active) =>
                setCatalog((current: any) => ({ ...current, active }))
              }
            />
          ) : null}
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
