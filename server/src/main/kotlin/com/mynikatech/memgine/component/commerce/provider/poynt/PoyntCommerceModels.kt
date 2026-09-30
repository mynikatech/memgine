package com.mynikatech.memgine.component.commerce.provider.poynt

import kotlinx.serialization.Serializable

@Serializable
data class PoyntProductListResponse(val items: List<PoyntProduct> = emptyList(), val next: String? = null)
@Serializable
data class PoyntProduct(val id: String, val name: String, val description: String? = null, val sku: String? = null, val shortCode: String? = null, val price: PoyntPrice? = null, val variants: List<PoyntProductVariant> = emptyList(), val active: Boolean = true, val updatedAt: String? = null)
@Serializable
data class PoyntPrice(val amount: Long? = null, val currency: String? = null)
@Serializable
data class PoyntProductVariant(val id: String? = null, val sku: String? = null, val name: String? = null, val price: PoyntPrice? = null, val active: Boolean = true, val updatedAt: String? = null)

data class PoyntCatalogConfiguration(
    val integrationConfigurationId: String,
    val organizationId: String,
    val applicationId: String,
    val businessId: String,
    val providerStoreId: String?,
    val secretReference: String,
    val merchantCurrencyCode: String,
    val lastIncrementalSyncAt: String?
)

/** Durable credential material only. Poynt access tokens are never persisted. */
data class PoyntCredential(val privateKeyPem: String)
fun interface PoyntCredentialResolver { fun resolve(secretReference: String): PoyntCredential }

data class PoyntAccessToken(val value: String, val tokenType: String, val expiresAtEpochSeconds: Long)
data class PoyntHttpResponse(val statusCode: Int, val body: String)

/**
 * Poynt Cloud Order resource. The same model is safe for create requests and
 * responses because provider-generated fields are nullable and are omitted
 * from create requests by the Kotlin serializer.
 */
@Serializable
data class PoyntOrder(
    val id: String? = null,
    val items: List<PoyntOrderItem> = emptyList(),
    val amounts: PoyntOrderAmounts? = null,
    val discounts: List<PoyntDiscount> = emptyList(),
    val fees: List<PoyntFee> = emptyList(),
    val transactions: List<PoyntOrderTransaction> = emptyList(),
    val context: PoyntOrderContext? = null,
    val statuses: PoyntOrderStatuses? = null,
    val customerUserId: Long? = null,
    val externalId: String? = null,
    val notes: String? = null,
    val orderNumber: String? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null
)

@Serializable
data class PoyntOrderItem(
    val id: Long? = null,
    val productId: String? = null,
    val externalProductId: String? = null,
    val selectedVariants: List<PoyntVariant> = emptyList(),
    val sku: String? = null,
    val name: String? = null,
    val details: String? = null,
    val unitPrice: Long? = null,
    val quantity: Double? = null,
    val unitOfMeasure: String? = null,
    val status: String? = null,
    val taxes: List<PoyntOrderItemTax> = emptyList(),
    val discounts: List<PoyntDiscount> = emptyList(),
    val fees: List<PoyntFee> = emptyList(),
    val tax: Long? = null,
    val discount: Long? = null,
    val fee: Long? = null,
    val externalId: String? = null,
    val fulfillmentInstruction: String? = null,
    val clientNotes: String? = null
)

@Serializable
data class PoyntOrderAmounts(
    val taxTotal: Long? = null,
    val subTotal: Long? = null,
    val discountTotal: Long? = null,
    val feeTotal: Long? = null,
    val shippingTotal: Long? = null,
    val netTotal: Long? = null,
    val currency: String? = null
)

@Serializable
data class PoyntDiscount(
    val id: String? = null,
    val customName: String? = null,
    val externalId: String? = null,
    val amount: Long? = null,
    val percentage: Double? = null
)

@Serializable
data class PoyntFee(
    val id: Long? = null,
    val idStr: String? = null,
    val externalId: String? = null,
    val name: String? = null,
    val amount: Long? = null,
    val percentage: Double? = null
)

@Serializable
data class PoyntOrderItemTax(
    val id: String? = null,
    val externalId: String? = null,
    val type: String? = null,
    val amount: Long? = null,
    val amountPrecision: Int? = null,
    val taxRatePercentage: Double? = null,
    val taxRateFixedAmount: Long? = null
)

@Serializable
data class PoyntVariant(
    val id: String? = null,
    val name: String? = null,
    val sku: String? = null,
    val price: PoyntPrice? = null
)

@Serializable
data class PoyntOrderContext(
    val source: String? = null,
    val transactionInstruction: String? = null,
    val businessId: String? = null,
    val storeId: String? = null,
    val storeDeviceId: String? = null
)

@Serializable
data class PoyntOrderStatuses(
    val status: String? = null,
    val transactionStatusSummary: String? = null,
    val fulfillmentStatus: String? = null
)

/** Minimal transaction representation returned as part of an Order response. */
@Serializable
data class PoyntOrderTransaction(
    val id: String? = null,
    val status: String? = null,
    val action: String? = null,
    val referenceId: String? = null
)
