package com.mynikatech.memgine.component.customer

import com.mynikatech.memgine.net.dto.OrgAdminCustomerDto
import com.mynikatech.memgine.net.dto.CustomerDiscoverableOrganizationDto
import com.mynikatech.memgine.net.dto.CustomerMembershipPurchaseOfferQrIssueRow
import com.mynikatech.memgine.net.dto.CounterSubscriptionDto
import com.mynikatech.memgine.net.dto.CounterPurchaseResult
import com.mynikatech.memgine.net.dto.CustomerChoiceDto
import com.mynikatech.memgine.net.dto.CustomerRelationshipDto
import com.mynikatech.memgine.net.dto.OrgAdminRedemptionDto
import com.mynikatech.memgine.net.dto.OfferDto
import org.jdbi.v3.sqlobject.config.RegisterBeanMapper
import org.jdbi.v3.sqlobject.customizer.Bind
import org.jdbi.v3.sqlobject.statement.SqlQuery

data class CustomerDiscoveryDetailRow(
    var organizationId: String = "",
    var detailJson: String = "{}",
)

data class CustomerRedemptionItemStatusRow(
    var itemId: String = "",
    var itemType: String = "",
    var status: String = "",
    var displayReason: String? = null,
)

data class CustomerRedemptionTransactionStatusRow(
    var transactionId: String = "",
    var status: String = "",
    var expiresAt: String? = null,
    var completedAt: String? = null,
)

data class CustomerMembershipPurchaseOfferRow(
    var offerId: String = "",
    var displayName: String = "",
    var membershipProductId: String = "",
    var targetSubscriptionPlanId: String? = null,
)

interface CustomerSql {
    @SqlQuery("SELECT * FROM get_customer_discoverable_organizations()")
    fun discoverableOrganizations(): List<CustomerDiscoverableOrganizationDto>

    @SqlQuery("SELECT * FROM get_customer_discoverable_organization(:organizationId)")
    @RegisterBeanMapper(CustomerDiscoveryDetailRow::class)
    fun discoverableOrganization(
        @Bind("organizationId") organizationId: String,
    ): CustomerDiscoveryDetailRow?

    @SqlQuery("SELECT primary_phone FROM \"user\" WHERE user_id = :userId AND is_deleted = false")
    fun userPhone(@Bind("userId") userId: String): String?
    @SqlQuery("SELECT can_administer_organization(:organizationId, :actorUserId)")
    fun canAdminister(@Bind("organizationId") organizationId: String,
                      @Bind("actorUserId") actorUserId: String): Boolean

    @SqlQuery("SELECT * FROM get_organization_customers_admin(:organizationId, :actorUserId)")
    fun list(@Bind("organizationId") organizationId: String,
             @Bind("actorUserId") actorUserId: String): List<OrgAdminCustomerDto>

    @SqlQuery("SELECT * FROM get_customer_dev_choices()")
    fun choices(): List<CustomerChoiceDto>

    @SqlQuery("SELECT * FROM get_customer_relationships(:userId)")
    fun relationships(@Bind("userId") userId: String): List<CustomerRelationshipDto>

    @SqlQuery("SELECT customer_has_active_relationship(:organizationId, :userId)")
    fun hasActiveRelationship(@Bind("organizationId") organizationId: String,
                              @Bind("userId") userId: String): Boolean

    @SqlQuery("SELECT * FROM get_customer_subscriptions(:organizationId, :userId)")
    fun subscriptions(@Bind("organizationId") organizationId: String,
                      @Bind("userId") userId: String): List<CounterSubscriptionDto>

    @SqlQuery("SELECT * FROM get_customer_redemptions(:organizationId, :userId)")
    fun redemptions(@Bind("organizationId") organizationId: String,
                    @Bind("userId") userId: String): List<OrgAdminRedemptionDto>

    @SqlQuery("SELECT * FROM get_customer_redemption_item_status(:organizationId, :subscriptionId, :userId)")
    @RegisterBeanMapper(CustomerRedemptionItemStatusRow::class)
    fun redemptionItemStatuses(
        @Bind("organizationId") organizationId: String,
        @Bind("subscriptionId") subscriptionId: String,
        @Bind("userId") userId: String,
    ): List<CustomerRedemptionItemStatusRow>

