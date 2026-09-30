package com.mynikatech.memgine.component.commerce

import com.mynikatech.memgine.net.dto.CommerceCapability
import com.mynikatech.memgine.net.dto.CommerceProductSnapshotWriteDto

/**
 * Provider-neutral boundary. Phase 1 has no external implementation and never
 * invokes a merchant catalog or payment API.
 */
interface CommerceProvider {
    val providerCode: String
    val capabilities: Set<CommerceCapability>
}

interface CommerceCatalogProvider : CommerceProvider {
    fun getProduct(request: CommerceCatalogProductRequest): CommerceProductSnapshotWriteDto?
    fun syncProduct(request: CommerceCatalogProductRequest): CommerceProductSnapshotWriteDto?
    fun syncCatalog(request: CommerceCatalogSyncRequest): List<CommerceProductSnapshotWriteDto>
}

data class CommerceCatalogProductRequest(
    val organizationId: String,
    val integrationConfigurationId: String,
    val storeId: String?,
    val externalProductId: String,
    val externalVariantId: String?,
    val actorUserId: String
)

data class CommerceCatalogSyncRequest(
    val organizationId: String,
    val integrationConfigurationId: String,
    val storeId: String? = null,
    val modifiedSince: String? = null,
    val incremental: Boolean = false,
    val actorUserId: String
)
class CommerceProviderRegistry(providers: Collection<CommerceProvider> = emptyList()) {
    private val byCode = providers.associateBy { it.providerCode.uppercase() }

    fun capabilities(providerCode: String): Set<CommerceCapability> =
        byCode[providerCode.uppercase()]?.capabilities ?: emptySet()

    fun catalogProvider(providerCode: String): CommerceCatalogProvider? =
        byCode[providerCode.uppercase()] as? CommerceCatalogProvider

    fun checkoutProvider(providerCode: String): CommerceCheckoutProvider? =
        byCode[providerCode.uppercase()] as? CommerceCheckoutProvider
}

/** Checkout boundary; no provider is registered by Phase 2. */
interface CommerceCheckoutProvider : CommerceProvider {
    fun prepareCheckout(request: com.mynikatech.memgine.net.dto.CommerceCheckoutRequest): com.mynikatech.memgine.net.dto.CommerceCheckoutResult
    fun startCheckout(request: com.mynikatech.memgine.net.dto.CommerceCheckoutRequest): com.mynikatech.memgine.net.dto.CommerceCheckoutResult
    fun getCheckoutStatus(request: com.mynikatech.memgine.net.dto.CommerceCheckoutRequest): com.mynikatech.memgine.net.dto.CommerceCheckoutResult
    fun cancelCheckout(request: com.mynikatech.memgine.net.dto.CommerceCheckoutRequest): com.mynikatech.memgine.net.dto.CommerceCheckoutResult
}
