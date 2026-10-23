package com.mynikatech.memgine.component.commerce

import com.mynikatech.memgine.component.product.OrganizationProductSql
import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.exception.ConflictException
import com.mynikatech.memgine.exception.NotFoundException
import com.mynikatech.memgine.net.dto.CommerceCatalogSyncApplyRequestDto
import com.mynikatech.memgine.net.dto.CommerceCatalogSyncApplyResultDto
import com.mynikatech.memgine.net.dto.CommerceCatalogSyncPreviewRequestDto
import com.mynikatech.memgine.net.dto.CommerceCatalogSyncManualResolutionRequestDto
import com.mynikatech.memgine.net.dto.CommerceCatalogSyncPreviewDto
import com.mynikatech.memgine.net.dto.CommerceCatalogSyncPreviewRowDto
import com.mynikatech.memgine.net.dto.CommerceCatalogSyncAttributesDto
import com.mynikatech.memgine.net.dto.CommerceCatalogCategoryCorrespondenceDto
import com.mynikatech.memgine.net.dto.CommerceCatalogCategoryCorrespondenceWriteDto
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.jdbi.v3.core.Jdbi
import org.jdbi.v3.sqlobject.customizer.Bind
import org.jdbi.v3.sqlobject.statement.SqlQuery
import org.postgresql.util.PSQLException

