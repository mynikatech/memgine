package com.mynikatech.memgine.component.commerce

import org.jdbi.v3.sqlobject.config.RegisterBeanMapper
import org.jdbi.v3.sqlobject.customizer.Bind
import org.jdbi.v3.sqlobject.statement.SqlQuery

data class CommerceIntegrationRow(
    var integrationConfigurationId: String = "",
    var integrationName: String = "",
    var providerCode: String = "",
    var integrationTypeCode: String = ""
)

data class CommerceProductSnapshotRow(
    var snapshotId: String = "",
    var organizationId: String = "",
    var integrationConfigurationId: String = "",
    var storeId: String? = null,
    var externalProductId: String = "",
    var externalVariantId: String? = null,
    var externalSku: String? = null,
    var productName: String = "",
    var description: String? = null,
    var currencyCode: String = "",
    var unitPriceMinorSnapshot: Long = 0,
    var active: Boolean = true,
    var sourceUpdatedAt: String? = null,
    var lastSyncedAt: String = "",
    var versionNo: Int = 1
)

data class CommerceProductMappingRow(
    var mappingId: String = "",
    var organizationId: String = "",
    var integrationConfigurationId: String = "",
    var storeId: String? = null,
    var externalProductId: String = "",
    var externalVariantId: String? = null,
    var externalSku: String? = null,
    var active: Boolean = true,
    var versionNo: Int = 1
)

data class CommerceApplicabilityRow(
    var adjustmentId: String = "",
    var organizationId: String = "",
    var adjustmentType: String = "",
    var percentage: Double? = null,
    var amountMinor: Long? = null,
    var currencyCode: String? = null,
    var active: Boolean = true,
    var versionNo: Int = 1
)

interface CommerceSql {
    @SqlQuery("SELECT * FROM get_organization_commerce_integrations(:organizationId, :actorUserId)")
    @RegisterBeanMapper(CommerceIntegrationRow::class)
    fun integrations(
        @Bind("organizationId") organizationId: String,
        @Bind("actorUserId") actorUserId: String
    ): List<CommerceIntegrationRow>

    @SqlQuery("SELECT * FROM get_commerce_product_snapshots(:organizationId, :actorUserId)")
    @RegisterBeanMapper(CommerceProductSnapshotRow::class)
    fun snapshots(
        @Bind("organizationId") organizationId: String,
        @Bind("actorUserId") actorUserId: String
    ): List<CommerceProductSnapshotRow>

    @SqlQuery("SELECT * FROM get_commerce_product_mappings(:organizationId, :actorUserId)")
    @RegisterBeanMapper(CommerceProductMappingRow::class)
    fun mappings(
        @Bind("organizationId") organizationId: String,
        @Bind("actorUserId") actorUserId: String
    ): List<CommerceProductMappingRow>

    @SqlQuery("SELECT * FROM get_commerce_adjustment_mappings(:organizationId, :adjustmentId, :actorUserId)")
    @RegisterBeanMapper(CommerceProductMappingRow::class)
    fun adjustmentMappings(
        @Bind("organizationId") organizationId: String,
        @Bind("adjustmentId") adjustmentId: String,
        @Bind("actorUserId") actorUserId: String
    ): List<CommerceProductMappingRow>

    @SqlQuery("SELECT * FROM get_benefit_commerce_applicability(:organizationId, :benefitId, :actorUserId)")
    @RegisterBeanMapper(CommerceApplicabilityRow::class)
    fun benefitApplicability(
        @Bind("organizationId") organizationId: String,
        @Bind("benefitId") benefitId: String,
        @Bind("actorUserId") actorUserId: String
    ): CommerceApplicabilityRow?

    @SqlQuery("SELECT * FROM get_offer_commerce_applicability(:organizationId, :offerId, :actorUserId)")
    @RegisterBeanMapper(CommerceApplicabilityRow::class)
    fun offerApplicability(
        @Bind("organizationId") organizationId: String,
        @Bind("offerId") offerId: String,
        @Bind("actorUserId") actorUserId: String
    ): CommerceApplicabilityRow?

    @SqlQuery("""SELECT save_commerce_product_snapshot(
        :organizationId, :integrationConfigurationId, :storeId, :externalProductId,
        :externalVariantId, :externalSku, :productName, :description, :currencyCode,
        :unitPriceMinorSnapshot, :active, CAST(:sourceUpdatedAt AS timestamptz), :actorUserId)""")
    fun saveSnapshot(
        @Bind("organizationId") organizationId: String,
        @Bind("integrationConfigurationId") integrationConfigurationId: String,
        @Bind("storeId") storeId: String?,
        @Bind("externalProductId") externalProductId: String,
        @Bind("externalVariantId") externalVariantId: String?,
        @Bind("externalSku") externalSku: String?,
        @Bind("productName") productName: String,
        @Bind("description") description: String?,
        @Bind("currencyCode") currencyCode: String,
        @Bind("unitPriceMinorSnapshot") unitPriceMinorSnapshot: Long,
        @Bind("active") active: Boolean,
        @Bind("sourceUpdatedAt") sourceUpdatedAt: String?,
        @Bind("actorUserId") actorUserId: String
    ): String

