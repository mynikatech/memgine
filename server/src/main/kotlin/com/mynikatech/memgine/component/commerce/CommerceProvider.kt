package com.mynikatech.memgine.component.commerce

import com.mynikatech.memgine.net.dto.CommerceCapability
import com.mynikatech.memgine.net.dto.CommerceProductSnapshotWriteDto

interface CommerceProvider { val providerCode: String; val capabilities: Set<CommerceCapability> }
interface CommerceCatalogProvider : CommerceProvider {
    fun getProduct(request: CommerceCatalogProductRequest): CommerceProductSnapshotWriteDto?
    fun syncProduct(request: CommerceCatalogProductRequest): CommerceProductSnapshotWriteDto?
    fun syncCatalog(request: CommerceCatalogSyncRequest): List<CommerceProductSnapshotWriteDto>
}
data class CommerceCatalogProductRequest(val organizationId: String,val integrationConfigurationId: String,val storeId: String?,val externalProductId: String,val externalVariantId: String?,val actorUserId: String)
data class CommerceCatalogSyncRequest(val organizationId: String,val integrationConfigurationId: String,val storeId: String? = null,val modifiedSince: String? = null,val incremental: Boolean = false,val actorUserId: String)

/** Provider-neutral remote terminal boundary. The provider owns wire format only. */
interface CommerceRemoteTerminalPaymentProvider : CommerceProvider {
    fun dispatchRemoteTerminalPayment(request: CommerceRemoteTerminalPaymentRequest)
}
data class CommerceRemoteTerminalPaymentRequest(
    val organizationId: String, val integrationConfigurationId: String, val actorUserId: String, val providerOrderId: String,
    val amountMinor: Long, val currencyCode: String, val referenceId: String,
    val target: CommerceRemoteTerminalTarget, val callbackUrl: String,
    val callbackHeaderName: String, val callbackHeaderValue: String, val ttlSeconds: Long,
    val transactionId: String? = null
)
data class CommerceRemoteTerminalTarget(
    val providerBusinessId: String, val providerStoreId: String, val providerDeviceId: String
)
class CommerceProviderRegistry(providers: Collection<CommerceProvider> = emptyList()) {
    private val byCode = providers.associateBy { it.providerCode.uppercase() }
    fun capabilities(providerCode: String): Set<CommerceCapability> = byCode[providerCode.uppercase()]?.capabilities ?: emptySet()
    fun catalogProvider(providerCode: String): CommerceCatalogProvider? = byCode[providerCode.uppercase()] as? CommerceCatalogProvider
    fun checkoutProvider(providerCode: String): CommerceCheckoutProvider? = byCode[providerCode.uppercase()] as? CommerceCheckoutProvider
    fun remoteTerminalPaymentProvider(providerCode: String): CommerceRemoteTerminalPaymentProvider? = byCode[providerCode.uppercase()] as? CommerceRemoteTerminalPaymentProvider
}
interface CommerceCheckoutProvider : CommerceProvider {
    fun prepareCheckout(request: com.mynikatech.memgine.net.dto.CommerceCheckoutRequest): com.mynikatech.memgine.net.dto.CommerceCheckoutResult
    fun startCheckout(request: com.mynikatech.memgine.net.dto.CommerceCheckoutRequest): com.mynikatech.memgine.net.dto.CommerceCheckoutResult
    fun getCheckoutStatus(request: com.mynikatech.memgine.net.dto.CommerceCheckoutRequest): com.mynikatech.memgine.net.dto.CommerceCheckoutResult
    fun cancelCheckout(request: com.mynikatech.memgine.net.dto.CommerceCheckoutRequest): com.mynikatech.memgine.net.dto.CommerceCheckoutResult
}
