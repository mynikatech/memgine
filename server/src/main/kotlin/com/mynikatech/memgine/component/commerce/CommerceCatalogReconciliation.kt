package com.mynikatech.memgine.component.commerce

import com.mynikatech.memgine.net.dto.CommerceProductSnapshotWriteDto

/**
 * Read-only catalog reconciliation boundary. It deliberately has no database,
 * provider, or mutation dependency so a later preview/apply workflow can use
 * the same deterministic plan after it has loaded authorized data.
 */
class CommerceCatalogReconciliationService {
    fun plan(input: CommerceCatalogReconciliationInput): CommerceCatalogReconciliationPlan {
        val products = input.canonicalProducts.filter { it.organizationId == input.organizationId }
        val mappings = input.mappings.filter {
            it.organizationId == input.organizationId &&
                it.integrationConfigurationId == input.integrationConfigurationId &&
                it.active
        }
        val orderedSnapshots = input.snapshots.sortedWith(snapshotComparator)
        val identities = orderedSnapshots.groupingBy(::identity).eachCount()

        val rows = orderedSnapshots.map { snapshot ->
            reconcileSnapshot(snapshot, input, products, mappings, identities.getValue(identity(snapshot)))
        }.toMutableList()

        if (input.fullCatalogComplete) {
            currentMissingMappings(input, mappings, orderedSnapshots.map(::identity).toSet())
                .mapTo(rows) { mapping -> missingRow(mapping, input, products) }
        }

        return CommerceCatalogReconciliationPlan(
            organizationId = input.organizationId,
            integrationConfigurationId = input.integrationConfigurationId,
            storeId = input.storeId,
            fullCatalogComplete = input.fullCatalogComplete,
            rows = rows.sortedWith(rowComparator)
        )
    }

    private fun reconcileSnapshot(
        snapshot: CommerceProductSnapshotWriteDto,
        input: CommerceCatalogReconciliationInput,
        products: List<CommerceCatalogCanonicalProduct>,
        mappings: List<CommerceProductMappingRow>,
        identityCount: Int
    ): CommerceCatalogReconciliationRow {
        val proposed = attributes(snapshot)
        val invalidReason = invalidSnapshotReason(snapshot, input)
        if (invalidReason != null) return invalidRow(snapshot, invalidReason, proposed)
        if (identityCount != 1) return conflictRow(snapshot, "External product identity is duplicated in this catalog", proposed)

        val identityMappings = scopedMappings(mappings, snapshot.externalProductId, snapshot.externalVariantId, input.storeId)
        if (identityMappings.size > 1) {
            return conflictRow(snapshot, "External product identity has multiple active mappings", proposed)
        }
        if (identityMappings.size == 1) {
            val mapping = identityMappings.single()
            val productId = mapping.productId?.trim().takeUnless { it.isNullOrEmpty() }
                ?: return conflictRow(snapshot, "External product identity has an unresolved mapping", proposed)
            if (products.none { it.productId == productId }) {
                return conflictRow(snapshot, "Mapped canonical product is unavailable", proposed, productId)
            }
            if (!snapshot.active) {
                return row(snapshot, productId, CommerceCatalogReconciliationAction.INACTIVE,
                    "External product is inactive", previousAttributes(mapping, input), proposed, input)
            }
            val previous = previousAttributes(mapping, input)
            val action = if (previous != null && previous != proposed) {
                CommerceCatalogReconciliationAction.UPDATE
            } else {
                CommerceCatalogReconciliationAction.UNCHANGED
            }
            return row(snapshot, productId, action, null, previous, proposed, input)
        }

        if (!snapshot.active) {
            return row(snapshot, null, CommerceCatalogReconciliationAction.INACTIVE,
                "External product is inactive", null, proposed, input)
        }

        val sku = normalized(snapshot.externalSku)
        if (sku == null) {
            return row(snapshot, null, CommerceCatalogReconciliationAction.NEW,
                "No canonical SKU match is available", null, proposed, input)
        }
        val candidates = products.filter { it.active && normalized(it.sku) == sku }
        if (candidates.size > 1) {
            return conflictRow(snapshot, "Canonical SKU matches multiple products", proposed)
        }
        if (candidates.isEmpty()) {
            return row(snapshot, null, CommerceCatalogReconciliationAction.NEW,
                "No canonical SKU match is available", null, proposed, input)
        }

        val candidate = candidates.single()
        val skuMappings = scopedSkuMappings(mappings, sku, input.storeId)
        val conflictingSkuMapping = skuMappings.any { mapping ->
            mapping.productId?.trim()?.takeIf { it.isNotEmpty() } != candidate.productId
        }
        if (conflictingSkuMapping) {
            return conflictRow(snapshot, "SKU is already mapped to a different canonical product", proposed)
        }
        val legacyMapping = skuMappings.any { it.externalProductId == sku && it.externalProductId != snapshot.externalProductId }
        return row(
            snapshot,
            candidate.productId,
            CommerceCatalogReconciliationAction.MATCHED,
            if (legacyMapping) "Legacy SKU-based mapping remains for review" else null,
            null,
            proposed,
            input
        )
    }

