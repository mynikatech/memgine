package com.mynikatech.memgine.component.commerce

import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.net.dto.CommerceProductSnapshotWriteDto

/**
 * Generic catalog-sync seam for onboarding, manual refresh, later schedules,
 * and provider webhooks. Phase 1 registers no external provider and exposes no
 * route that invokes these operations.
 */
class CommerceCatalogService(private val providers: CommerceProviderRegistry) {
    fun getProduct(providerCode: String, request: CommerceCatalogProductRequest): CommerceProductSnapshotWriteDto? =
        catalogProvider(providerCode).getProduct(request)

    fun syncProduct(providerCode: String, request: CommerceCatalogProductRequest): CommerceProductSnapshotWriteDto? =
        catalogProvider(providerCode).syncProduct(request)

    fun syncCatalog(providerCode: String, request: CommerceCatalogSyncRequest): List<CommerceProductSnapshotWriteDto> =
        catalogProvider(providerCode).syncCatalog(request)

    private fun catalogProvider(providerCode: String): CommerceCatalogProvider =
        providers.catalogProvider(providerCode)
            ?: throw BadRequestException("Commerce catalog provider is not available")
}
