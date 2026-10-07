package com.mynikatech.memgine.net.dto

import kotlinx.serialization.Serializable

/** A provider capability is descriptive only in Phase 1; it does not enable checkout. */
@Serializable
enum class CommerceCapability {
    CATALOG,
    PRODUCT_LOOKUP,
    ORDER,
    DISCOUNT,
    ZERO_VALUE_CHECKOUT,
    PAYMENT,
    REMOTE_PAYMENT,
    TERMINAL_PAYMENT
}

@Serializable
data class CommerceIntegrationDto(
    val integrationConfigurationId: String,
    val integrationName: String,
    val providerCode: String,
    val integrationTypeCode: String,
    val capabilities: Set<CommerceCapability> = emptySet()
)

@Serializable
data class CommercePaymentProviderRouteDto(
    val routeId: String,
    val organizationId: String,
    val storeId: String? = null,
    val sourceChannel: String,
    val providerCode: String,
    val integrationConfigurationId: String? = null,
    val enabled: Boolean,
    val createdAt: String,
    val createdBy: String,
    val updatedAt: String? = null,
    val updatedBy: String? = null,
    val isDeleted: Boolean,
    val versionNo: Int
)

@Serializable
data class CommercePaymentProviderRouteWriteDto(
    val storeId: String? = null,
    val sourceChannel: String,
    val providerCode: String,
    val integrationConfigurationId: String? = null,
    val enabled: Boolean = true,
    val versionNo: Int = 1
)

@Serializable
data class CommerceProductSnapshotDto(
    val snapshotId: String,
    val organizationId: String,
    val integrationConfigurationId: String,
    val storeId: String? = null,
    val externalProductId: String,
    val externalVariantId: String? = null,
    val externalSku: String? = null,
    val productName: String,
    val description: String? = null,
    val currencyCode: String,
    /** Informational source-catalog value. It is never checkout authority. */
    val unitPriceMinorSnapshot: Long,
    val active: Boolean,
    val sourceUpdatedAt: String? = null,
    val lastSyncedAt: String,
    val versionNo: Int
)

@Serializable
data class CommerceProductSnapshotWriteDto(
    val integrationConfigurationId: String,
    val storeId: String? = null,
    val externalProductId: String,
    val externalVariantId: String? = null,
    val externalSku: String? = null,
    val productName: String,
    val description: String? = null,
    val currencyCode: String,
    val unitPriceMinorSnapshot: Long,
    val active: Boolean = true,
    val sourceUpdatedAt: String? = null
)

@Serializable
data class CommerceProductMappingDto(
    val mappingId: String,
    val organizationId: String,
    val productId: String? = null,
    val integrationConfigurationId: String,
    val storeId: String? = null,
    val externalProductId: String,
    val externalVariantId: String? = null,
    val externalSku: String? = null,
    val active: Boolean,
    val snapshot: CommerceProductSnapshotDto? = null,
    val versionNo: Int
)

@Serializable
data class CommerceProductMappingWriteDto(
    val integrationConfigurationId: String,
    val storeId: String? = null,
    val externalProductId: String,
    val externalVariantId: String? = null,
    val externalSku: String? = null,
    val active: Boolean = true
)

@Serializable
data class CommerceProductMappingResolutionDto(
    val selectedMappingId: String
)
@Serializable
data class PlatformPoyntPaymentWriteDto(
    val applicationId: String,
    val providerBusinessId: String,
    val providerStoreId: String? = null,
    val credentialProfileId: String,
    val merchantCurrencyCode: String,
    val versionNo: Int = 1
)

@Serializable
data class PlatformPoyntPaymentDto(
    val organizationId: String,
    val organizationName: String,
    val integrationConfigurationId: String,
    val integrationName: String,
    val provider: String,
    val integrationTypeId: String,
    val integrationStatusId: String,
    val integrationStatus: String,
    val integrationVersionNo: Int,
    val applicationId: String? = null,
    val providerBusinessId: String? = null,
    val providerStoreId: String? = null,
    val merchantCurrencyCode: String? = null,
    val credentialProfileId: String? = null,
    val credentialStatus: String,
    val connectionStatus: String,
    val lastVerifiedAt: String? = null,
    val versionNo: Int = 1
)

@Serializable
data class PoyntCredentialProfileDto(
    val credentialProfileId: String,
    val displayName: String
)

@Serializable
data class PlatformPoyntTerminalBindingWriteDto(
    val storeId: String,
    val deviceName: String,
    val poyntBusinessId: String,
    val poyntStoreId: String,
    val poyntTerminalId: String,
    val active: Boolean = true
)