class CommerceCatalogSyncService(
    private val jdbi: Jdbi,
    private val providers: CommerceProviderRegistry,
    private val reconciliation: CommerceCatalogReconciliationService = CommerceCatalogReconciliationService()
) {
    private val json = Json { encodeDefaults = true }

    fun preview(
        organizationId: String,
        integrationConfigurationId: String,
        request: CommerceCatalogSyncPreviewRequestDto,
        actorUserId: String
    ): CommerceCatalogSyncPreviewDto = translate {
        requireId(organizationId); requireId(integrationConfigurationId); requireId(request.productCatalogId)
        val storeId = request.storeId?.trim()?.takeIf { it.isNotEmpty() }
        val commerce = jdbi.onDemand(CommerceSql::class.java)
        if (!jdbi.withHandle<Boolean, Exception> { handle ->
            handle.createQuery("SELECT can_administer_organization(:organizationId,:actorUserId)")
                .bind("organizationId", organizationId)
                .bind("actorUserId", actorUserId)
                .mapTo(Boolean::class.java)
                .one()
        }) {
            throw com.mynikatech.memgine.exception.ForbiddenException("Organization access denied")
        }
        val integration = commerce.integrations(organizationId, actorUserId)
            .firstOrNull { it.integrationConfigurationId == integrationConfigurationId }
            ?: throw NotFoundException("Commerce integration was not found")
        val provider = providers.catalogProvider(integration.providerCode)
            ?: throw BadRequestException("Commerce catalog provider is not available")
        val productSql = jdbi.onDemand(OrganizationProductSql::class.java)
        val catalog = productSql.catalogs(organizationId, actorUserId)
            .firstOrNull { it.productCatalogId == request.productCatalogId }
            ?: throw NotFoundException("Product catalog was not found")
        val fetched = provider.syncCatalog(
            CommerceCatalogSyncRequest(
                organizationId = organizationId,
                integrationConfigurationId = integrationConfigurationId,
                storeId = storeId,
                incremental = false,
                externalCatalogId = catalog.externalCatalogId,
                actorUserId = actorUserId
            )
        )
        if (fetched.size > MAX_PREVIEW_ROWS) throw BadRequestException("Catalog exceeds the maximum preview size")
        if (fetched.any { it.integrationConfigurationId != integrationConfigurationId || it.storeId != storeId }) {
            throw BadRequestException("Catalog provider returned a mismatched integration or store scope")
        }
        // Reconciliation candidates are deliberately limited to the selected
        // canonical catalog. A SKU in another catalog must never influence a
        // POS mapping decision for this preview.
        val products = productSql.products(organizationId, null, actorUserId)
            .asSequence()
            .filter { it.productCatalogId == request.productCatalogId }
            .map {
                CommerceCatalogCanonicalProduct(
                    it.productId,
                    it.organizationId,
                    it.sku,
                    it.active,
                    it.versionNo,
                    it.productCatalogCategoryId,
                    it.categoryName,
                    it.productName,
                    it.basePriceMinor,
                    it.currencyCode
                )
            }
            .toList()
        val mappings = commerce.mappings(organizationId, actorUserId)
        val snapshots = commerce.snapshots(organizationId, actorUserId)
        val plan = reconciliation.plan(
            CommerceCatalogReconciliationInput(
                organizationId = organizationId,
                integrationConfigurationId = integrationConfigurationId,
                storeId = storeId,
                fullCatalogComplete = true,
                snapshots = fetched,
                canonicalProducts = products,
                mappings = mappings,
                previousSnapshots = snapshots,
                dependentProductIds = dependentProductIds(organizationId),
                categoryCorrespondences = jdbi.onDemand(CommerceCatalogCategoryCorrespondenceSql::class.java).list(
                    organizationId, integrationConfigurationId, request.productCatalogId, actorUserId
                ).map { CommerceCatalogCategoryCorrespondence(it.externalCategoryId, it.productCatalogCategoryId) }
            )
        )
        val stageRows = plan.rows.mapIndexed { index, row ->
            CatalogSyncStageRow(index + 1, row, mappings, products)
        }
        val previewId = jdbi.onDemand(CommerceCatalogSyncSql::class.java).createPreview(
            organizationId, integrationConfigurationId, request.productCatalogId, storeId,
            json.encodeToString(stageRows), actorUserId
        )
        previewDto(previewId, organizationId, integrationConfigurationId, request.productCatalogId, storeId, plan, stageRows)
    }

    fun apply(
        organizationId: String,
        previewId: String,
        request: CommerceCatalogSyncApplyRequestDto,
        actorUserId: String
    ): CommerceCatalogSyncApplyResultDto = translate {
        if (!request.approved) throw BadRequestException("Explicit preview approval is required")
        requireId(organizationId); requireId(previewId)
        val key = request.idempotencyKey.trim()
        if (key.isEmpty() || key.length > 160) throw BadRequestException("A valid idempotency key is required")
        val result = jdbi.onDemand(CommerceCatalogSyncSql::class.java)
            .applyPreview(organizationId, previewId, key, actorUserId)
        val created = result.substringAfter("\"createdCount\":", "0").takeWhile(Char::isDigit).toIntOrNull() ?: 0
        val applied = result.substringAfter("\"appliedCount\":", "0").takeWhile(Char::isDigit).toIntOrNull() ?: 0
        val mapped = result.substringAfter("\"mappedCount\":", "0").takeWhile(Char::isDigit).toIntOrNull() ?: 0
        CommerceCatalogSyncApplyResultDto(previewId, "APPLIED", created, applied, mapped)
    }

    fun resolve(
        organizationId: String,
        previewId: String,
        rowId: String,
        request: CommerceCatalogSyncManualResolutionRequestDto,
        actorUserId: String
    ): Boolean = translate {
        requireId(organizationId); requireId(previewId); requireId(request.canonicalProductId)
        val rowNumber = rowId.substringAfterLast(':', "").toIntOrNull()
            ?: throw BadRequestException("Invalid preview row")
        jdbi.onDemand(CommerceCatalogSyncSql::class.java).resolvePreviewRow(
            organizationId, previewId, rowNumber, request.canonicalProductId,
            request.expectedCanonicalProductVersionNo, actorUserId
        )
    }

    fun categoryCorrespondences(organizationId: String, integrationId: String, catalogId: String, actorUserId: String) = translate {
        jdbi.onDemand(CommerceCatalogCategoryCorrespondenceSql::class.java).list(organizationId, integrationId, catalogId, actorUserId)
            .map { CommerceCatalogCategoryCorrespondenceDto(it.correspondenceId, it.externalCategoryId, it.productCatalogCategoryId, it.versionNo) }
    }

    fun saveCategoryCorrespondence(organizationId: String, integrationId: String, catalogId: String, request: CommerceCatalogCategoryCorrespondenceWriteDto, actorUserId: String) = translate {
        requireId(request.externalCategoryId); requireId(request.productCatalogCategoryId)
        jdbi.onDemand(CommerceCatalogCategoryCorrespondenceSql::class.java).save(organizationId, integrationId, catalogId,
            request.externalCategoryId, request.externalCategoryName, request.externalParentCategoryId,
            request.productCatalogCategoryId, request.versionNo, actorUserId)
    }

    fun deactivateCategoryCorrespondence(organizationId: String, correspondenceId: String, versionNo: Int, actorUserId: String) = translate {
        jdbi.onDemand(CommerceCatalogCategoryCorrespondenceSql::class.java)
            .deactivate(organizationId, correspondenceId, versionNo, actorUserId)
    }

    private fun dependentProductIds(organizationId: String): Set<String> = jdbi.withHandle<Set<String>, Exception> { handle ->
        handle.createQuery(
            """
            SELECT DISTINCT mapping.product_id
              FROM commerce_product_mappings mapping
              JOIN commerce_adjustment_product_mappings adjustment_mapping
                ON adjustment_mapping.commerce_product_mapping_id = mapping.commerce_product_mapping_id
               AND NOT adjustment_mapping.is_deleted
             WHERE mapping.organization_id = :organizationId
               AND mapping.product_id IS NOT NULL
               AND NOT mapping.is_deleted
            UNION
            SELECT product_id
              FROM benefit_product
             WHERE organization_id = :organizationId
               AND is_active
               AND NOT is_deleted
            UNION
            SELECT product_id
              FROM offer_product
             WHERE organization_id = :organizationId
               AND is_active
               AND NOT is_deleted
            """.trimIndent()
        ).bind("organizationId", organizationId)
            .mapTo(String::class.java)
            .list()
            .toSet()
    }
    private fun previewDto(
        previewId: String, organizationId: String, integrationId: String, catalogId: String, storeId: String?,
        plan: CommerceCatalogReconciliationPlan, rows: List<CatalogSyncStageRow>
    ) = CommerceCatalogSyncPreviewDto(
        previewId, organizationId, integrationId, catalogId, storeId, "READY", plan.fullCatalogComplete,
        rows.map { it.toDto(previewId) },
        rows.groupingBy { it.action }.eachCount()
    )

    private fun requireId(value: String) {
        if (value.isBlank() || value.length > 64) throw BadRequestException("Invalid identifier")
    }

    private fun <T> translate(block: () -> T): T = try { block() } catch (error: Exception) {
        var cause: Throwable? = error
        while (cause != null) {
            if (cause is PSQLException) when (cause.sqlState) {
                "23505", "40001" -> throw ConflictException("Catalog synchronization data changed; refresh and retry")
                "22023" -> if (cause.message?.contains("Catalog preview has expired") == true) {
                    throw ConflictException("Catalog preview has expired; generate a new preview")
                } else {
                    throw BadRequestException("Catalog synchronization request is invalid")
                }
                "22001", "23502", "23503", "23514" -> throw BadRequestException("Catalog synchronization request is invalid")
            }
            cause = cause.cause
        }
        throw error
    }

    private companion object { const val MAX_PREVIEW_ROWS = 2000 }
}

