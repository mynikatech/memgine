package com.mynikatech.memgine.component.redemption

import com.mynikatech.memgine.net.dto.OrgAdminRedemptionDto
import com.mynikatech.memgine.net.dto.RedemptionTransactionDto
import com.mynikatech.memgine.net.dto.RedemptionTransactionValidationDto
import com.mynikatech.memgine.net.dto.RedemptionTransactionQrIssueRow
import org.jdbi.v3.sqlobject.customizer.Bind
import org.jdbi.v3.sqlobject.config.RegisterBeanMapper
import org.jdbi.v3.sqlobject.statement.SqlQuery
import com.mynikatech.memgine.net.dto.RedemptionProductChoiceDto

interface RedemptionSql {
    @SqlQuery("SELECT can_administer_organization(:organizationId, :actorUserId)")
    fun canAdminister(@Bind("organizationId") organizationId: String,
                      @Bind("actorUserId") actorUserId: String): Boolean

    @SqlQuery("SELECT * FROM get_organization_redemptions_admin(:organizationId, :actorUserId)")
    fun listForOrganization(@Bind("organizationId") organizationId: String,
                            @Bind("actorUserId") actorUserId: String): List<OrgAdminRedemptionDto>

    @SqlQuery(
    "SELECT * FROM create_counter_redemption_transaction_with_products(" +
        ":organizationId, :storeId, :staffId, :subscriptionId, " +
        ":benefitIds, :offerIds, :redemptionMethod, " +
        "CAST(:productSelectionsJson AS jsonb), :actorUserId)"
    )fun createCounterTransaction(
        @Bind("organizationId") organizationId: String,
        @Bind("storeId") storeId: String,
        @Bind("staffId") staffId: String,
        @Bind("subscriptionId") subscriptionId: String,
        @Bind("benefitIds") benefitIds: Array<String>,
        @Bind("offerIds") offerIds: Array<String>,
        @Bind("redemptionMethod") redemptionMethod: String,
        @Bind("productSelectionsJson") productSelectionsJson: String,
        @Bind("actorUserId") actorUserId: String
    ): RedemptionTransactionDto?

    @SqlQuery(
    "SELECT * FROM create_customer_redemption_transaction_with_products(" +
        ":organizationId, :subscriptionId, :benefitIds, :offerIds, " +
        ":redemptionMethod, CAST(:productSelectionsJson AS jsonb), :actorUserId)"
    )fun createCustomerTransaction(
        @Bind("organizationId") organizationId: String,
        @Bind("subscriptionId") subscriptionId: String,
        @Bind("benefitIds") benefitIds: Array<String>,
        @Bind("offerIds") offerIds: Array<String>,  
        @Bind("redemptionMethod") redemptionMethod: String,
        @Bind("productSelectionsJson") productSelectionsJson: String,
        @Bind("actorUserId") actorUserId: String
    ): RedemptionTransactionDto?
        
        @SqlQuery(
        "SELECT * FROM redemption_product_choices(" +
            ":organizationId, :subscriptionId, :itemType, :itemId, " +
            ":actorUserId, :storeId, :staffId)"
        )
        @RegisterBeanMapper(RedemptionProductChoiceDto::class)
        fun productChoices(
            @Bind("organizationId") organizationId: String,
            @Bind("subscriptionId") subscriptionId: String,
            @Bind("itemType") itemType: String,
            @Bind("itemId") itemId: String,
            @Bind("actorUserId") actorUserId: String,
            @Bind("storeId") storeId: String?,
            @Bind("staffId") staffId: String?
        ): List<RedemptionProductChoiceDto>

        
            @SqlQuery("""
        SELECT DISTINCT mapping.store_id
        FROM commerce_product_mappings mapping
        JOIN stores store
            ON store.store_id = mapping.store_id
        AND store.organization_id = mapping.organization_id
        AND NOT store.is_deleted
        JOIN integration_configurations integration
            ON integration.integration_configuration_id =
            mapping.integration_configuration_id
        AND integration.organization_id = mapping.organization_id
        AND NOT integration.is_deleted
        JOIN commerce_product_snapshots snapshot
            ON snapshot.organization_id = mapping.organization_id
        AND snapshot.integration_configuration_id =
            mapping.integration_configuration_id
        AND snapshot.store_id IS NOT DISTINCT FROM mapping.store_id
        AND snapshot.external_product_id = mapping.external_product_id
        AND snapshot.external_variant_id IS NOT DISTINCT FROM
            mapping.external_variant_id
        AND NOT snapshot.is_deleted
        AND snapshot.is_active
        LEFT JOIN benefit_store_availability availability
            ON :itemType = 'BENEFIT'
        AND availability.organization_id = mapping.organization_id
        AND availability.benefit_id = :itemId
        WHERE mapping.organization_id = :organizationId
        AND mapping.product_id = :productId
        AND mapping.store_id IS NOT NULL
        AND mapping.is_active
        AND NOT mapping.is_deleted
        AND (
            :itemType <> 'BENEFIT'
            OR availability.availability_mode IS NULL
            OR availability.availability_mode = 'ALL_STORES'
            OR EXISTS (
                SELECT 1
                    FROM benefit_store_availability_store selected
                WHERE selected.organization_id = mapping.organization_id
                    AND selected.benefit_id = :itemId
                    AND selected.store_id = mapping.store_id
                    AND NOT selected.is_deleted
            )
        )
        ORDER BY mapping.store_id
    """)
    fun availableStoreIdsForProductChoice(
        @Bind("organizationId") organizationId: String,
        @Bind("productId") productId: String,
        @Bind("itemType") itemType: String,
        @Bind("itemId") itemId: String
    ): List<String>
    @SqlQuery("SELECT * FROM issue_customer_redemption_transaction_qr(:organizationId, :transactionId, :tokenHash, :actorUserId)")
    @RegisterBeanMapper(RedemptionTransactionQrIssueRow::class)
    fun issueCustomerTransactionQr(
        @Bind("organizationId") organizationId: String,
        @Bind("transactionId") transactionId: String,
        @Bind("tokenHash") tokenHash: String,
        @Bind("actorUserId") actorUserId: String
    ): RedemptionTransactionQrIssueRow?

    @SqlQuery("SELECT * FROM resolve_counter_redemption_transaction_qr(:organizationId, :storeId, :staffId, :tokenHash, :actorUserId)")
    fun resolveCounterTransactionQr(
        @Bind("organizationId") organizationId: String,
        @Bind("storeId") storeId: String,
        @Bind("staffId") staffId: String,
        @Bind("tokenHash") tokenHash: String,
        @Bind("actorUserId") actorUserId: String
    ): RedemptionTransactionDto?

    @SqlQuery("SELECT * FROM get_counter_redemption_transaction_validation_detail(:transactionId, :organizationId, :storeId, :staffId, :actorUserId)")
    fun validateTransaction(
        @Bind("transactionId") transactionId: String,
        @Bind("organizationId") organizationId: String,
        @Bind("storeId") storeId: String,
        @Bind("staffId") staffId: String,
        @Bind("actorUserId") actorUserId: String
    ): List<RedemptionTransactionValidationDto>

    @SqlQuery("SELECT * FROM commerce_execute_counter_redemption_transaction(:transactionId, :organizationId, :storeId, :staffId, :actorUserId)")
    fun executeTransaction(
        @Bind("transactionId") transactionId: String,
        @Bind("organizationId") organizationId: String,
        @Bind("storeId") storeId: String,
        @Bind("staffId") staffId: String,
        @Bind("actorUserId") actorUserId: String
    ): RedemptionTransactionDto?
}