    @SqlQuery("""SELECT save_commerce_product_mapping(
        :organizationId, :integrationConfigurationId, :storeId, :externalProductId,
        :externalVariantId, :externalSku, :active, :actorUserId)""")
    fun saveMapping(
        @Bind("organizationId") organizationId: String,
        @Bind("integrationConfigurationId") integrationConfigurationId: String,
        @Bind("storeId") storeId: String?,
        @Bind("externalProductId") externalProductId: String,
        @Bind("externalVariantId") externalVariantId: String?,
        @Bind("externalSku") externalSku: String?,
        @Bind("active") active: Boolean,
        @Bind("actorUserId") actorUserId: String
    ): String

    @SqlQuery("""SELECT save_benefit_commerce_applicability(
        :organizationId, :entityId, :adjustmentType, CAST(:percentage AS numeric),
        :amountMinor, :currencyCode, :active, :mappingIds, :actorUserId)""")
    fun saveBenefitApplicability(
        @Bind("organizationId") organizationId: String,
        @Bind("entityId") entityId: String,
        @Bind("adjustmentType") adjustmentType: String,
        @Bind("percentage") percentage: Double?,
        @Bind("amountMinor") amountMinor: Long?,
        @Bind("currencyCode") currencyCode: String?,
        @Bind("active") active: Boolean,
        @Bind("mappingIds") mappingIds: Array<String>,
        @Bind("actorUserId") actorUserId: String
    ): String