    private fun currentMissingMappings(
        input: CommerceCatalogReconciliationInput,
        mappings: List<CommerceProductMappingRow>,
        current: Set<CommerceCatalogExternalIdentity>
    ): List<CommerceProductMappingRow> = mappings.filter { mapping ->
        mapping.productId?.isNotBlank() == true &&
            scopeApplies(mapping.storeId, input.storeId) &&
            CommerceCatalogExternalIdentity(mapping.externalProductId, mapping.externalVariantId) !in current
    }

    private fun missingRow(
        mapping: CommerceProductMappingRow,
        input: CommerceCatalogReconciliationInput,
        products: List<CommerceCatalogCanonicalProduct>
    ): CommerceCatalogReconciliationRow {
        val productId = mapping.productId
        val previous = previousAttributes(mapping, input)
        return CommerceCatalogReconciliationRow(
            integrationConfigurationId = input.integrationConfigurationId,
            storeId = mapping.storeId,
            externalProductId = mapping.externalProductId,
            externalVariantId = mapping.externalVariantId,
            externalSku = mapping.externalSku,
            canonicalProductId = productId,
            action = CommerceCatalogReconciliationAction.MISSING,
            reason = "Previously mapped external product is absent from a complete catalog",
            previousAttributes = previous,
            proposedAttributes = null,
            hasDependentBusinessRules = productId != null && input.dependentProductIds.contains(productId),
            canonicalProductActive = products.firstOrNull { it.productId == productId }?.active
        )
    }

    private fun invalidSnapshotReason(
        snapshot: CommerceProductSnapshotWriteDto,
        input: CommerceCatalogReconciliationInput
    ): String? = when {
        snapshot.integrationConfigurationId != input.integrationConfigurationId -> "Snapshot integration does not match reconciliation input"
        snapshot.storeId != input.storeId -> "Snapshot store scope does not match reconciliation input"
        snapshot.externalProductId.isBlank() -> "External product ID is required"
        snapshot.externalVariantId?.isBlank() == true -> "External variant ID is invalid"
        snapshot.productName.isBlank() -> "Product name is required"
        snapshot.currencyCode.trim().uppercase().matches(Regex("^[A-Z]{3}$")).not() -> "Currency is invalid"
        snapshot.unitPriceMinorSnapshot < 0 -> "Price is invalid"
        else -> null
    }

    private fun invalidRow(
        snapshot: CommerceProductSnapshotWriteDto,
        reason: String,
        proposed: CommerceCatalogProductAttributes
    ) = CommerceCatalogReconciliationRow(
        snapshot.integrationConfigurationId,
        snapshot.storeId,
        snapshot.externalProductId,
        snapshot.externalVariantId,
        snapshot.externalSku,
        null,
        CommerceCatalogReconciliationAction.INVALID,
        reason,
        null,
        proposed
    )

    private fun conflictRow(
        snapshot: CommerceProductSnapshotWriteDto,
        reason: String,
        proposed: CommerceCatalogProductAttributes,
        productId: String? = null
    ) = CommerceCatalogReconciliationRow(
        snapshot.integrationConfigurationId,
        snapshot.storeId,
        snapshot.externalProductId,
        snapshot.externalVariantId,
        snapshot.externalSku,
        productId,
        CommerceCatalogReconciliationAction.CONFLICT,
        reason,
        null,
        proposed
    )

    private fun row(
        snapshot: CommerceProductSnapshotWriteDto,
        productId: String?,
        action: CommerceCatalogReconciliationAction,
        reason: String?,
        previous: CommerceCatalogProductAttributes?,
        proposed: CommerceCatalogProductAttributes?,
        input: CommerceCatalogReconciliationInput
    ) = CommerceCatalogReconciliationRow(
        snapshot.integrationConfigurationId,
        snapshot.storeId,
        snapshot.externalProductId,
        snapshot.externalVariantId,
        snapshot.externalSku,
        productId,
        action,
        reason,
        previous,
        proposed,
        productId != null && input.dependentProductIds.contains(productId)
    )

    private fun scopedMappings(
        mappings: List<CommerceProductMappingRow>,
        externalProductId: String,
        externalVariantId: String?,
        storeId: String?
    ): List<CommerceProductMappingRow> = scoped(mappings.filter {
        it.externalProductId == externalProductId && it.externalVariantId == externalVariantId
    }, storeId)

    private fun scopedSkuMappings(
        mappings: List<CommerceProductMappingRow>,
        sku: String,
        storeId: String?
    ): List<CommerceProductMappingRow> = scoped(mappings.filter {
        normalized(it.externalSku) == sku || normalized(it.externalProductId) == sku
    }, storeId)

    private fun scoped(
        mappings: List<CommerceProductMappingRow>,
        storeId: String?
    ): List<CommerceProductMappingRow> {
        val exact = mappings.filter { it.storeId == storeId }
        return if (exact.isNotEmpty()) exact else mappings.filter { it.storeId == null }
    }

