package com.mynikatech.memgine.component.commerce

import com.mynikatech.memgine.component.product.OrganizationProductSql
import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.exception.ConflictException
import com.mynikatech.memgine.exception.NotFoundException
import com.mynikatech.memgine.net.dto.CommerceCatalogSyncApplyRequestDto
import com.mynikatech.memgine.net.dto.CommerceCatalogSyncApplyResultDto
import com.mynikatech.memgine.net.dto.CommerceCatalogSyncPreviewRequestDto
import com.mynikatech.memgine.net.dto.CommerceCatalogSyncPreviewDto
import com.mynikatech.memgine.net.dto.CommerceCatalogSyncPreviewRowDto
import com.mynikatech.memgine.net.dto.CommerceCatalogSyncAttributesDto
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
        val fetched = provider.syncCatalog(
            CommerceCatalogSyncRequest(
                organizationId = organizationId,
                integrationConfigurationId = integrationConfigurationId,
                storeId = storeId,
                incremental = false,
                actorUserId = actorUserId
            )
        )
        if (fetched.size > MAX_PREVIEW_ROWS) throw BadRequestException("Catalog exceeds the maximum preview size")
        if (fetched.any { it.integrationConfigurationId != integrationConfigurationId || it.storeId != storeId }) {
            throw BadRequestException("Catalog provider returned a mismatched integration or store scope")
        }
        val productSql = jdbi.onDemand(OrganizationProductSql::class.java)
        val products = productSql.products(organizationId, null, actorUserId).map {
            CommerceCatalogCanonicalProduct(it.productId, it.organizationId, it.sku, it.active, it.versionNo)
        }
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
                dependentProductIds = dependentProductIds(organizationId)
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
        row.proposedAttributes?.let(::attributesDto)
    )
    fun toDto(previewId: String) = CommerceCatalogSyncPreviewRowDto(
        "$previewId:$rowNumber", externalProductId, externalVariantId, externalSku, productName, currencyCode,
        unitPriceMinor, active, canonicalProductId, mappingId, action, reason, hasDependentBusinessRules, eligibleForApply, previousAttributes, proposedAttributes
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
}