@kotlinx.serialization.Serializable
private data class CatalogSyncStageRow(
    val rowNumber: Int,
    val externalProductId: String,
    val externalVariantId: String? = null,
    val externalSku: String? = null,
    val productName: String,
    val description: String? = null,
    val currencyCode: String,
    val unitPriceMinor: Long,
    val active: Boolean,
    val sourceUpdatedAt: String? = null,
    val canonicalProductId: String? = null,
    val canonicalProductVersionNo: Int? = null,
    val mappingId: String? = null,
    val mappingVersionNo: Int? = null,
    val action: String,
    val reason: String? = null,
    val hasDependentBusinessRules: Boolean = false,
    val eligibleForApply: Boolean = false,
    val previousAttributes: CommerceCatalogSyncAttributesDto? = null,
    val proposedAttributes: CommerceCatalogSyncAttributesDto? = null
    , val externalCategories: List<com.mynikatech.memgine.net.dto.CommerceExternalCategoryReferenceDto> = emptyList(),
    val categoryMetadataAvailable: Boolean = false
) {
    constructor(index: Int, row: CommerceCatalogReconciliationRow, mappings: List<CommerceProductMappingRow>, products: List<CommerceCatalogCanonicalProduct>) : this(
        index, row.externalProductId, row.externalVariantId, row.externalSku,
        row.proposedAttributes?.productName ?: row.previousAttributes?.productName ?: row.externalProductId,
        row.proposedAttributes?.description, row.proposedAttributes?.currencyCode ?: row.previousAttributes?.currencyCode ?: "CAD",
        row.proposedAttributes?.unitPriceMinor ?: row.previousAttributes?.unitPriceMinor ?: 0L,
        row.proposedAttributes?.active ?: false, row.proposedAttributes?.sourceUpdatedAt,
        row.canonicalProductId,
        row.canonicalProductId?.let { productId -> products.firstOrNull { it.productId == productId } }?.versionNo,
        mappings.firstOrNull { it.integrationConfigurationId == row.integrationConfigurationId && it.storeId == row.storeId && it.externalProductId == row.externalProductId && it.externalVariantId == row.externalVariantId }?.mappingId,
        mappings.firstOrNull { it.integrationConfigurationId == row.integrationConfigurationId && it.storeId == row.storeId && it.externalProductId == row.externalProductId && it.externalVariantId == row.externalVariantId }?.versionNo,
        row.action.name, row.reason, row.hasDependentBusinessRules,
        row.action in setOf(CommerceCatalogReconciliationAction.NEW, CommerceCatalogReconciliationAction.MATCHED, CommerceCatalogReconciliationAction.UPDATE, CommerceCatalogReconciliationAction.UNCHANGED),
        row.previousAttributes?.let(::attributesDto),
        row.proposedAttributes?.let(::attributesDto), row.externalCategories, row.categoryMetadataAvailable
    )
    fun toDto(previewId: String) = CommerceCatalogSyncPreviewRowDto(
        "$previewId:$rowNumber", externalProductId, externalVariantId, externalSku, productName, currencyCode,
        unitPriceMinor, active, canonicalProductId, mappingId, action, reason, hasDependentBusinessRules, eligibleForApply, previousAttributes, proposedAttributes, externalCategories, categoryMetadataAvailable
    )
}