    private fun previousAttributes(
        mapping: CommerceProductMappingRow,
        input: CommerceCatalogReconciliationInput
    ): CommerceCatalogProductAttributes? {
        val candidates = input.previousSnapshots.filter {
            it.organizationId == input.organizationId &&
                it.integrationConfigurationId == input.integrationConfigurationId &&
                it.externalProductId == mapping.externalProductId &&
                it.externalVariantId == mapping.externalVariantId
        }
        val scoped = scopedSnapshots(candidates, input.storeId)
        return scoped.singleOrNull()?.let(::attributes)
    }

    private fun scopedSnapshots(
        snapshots: List<CommerceProductSnapshotRow>,
        storeId: String?
    ): List<CommerceProductSnapshotRow> {
        val exact = snapshots.filter { it.storeId == storeId }
        return if (exact.isNotEmpty()) exact else snapshots.filter { it.storeId == null }
    }

    private fun scopeApplies(mappingStoreId: String?, requestedStoreId: String?): Boolean =
        mappingStoreId == requestedStoreId || mappingStoreId == null

    private fun attributes(snapshot: CommerceProductSnapshotWriteDto) = CommerceCatalogProductAttributes(
        snapshot.externalSku,
        snapshot.productName,
        snapshot.description,
        snapshot.currencyCode.trim().uppercase(),
        snapshot.unitPriceMinorSnapshot,
        snapshot.active,
        snapshot.sourceUpdatedAt
    )

    private fun attributes(snapshot: CommerceProductSnapshotRow) = CommerceCatalogProductAttributes(
        snapshot.externalSku,
        snapshot.productName,
        snapshot.description,
        snapshot.currencyCode.trim().uppercase(),
        snapshot.unitPriceMinorSnapshot,
        snapshot.active,
        snapshot.sourceUpdatedAt
    )

    private fun identity(snapshot: CommerceProductSnapshotWriteDto) =
        CommerceCatalogExternalIdentity(snapshot.externalProductId, snapshot.externalVariantId)

    private fun normalized(value: String?): String? = value?.trim()?.takeIf { it.isNotEmpty() }

    private companion object {
        val snapshotComparator = compareBy<CommerceProductSnapshotWriteDto>(
            { it.externalProductId }, { it.externalVariantId ?: "" }, { it.externalSku ?: "" }
        )
        val rowComparator = compareBy<CommerceCatalogReconciliationRow>(
            { it.externalProductId }, { it.externalVariantId ?: "" }, { it.storeId ?: "" }, { it.action.name }
        )
    }
}

data class CommerceCatalogReconciliationInput(
    val organizationId: String,
    val integrationConfigurationId: String,
    val storeId: String? = null,
    /** True only when the caller has verified the provider returned a complete full catalog. */
    val fullCatalogComplete: Boolean,
    val snapshots: List<CommerceProductSnapshotWriteDto>,
    /**
     * Canonical business catalog products only. Membership products and
     * subscription plans are intentionally outside catalog reconciliation.
     */
    val canonicalProducts: List<CommerceCatalogCanonicalProduct>,
    val mappings: List<CommerceProductMappingRow>,
    val previousSnapshots: List<CommerceProductSnapshotRow> = emptyList(),
    /** Product IDs known by the caller to have benefit, offer, or other business-rule dependencies. */
    val dependentProductIds: Set<String> = emptySet()
)

data class CommerceCatalogCanonicalProduct(
    val productId: String,
    val organizationId: String,
    val sku: String? = null,
    val active: Boolean = true,
    val versionNo: Int? = null
)

data class CommerceCatalogReconciliationPlan(
    val organizationId: String,
    val integrationConfigurationId: String,
    val storeId: String?,
    val fullCatalogComplete: Boolean,
    val rows: List<CommerceCatalogReconciliationRow>
)

data class CommerceCatalogReconciliationRow(
    val integrationConfigurationId: String,
    val storeId: String?,
    val externalProductId: String,
    val externalVariantId: String?,
    val externalSku: String?,
    val canonicalProductId: String?,
    val action: CommerceCatalogReconciliationAction,
    val reason: String? = null,
    val previousAttributes: CommerceCatalogProductAttributes? = null,
    val proposedAttributes: CommerceCatalogProductAttributes? = null,
    val hasDependentBusinessRules: Boolean = false,
    val canonicalProductActive: Boolean? = null
)

data class CommerceCatalogProductAttributes(
    val externalSku: String?,
    val productName: String,
    val description: String?,
    val currencyCode: String,
    val unitPriceMinor: Long,
    val active: Boolean,
    val sourceUpdatedAt: String?
)

data class CommerceCatalogExternalIdentity(
    val externalProductId: String,
    val externalVariantId: String?
)

enum class CommerceCatalogReconciliationAction {
    NEW,
    MATCHED,
    UPDATE,
    UNCHANGED,
    INACTIVE,
    MISSING,
    CONFLICT,
    INVALID
}

