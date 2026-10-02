package com.mynikatech.memgine.component.redemption

import com.mynikatech.memgine.net.dto.OrgAdminRedemptionDto
import com.mynikatech.memgine.net.dto.RedemptionTransactionDto
import com.mynikatech.memgine.net.dto.RedemptionTransactionValidationDto
import com.mynikatech.memgine.net.dto.RedemptionTransactionQrIssueRow
import org.jdbi.v3.sqlobject.customizer.Bind
import org.jdbi.v3.sqlobject.config.RegisterBeanMapper
import org.jdbi.v3.sqlobject.statement.SqlQuery

interface RedemptionSql {
    @SqlQuery("SELECT can_administer_organization(:organizationId, :actorUserId)")
    fun canAdminister(@Bind("organizationId") organizationId: String,
                      @Bind("actorUserId") actorUserId: String): Boolean

    @SqlQuery("SELECT * FROM get_organization_redemptions_admin(:organizationId, :actorUserId)")
    fun listForOrganization(@Bind("organizationId") organizationId: String,
                            @Bind("actorUserId") actorUserId: String): List<OrgAdminRedemptionDto>

    @SqlQuery("SELECT * FROM create_counter_redemption_transaction(:organizationId, :storeId, :staffId, :subscriptionId, :benefitIds, :offerIds, :redemptionMethod, :actorUserId)")
    fun createCounterTransaction(
        @Bind("organizationId") organizationId: String,
        @Bind("storeId") storeId: String,
        @Bind("staffId") staffId: String,
        @Bind("subscriptionId") subscriptionId: String,
        @Bind("benefitIds") benefitIds: Array<String>,
        @Bind("offerIds") offerIds: Array<String>,
        @Bind("redemptionMethod") redemptionMethod: String,
        @Bind("actorUserId") actorUserId: String
    ): RedemptionTransactionDto?

    @SqlQuery("SELECT * FROM create_customer_redemption_transaction(:organizationId, :subscriptionId, :benefitIds, :offerIds, :redemptionMethod, :actorUserId)")
    fun createCustomerTransaction(
        @Bind("organizationId") organizationId: String,
        @Bind("subscriptionId") subscriptionId: String,
        @Bind("benefitIds") benefitIds: Array<String>,
        @Bind("offerIds") offerIds: Array<String>,
        @Bind("redemptionMethod") redemptionMethod: String,
        @Bind("actorUserId") actorUserId: String
    ): RedemptionTransactionDto?

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