    @SqlQuery("SELECT * FROM get_customer_redemption_transaction_status(:organizationId, :transactionId, :userId)")
    @RegisterBeanMapper(CustomerRedemptionTransactionStatusRow::class)
    fun redemptionTransactionStatus(
        @Bind("organizationId") organizationId: String,
        @Bind("transactionId") transactionId: String,
        @Bind("userId") userId: String,
    ): CustomerRedemptionTransactionStatusRow?

    @SqlQuery("SELECT * FROM get_customer_offers(:organizationId, :userId)")
    fun offers(@Bind("organizationId") organizationId: String,
               @Bind("userId") userId: String): List<OfferDto>

    @SqlQuery("SELECT * FROM get_customer_membership_purchase_offer_product_targets(:organizationId, :userId)")
    @RegisterBeanMapper(CustomerMembershipPurchaseOfferRow::class)
    fun membershipPurchaseOffers(
        @Bind("organizationId") organizationId: String,
        @Bind("userId") userId: String,
    ): List<CustomerMembershipPurchaseOfferRow>
    
    @SqlQuery("""SELECT * FROM issue_customer_membership_purchase_offer_qr(
        :organizationId, :userId, :offerId, :tokenHash)""")
    @RegisterBeanMapper(CustomerMembershipPurchaseOfferQrIssueRow::class)
    fun issueMembershipPurchaseOfferQr(
        @Bind("organizationId") organizationId: String,
        @Bind("userId") userId: String,
        @Bind("offerId") offerId: String,
        @Bind("tokenHash") tokenHash: String,
    ): CustomerMembershipPurchaseOfferQrIssueRow?

    @SqlQuery("SELECT id FROM get_customer_join_membership_ids(:organizationId)")
    fun joinMembershipIds(@Bind("organizationId") organizationId: String): List<String>

    @SqlQuery("SELECT id FROM get_customer_join_plan_ids(:organizationId)")
    fun joinPlanIds(@Bind("organizationId") organizationId: String): List<String>

    @SqlQuery("SELECT id FROM get_customer_join_benefit_ids(:organizationId)")
    fun joinBenefitIds(@Bind("organizationId") organizationId: String): List<String>

    @SqlQuery("SELECT id FROM get_customer_visible_store_ids(:organizationId)")
    fun visibleStoreIds(@Bind("organizationId") organizationId: String): List<String>

    @SqlQuery("""SELECT * FROM customer_purchase_subscription(
        :organizationId, :planId, :customerUserId, :firstName,
        :lastName, :primaryEmail, :primaryPhone, :actorUserId)""")
    fun purchase(@Bind("organizationId") organizationId: String,
                 @Bind("planId") planId: String,
                 @Bind("customerUserId") customerUserId: String?,
                 @Bind("firstName") firstName: String?,
                 @Bind("lastName") lastName: String?,
                 @Bind("primaryEmail") primaryEmail: String?,
                 @Bind("primaryPhone") primaryPhone: String?,
                 @Bind("actorUserId") actorUserId: String?): CounterPurchaseResult?

    @SqlQuery("""SELECT * FROM customer_purchase_subscription_authenticated(
        :organizationId, :planId, :customerUserId)""")
    fun purchaseAuthenticated(@Bind("organizationId") organizationId: String,
                              @Bind("planId") planId: String,
                              @Bind("customerUserId") customerUserId: String): CounterPurchaseResult?

    @SqlQuery("SELECT get_customer_preference_value(:userId, :code)")
    fun preference(@Bind("userId") userId: String, @Bind("code") code: String): String?

    @SqlQuery("SELECT set_customer_preference_value(:userId, :code, :value)")
    fun setPreference(@Bind("userId") userId: String, @Bind("code") code: String,
                      @Bind("value") value: String): String

    @SqlQuery("""SELECT create_organization_prospective_customer(
        :organizationId, :firstName, :middleName, :lastName, :displayName,
        :primaryEmail, :primaryPhone, :actorUserId)""")
    fun createProspect(@Bind("organizationId") organizationId: String,
                       @Bind("firstName") firstName: String,
                       @Bind("middleName") middleName: String?,
                       @Bind("lastName") lastName: String,
                       @Bind("displayName") displayName: String?,
                       @Bind("primaryEmail") primaryEmail: String?,
                       @Bind("primaryPhone") primaryPhone: String,
                       @Bind("actorUserId") actorUserId: String): String
}