    @SqlQuery("""SELECT save_offer_commerce_applicability(
        :organizationId, :entityId, :adjustmentType, CAST(:percentage AS numeric),
        :amountMinor, :currencyCode, :active, :mappingIds, :actorUserId)""")
    fun saveOfferApplicability(
        @Bind("organizationId") organizationId: String,
        @Bind("entityId") entityId: String,
        @Bind("adjustmentType") adjustmentType: String,
        @Bind("percentage") percentage: Double?,
        @Bind("amountMinor") amountMinor: Long?,
        @Bind("currencyCode") currencyCode: String?,
        @Bind("active") active: Boolean,
        @Bind("mappingIds") mappingIds: Array<String>,
        @Bind("actorUserId") actorUserId: String
    ): String
    @SqlQuery("SELECT commerce_save_catalog_configuration(:organizationId,:integrationId,:applicationId,:businessId,:providerStoreId,:secretReference,:currencyCode,:actorUserId)")
    fun saveCatalogConfiguration(@Bind("organizationId") organizationId:String,@Bind("integrationId") integrationId:String,@Bind("applicationId") applicationId:String,@Bind("businessId") businessId:String,@Bind("providerStoreId") providerStoreId:String?,@Bind("secretReference") secretReference:String,@Bind("currencyCode") currencyCode:String,@Bind("actorUserId") actorUserId:String):Boolean
    @SqlQuery("SELECT commerce_record_catalog_sync(:organizationId,:integrationId,:storeId,:incremental,:status,:errorCode,:errorMessage,:actorUserId)")
    fun recordCatalogSync(@Bind("organizationId") organizationId:String,@Bind("integrationId") integrationId:String,@Bind("storeId") storeId:String?,@Bind("incremental") incremental:Boolean,@Bind("status") status:String,@Bind("errorCode") errorCode:String?,@Bind("errorMessage") errorMessage:String?,@Bind("actorUserId") actorUserId:String):Boolean
    @SqlQuery("SELECT commerce_create_transaction(:organizationId, :storeId, :customerUserId, :subscriptionId, :integrationConfigurationId, :sourceChannel, :idempotencyKey, :actorUserId)")
    fun createTransaction(@Bind("organizationId") organizationId: String, @Bind("storeId") storeId: String?, @Bind("customerUserId") customerUserId: String?, @Bind("subscriptionId") subscriptionId: String?, @Bind("integrationConfigurationId") integrationConfigurationId: String?, @Bind("sourceChannel") sourceChannel: String, @Bind("idempotencyKey") idempotencyKey: String, @Bind("actorUserId") actorUserId: String): String
    @SqlQuery("SELECT commerce_add_external_product_line(:transactionId, :mappingId, :quantity, :description, :actorUserId)")
    fun addExternalProductLine(@Bind("transactionId") transactionId: String, @Bind("mappingId") mappingId: String, @Bind("quantity") quantity: Int, @Bind("description") description: String, @Bind("actorUserId") actorUserId: String): String
    @SqlQuery("SELECT commerce_add_membership_line(:transactionId, :planId, :quantity, :actorUserId)")
    fun addMembershipLine(@Bind("transactionId") transactionId: String, @Bind("planId") planId: String, @Bind("quantity") quantity: Int, @Bind("actorUserId") actorUserId: String): String
    @SqlQuery("SELECT commerce_attach_redemption(:transactionId, :redemptionTransactionId, :actorUserId)")
    fun attachRedemption(@Bind("transactionId") transactionId: String, @Bind("redemptionTransactionId") redemptionTransactionId: String, @Bind("actorUserId") actorUserId: String): String
    @SqlQuery("SELECT commerce_materialize_adjustment(:transactionId, :sourceType, :sourceId, :targetLineId, :actorUserId)")
    fun materializeAdjustment(@Bind("transactionId") transactionId: String, @Bind("sourceType") sourceType: String, @Bind("sourceId") sourceId: String, @Bind("targetLineId") targetLineId: String?, @Bind("actorUserId") actorUserId: String): String
    @SqlQuery("SELECT commerce_mark_ready(:transactionId, :actorUserId)")
    fun markReady(@Bind("transactionId") transactionId: String, @Bind("actorUserId") actorUserId: String): Boolean
    @SqlQuery("""SELECT commerce_persist_provider_order(
        :transactionId, :providerOrderId, CAST(:linePricesJson AS jsonb), :subtotalMinor,
        :adjustmentTotalMinor, :taxTotalMinor, :totalMinor, :currencyCode, :actorUserId)""")
    fun persistProviderOrder(
        @Bind("transactionId") transactionId: String,
        @Bind("providerOrderId") providerOrderId: String,
        @Bind("linePricesJson") linePricesJson: String,
        @Bind("subtotalMinor") subtotalMinor: Long,
        @Bind("adjustmentTotalMinor") adjustmentTotalMinor: Long,
        @Bind("taxTotalMinor") taxTotalMinor: Long,
        @Bind("totalMinor") totalMinor: Long,
        @Bind("currencyCode") currencyCode: String,
        @Bind("actorUserId") actorUserId: String
    ): Boolean
    @SqlQuery("""SELECT commerce_persist_materialized_provider_order(
        :transactionId, :providerOrderId, CAST(:linePricesJson AS jsonb), CAST(:adjustmentsJson AS jsonb),
        :subtotalMinor, :adjustmentTotalMinor, :taxTotalMinor, :totalMinor, :currencyCode, :actorUserId)""")
    fun persistMaterializedProviderOrder(
        @Bind("transactionId") transactionId: String,
        @Bind("providerOrderId") providerOrderId: String,
        @Bind("linePricesJson") linePricesJson: String,
        @Bind("adjustmentsJson") adjustmentsJson: String,
        @Bind("subtotalMinor") subtotalMinor: Long,
        @Bind("adjustmentTotalMinor") adjustmentTotalMinor: Long,
        @Bind("taxTotalMinor") taxTotalMinor: Long,
        @Bind("totalMinor") totalMinor: Long,
        @Bind("currencyCode") currencyCode: String,
        @Bind("actorUserId") actorUserId: String
    ): Boolean
    @SqlQuery(
        "SELECT commerce_start_terminal_payment(:organizationId, :transactionId, :actorUserId)"
    )
    fun startTerminalPayment(
        @Bind("organizationId") organizationId: String,
        @Bind("transactionId") transactionId: String,
        @Bind("actorUserId") actorUserId: String
    ): Boolean
    @SqlQuery(
        """
        SELECT commerce_record_terminal_payment_result(
            :organizationId,
            :transactionId,
            :providerTransactionId,
            :providerStatus,
            :amountMinor,
            :currencyCode,
            :failureCode,
            :failureMessage,
            :actorUserId
        )
        """
    )
    fun recordTerminalPaymentResult(
        @Bind("organizationId") organizationId: String,
        @Bind("transactionId") transactionId: String,
        @Bind("providerTransactionId") providerTransactionId: String?,
        @Bind("providerStatus") providerStatus: String,
        @Bind("amountMinor") amountMinor: Long,
        @Bind("currencyCode") currencyCode: String,
        @Bind("failureCode") failureCode: String?,
        @Bind("failureMessage") failureMessage: String?,
        @Bind("actorUserId") actorUserId: String
    ): Boolean
    @SqlQuery("SELECT * FROM commerce_get_transaction(:organizationId, :transactionId, :actorUserId)") @RegisterBeanMapper(CommerceTransactionRow::class)
    fun transaction(@Bind("organizationId") organizationId: String, @Bind("transactionId") transactionId: String, @Bind("actorUserId") actorUserId: String): CommerceTransactionRow?
    @SqlQuery("SELECT * FROM commerce_get_transaction_lines(:organizationId, :transactionId, :actorUserId)") @RegisterBeanMapper(CommerceTransactionLineRow::class)
    fun transactionLines(@Bind("organizationId") organizationId: String, @Bind("transactionId") transactionId: String, @Bind("actorUserId") actorUserId: String): List<CommerceTransactionLineRow>
    @SqlQuery("SELECT * FROM commerce_get_transaction_adjustments(:organizationId, :transactionId, :actorUserId)") @RegisterBeanMapper(CommerceTransactionAdjustmentRow::class)
    fun transactionAdjustments(@Bind("organizationId") organizationId: String, @Bind("transactionId") transactionId: String, @Bind("actorUserId") actorUserId: String): List<CommerceTransactionAdjustmentRow>
    @SqlQuery("SELECT * FROM commerce_get_transaction_redemptions(:organizationId, :transactionId, :actorUserId)") @RegisterBeanMapper(CommerceTransactionRedemptionRow::class)
    fun transactionRedemptions(@Bind("organizationId") organizationId: String, @Bind("transactionId") transactionId: String, @Bind("actorUserId") actorUserId: String): List<CommerceTransactionRedemptionRow>
    @SqlQuery("SELECT commerce_record_provider_result(:transactionId, :providerStatus, :providerOrderId, :providerTransactionId, :subtotalMinor, :adjustmentTotalMinor, :taxTotalMinor, :totalMinor, :currencyCode, :failureCode, :failureMessage, :actorUserId)")
    fun recordProviderResult(@Bind("transactionId") transactionId: String, @Bind("providerStatus") providerStatus: String, @Bind("providerOrderId") providerOrderId: String?, @Bind("providerTransactionId") providerTransactionId: String?, @Bind("subtotalMinor") subtotalMinor: Long?, @Bind("adjustmentTotalMinor") adjustmentTotalMinor: Long?, @Bind("taxTotalMinor") taxTotalMinor: Long?, @Bind("totalMinor") totalMinor: Long?, @Bind("currencyCode") currencyCode: String?, @Bind("failureCode") failureCode: String?, @Bind("failureMessage") failureMessage: String?, @Bind("actorUserId") actorUserId: String): Boolean
    @SqlQuery("SELECT commerce_mark_fulfillment_pending(:transactionId, :actorUserId)")
    fun markFulfillmentPending(@Bind("transactionId") transactionId: String, @Bind("actorUserId") actorUserId: String): Boolean
    @SqlQuery("SELECT commerce_complete_fulfillment(:transactionId, :actorUserId)")
    fun completeFulfillment(@Bind("transactionId") transactionId: String, @Bind("actorUserId") actorUserId: String): Boolean
}