@Serializable
data class OrganizationPoyntTerminalBindingWriteDto(
    val storeId: String,
    val deviceName: String,
    val poyntStoreId: String? = null,
    val poyntTerminalId: String,
    val active: Boolean = true
)

@Serializable
data class PlatformPoyntTerminalBindingDto(
    val bindingId: String,
    val posDeviceId: String,
    val organizationId: String,
    val storeId: String,
    val storeName: String,
    val deviceName: String,
    val poyntBusinessId: String,
    val poyntStoreId: String,
    val poyntTerminalId: String,
    val active: Boolean,
    val createdAt: String
)

@Serializable
data class OrganizationPoyntPaymentSummaryDto(
    val integrationConfigurationId: String,
    val integrationName: String,
    val integrationStatus: String,
    val providerBusinessId: String? = null,
    val providerStoreId: String? = null,
    val merchantCurrencyCode: String? = null,
    val credentialStatus: String,
    val connectionStatus: String,
    val lastVerifiedAt: String? = null
)

@Serializable
data class CommerceApplicabilityDto(
    val adjustmentId: String,
    val organizationId: String,
    val adjustmentType: String,
    val percentage: Double? = null,
    val amountMinor: Long? = null,
    val currencyCode: String? = null,
    val active: Boolean,
    val productMappings: List<CommerceProductMappingDto> = emptyList(),
    val versionNo: Int
)

@Serializable
data class CommerceApplicabilityWriteDto(
    val adjustmentType: String,
    val percentage: Double? = null,
    val amountMinor: Long? = null,
    val currencyCode: String? = null,
    val active: Boolean = true,
    val productMappingIds: List<String> = emptyList()
)

@Serializable
data class MembershipOfferApplicabilityDto(
    val applicabilityId: String,
    val offerId: String,
    val behavior: String,
    val targetMembershipProductId: String? = null,
    val targetSubscriptionPlanId: String? = null,
    val sourceMembershipProductId: String? = null,
    val sourceSubscriptionPlanId: String? = null,
    val adjustmentType: String,
    val percentage: Double? = null,
    val amountMinor: Long? = null,
    val currencyCode: String? = null,
    val active: Boolean,
    val versionNo: Int,
    val customerApplicability: String = "ALL",
    val membershipTargetMode: String = "ALL_MEMBERSHIP_PRODUCTS",
    val selectedMembershipProductIds: List<String> = emptyList()
)

@Serializable
data class MembershipOfferApplicabilityWriteDto(
    val behavior: String,
    val targetMembershipProductId: String? = null,
    val targetSubscriptionPlanId: String? = null,
    val sourceMembershipProductId: String? = null,
    val sourceSubscriptionPlanId: String? = null,
    val adjustmentType: String,
    val percentage: Double? = null,
    val amountMinor: Long? = null,
    val currencyCode: String? = null,
    val active: Boolean = true,
    val customerApplicability: String = "ALL",
    val membershipTargetMode: String = "ALL_MEMBERSHIP_PRODUCTS",
    val selectedMembershipProductIds: List<String> = emptyList()
)
@Serializable
data class CommerceTransactionCreateDto(
    val storeId: String? = null,
    val customerUserId: String? = null,
    val subscriptionId: String? = null,
    val integrationConfigurationId: String? = null,
    val sourceChannel: String,
    val idempotencyKey: String
)

@Serializable
data class CommerceExternalProductLineCreateDto(
    val commerceProductMappingId: String,
    val quantity: Int = 1,
    val description: String
)

@Serializable
data class CommerceMembershipLineCreateDto(
    val subscriptionPlanId: String,
    val quantity: Int = 1
)

@Serializable
data class CommerceRedemptionAttachDto(val redemptionTransactionId: String)

@Serializable
data class CommerceAdjustmentMaterializeDto(
    val sourceType: String,
    val sourceId: String,
    val targetLineId: String? = null
)

@Serializable
data class CommerceTransactionDto(
    val transactionId: String,
    val organizationId: String,
    val storeId: String? = null,
    val customerUserId: String? = null,
    val subscriptionId: String? = null,
    val integrationConfigurationId: String? = null,
    val sourceChannel: String,
    val status: String,
    val currencyCode: String? = null,
    val subtotalMinor: Long? = null,
    val adjustmentTotalMinor: Long? = null,
    val taxTotalMinor: Long? = null,
    val totalMinor: Long? = null,
    val providerOrderId: String? = null,
    val providerTransactionId: String? = null,
    val idempotencyKey: String,
    val failureCode: String? = null,
    val failureMessage: String? = null,
    val createdAt: String,
    val updatedAt: String,
    val completedAt: String? = null,
    val versionNo: Int
)