private fun attributesDto(attributes: CommerceCatalogProductAttributes) = CommerceCatalogSyncAttributesDto(
    attributes.externalSku,
    attributes.productName,
    attributes.description,
    attributes.currencyCode,
    attributes.unitPriceMinor,
    attributes.active,
    attributes.sourceUpdatedAt
)
interface CommerceCatalogSyncSql {
    @SqlQuery("SELECT commerce_create_catalog_sync_preview(:organizationId,:integrationId,:catalogId,:storeId,CAST(:rows AS jsonb),:actorUserId)")
    fun createPreview(@Bind("organizationId") organizationId: String, @Bind("integrationId") integrationId: String,
                      @Bind("catalogId") catalogId: String, @Bind("storeId") storeId: String?, @Bind("rows") rows: String,
                      @Bind("actorUserId") actorUserId: String): String
    @SqlQuery("SELECT commerce_apply_catalog_sync_preview(:organizationId,:previewId,:idempotencyKey,:actorUserId)::text")
    fun applyPreview(@Bind("organizationId") organizationId: String, @Bind("previewId") previewId: String,
                     @Bind("idempotencyKey") idempotencyKey: String, @Bind("actorUserId") actorUserId: String): String
    @SqlQuery("SELECT commerce_resolve_catalog_sync_preview_row(:organizationId,:previewId,:rowNumber,:productId,:expectedVersion,:actorUserId)")
    fun resolvePreviewRow(@Bind("organizationId") organizationId: String, @Bind("previewId") previewId: String,
                          @Bind("rowNumber") rowNumber: Int, @Bind("productId") productId: String,
                          @Bind("expectedVersion") expectedVersion: Int, @Bind("actorUserId") actorUserId: String): Boolean
}

data class CommerceCatalogCategoryCorrespondenceRow(
    var correspondenceId: String = "",
    var externalCategoryId: String = "",
    var productCatalogCategoryId: String = "",
    var versionNo: Int = 0
)

interface CommerceCatalogCategoryCorrespondenceSql {
    @SqlQuery("SELECT * FROM commerce_list_catalog_category_correspondences(:organizationId,:integrationId,:catalogId,:actorUserId)")
    @org.jdbi.v3.sqlobject.config.RegisterBeanMapper(CommerceCatalogCategoryCorrespondenceRow::class)
    fun list(@Bind("organizationId") organizationId: String, @Bind("integrationId") integrationId: String,
             @Bind("catalogId") catalogId: String, @Bind("actorUserId") actorUserId: String): List<CommerceCatalogCategoryCorrespondenceRow>
    @SqlQuery("SELECT commerce_save_catalog_category_correspondence(:organizationId,:integrationId,:catalogId,:externalCategoryId,:externalCategoryName,:externalParentCategoryId,:canonicalCategoryId,:versionNo,:actorUserId)")
    fun save(@Bind("organizationId") organizationId: String, @Bind("integrationId") integrationId: String, @Bind("catalogId") catalogId: String,
             @Bind("externalCategoryId") externalCategoryId: String, @Bind("externalCategoryName") externalCategoryName: String?, @Bind("externalParentCategoryId") externalParentCategoryId: String?,
             @Bind("canonicalCategoryId") canonicalCategoryId: String, @Bind("versionNo") versionNo: Int?, @Bind("actorUserId") actorUserId: String): String
    @SqlQuery("SELECT commerce_deactivate_catalog_category_correspondence(:organizationId,:correspondenceId,:versionNo,:actorUserId)")
    fun deactivate(@Bind("organizationId") organizationId: String, @Bind("correspondenceId") correspondenceId: String,
                   @Bind("versionNo") versionNo: Int, @Bind("actorUserId") actorUserId: String): Boolean
}