data class CommerceTransactionRow(
    var transactionId: String = "", var organizationId: String = "", var storeId: String? = null,
    var customerUserId: String? = null, var subscriptionId: String? = null, var integrationConfigurationId: String? = null,
    var sourceChannel: String = "", var status: String = "", var currencyCode: String? = null,
    var subtotalMinor: Long? = null, var adjustmentTotalMinor: Long? = null, var taxTotalMinor: Long? = null,
    var totalMinor: Long? = null, var providerOrderId: String? = null, var providerTransactionId: String? = null,
    var idempotencyKey: String = "", var failureCode: String? = null, var failureMessage: String? = null,
    var createdAt: String = "", var updatedAt: String = "", var completedAt: String? = null, var versionNo: Int = 1
)
data class CommerceTransactionLineRow(
    var lineId: String = "", var transactionId: String = "", var lineType: String = "", var sourceEntityType: String? = null, var sourceEntityId: String? = null,
    var productMappingId: String? = null, var subscriptionPlanId: String? = null, var externalProductId: String? = null, var externalVariantId: String? = null,
    var description: String = "", var quantity: Int = 1, var unitPriceMinorSnapshot: Long? = null, var unitPriceMinorAuthoritative: Long? = null,
    var lineSubtotalMinor: Long? = null, var currencyCode: String? = null, var priceSource: String = "", var metadataJson: String? = null, var versionNo: Int = 1
)
data class CommerceTransactionAdjustmentRow(
    var adjustmentId: String = "", var transactionId: String = "", var targetLineId: String? = null, var commerceAdjustmentId: String = "", var sourceType: String = "", var sourceId: String = "", var adjustmentType: String = "",
    var percentage: Double? = null, var requestedAmountMinor: Long? = null, var appliedAmountMinor: Long? = null, var currencyCode: String? = null, var status: String = "", var versionNo: Int = 1
)
data class CommerceTransactionRedemptionRow(var associationId: String = "", var transactionId: String = "", var redemptionTransactionId: String = "", var redemptionStatus: String = "", var versionNo: Int = 1)