@Serializable
data class CommerceTransactionLineDto(
    val lineId: String,
    val transactionId: String,
    val lineType: String,
    val sourceEntityType: String? = null,
    val sourceEntityId: String? = null,
    val productMappingId: String? = null,
    val subscriptionPlanId: String? = null,
    val externalProductId: String? = null,
    val externalVariantId: String? = null,
    val description: String,
    val quantity: Int,
    val unitPriceMinorSnapshot: Long? = null,
    val unitPriceMinorAuthoritative: Long? = null,
    val lineSubtotalMinor: Long? = null,
    val currencyCode: String? = null,
    val priceSource: String,
    val metadataJson: String? = null,
    val versionNo: Int
)

@Serializable
data class CommerceTransactionAdjustmentDto(
    val adjustmentId: String,
    val transactionId: String,
    val targetLineId: String? = null,
    val commerceAdjustmentId: String,
    val sourceType: String,
    val sourceId: String,
    val adjustmentType: String,
    val percentage: Double? = null,
    val requestedAmountMinor: Long? = null,
    val appliedAmountMinor: Long? = null,
    val currencyCode: String? = null,
    val status: String,
    val versionNo: Int
)

@Serializable
data class CommerceTransactionRedemptionDto(
    val associationId: String,
    val transactionId: String,
    val redemptionTransactionId: String,
    val redemptionStatus: String,
    val versionNo: Int
)

@Serializable
data class CommerceTransactionDetailDto(
    val transaction: CommerceTransactionDto,
    val lines: List<CommerceTransactionLineDto>,
    val adjustments: List<CommerceTransactionAdjustmentDto>,
    val redemptions: List<CommerceTransactionRedemptionDto>
)

/** Provider-neutral request. Prices on external lines remain provider-owned. */
data class CommerceCheckoutRequest(
    val organizationId: String,
    val transactionId: String,
    val storeId: String?,
    val customerUserId: String?,
    val sourceChannel: String,
    val idempotencyKey: String,
    val lines: List<CommerceTransactionLineDto>,
    val adjustments: List<CommerceTransactionAdjustmentDto>,
    val currencyCode: String?,
    /** Server-supplied integration context; never derived from a client request by a provider adapter. */
    val integrationConfigurationId: String? = null,
    /** Server-supplied actor used only by an authorized integration-configuration resolver. */
    val actorUserId: String? = null,
    /** Server-materialized Benefit/Offer outcomes. Providers must not evaluate eligibility. */
    val materializedAdjustments: List<CommerceCheckoutAdjustment> = emptyList(),
    /** Server-authoritative tax for internally priced membership checkout. */
    val authoritativeTaxTotalMinor: Long? = null,
    /** Server-authoritative final total for internally priced membership checkout. */
    val authoritativeTotalMinor: Long? = null
)

data class CommerceCheckoutAdjustment(
    val adjustmentId: String,
    val targetLineId: String? = null,
    val sourceType: String,
    val sourceId: String,
    val adjustmentType: String,
    val appliedAmountMinor: Long
)

data class CommerceCheckoutResult(
    val providerOrderId: String? = null,
    val providerTransactionId: String? = null,
    val providerStatus: String,
    val subtotalMinor: Long? = null,
    val adjustmentTotalMinor: Long? = null,
    val taxTotalMinor: Long? = null,
    val totalMinor: Long? = null,
    val currencyCode: String? = null,
    val failureCode: String? = null,
    val failureMessage: String? = null
)

@Serializable
data class CommerceTerminalPaymentInstruction(
    val commerceTransactionId: String,
    val providerCode: String,
    val providerOrderId: String,
    val amountMinor: Long,
    val currencyCode: String,
    val referenceId: String
)

@Serializable
data class CommerceTerminalPaymentResultRequest(
    val providerTransactionId: String?,
    val providerStatus: String,
    val amountMinor: Long,
    val currencyCode: String,
    val failureCode: String? = null,
    val failureMessage: String? = null
)

@Serializable
data class CommerceCatalogConfigurationWriteDto(
    val applicationId: String,
    val providerBusinessId: String,
    val providerStoreId: String? = null,
    val credentialSecretReference: String,
    val merchantCurrencyCode: String
)

@Serializable
data class CommerceRemoteTerminalPaymentStartRequest(val posDeviceId: String)
@Serializable
data class CommerceRemoteTerminalPaymentDispatchDto(val commerceTransactionId: String, val referenceId: String, val status: String)
