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
import com.mynikatech.memgine.net.dto.CanonicalProductRow
import org.jdbi.v3.sqlobject.config.RegisterBeanMapper
import org.jdbi.v3.sqlobject.customizer.Bind
import org.jdbi.v3.sqlobject.statement.SqlQuery
import org.jdbi.v3.sqlobject.kotlin.RegisterKotlinMapper

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

data class CustomerSelfProfileRow(
    var userId: String = "", var firstName: String = "", var middleName: String? = null,
    var lastName: String? = null, var displayName: String? = null, var primaryEmail: String? = null,
    var primaryPhone: String = "", var versionNo: Int = 0
)

interface CustomerSql {
    @SqlQuery("SELECT * FROM customer_get_self_profile(:userId)")
    @RegisterBeanMapper(CustomerSelfProfileRow::class)
    fun selfProfile(@Bind("userId") userId: String): CustomerSelfProfileRow?

    @SqlQuery("SELECT * FROM customer_save_self_profile(:userId, :firstName, :middleName, :lastName, :primaryEmail, :expectedVersion)")
    @RegisterBeanMapper(CustomerSelfProfileRow::class)
    fun saveSelfProfile(
        @Bind("userId") userId: String, @Bind("firstName") firstName: String,
        @Bind("middleName") middleName: String?, @Bind("lastName") lastName: String?,
        @Bind("primaryEmail") primaryEmail: String?, @Bind("expectedVersion") expectedVersion: Int
    ): CustomerSelfProfileRow?

    @SqlQuery("SELECT * FROM customer_confirm_self_phone_change(:userId, :expectedOldPhone, :newPhone)")
    @RegisterBeanMapper(CustomerSelfProfileRow::class)
    fun confirmSelfPhoneChange(
        @Bind("userId") userId: String, @Bind("expectedOldPhone") expectedOldPhone: String,
        @Bind("newPhone") newPhone: String
    ): CustomerSelfProfileRow?

    @SqlQuery("SELECT * FROM get_customer_discoverable_organizations()")
    fun discoverableOrganizations(): List<CustomerDiscoverableOrganizationDto>

    @SqlQuery("SELECT * FROM get_customer_discoverable_organization(:organizationId)")
    @RegisterBeanMapper(CustomerDiscoveryDetailRow::class)
    fun discoverableOrganization(
        @Bind("organizationId") organizationId: String,
    ): CustomerDiscoveryDetailRow?

    @SqlQuery("SELECT primary_phone FROM \"user\" WHERE user_id = :userId AND is_deleted = false")
    fun userPhone(@Bind("userId") userId: String): String?

    @SqlQuery("SELECT EXISTS(SELECT 1 FROM \"user\" WHERE primary_phone = :phone AND NOT is_deleted AND user_id <> :userId)")
    fun phoneAssignedToAnotherUser(
        @Bind("phone") phone: String,
        @Bind("userId") userId: String,
    ): Boolean
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
    @RegisterKotlinMapper(OfferDto::class)
    fun offers(@Bind("organizationId") organizationId: String,
               @Bind("userId") userId: String): List<OfferDto>

    @SqlQuery("SELECT * FROM get_offer_products(:organizationId)")
    @RegisterKotlinMapper(CanonicalProductRow::class)
    fun offerProducts(@Bind("organizationId") organizationId: String): List<CanonicalProductRow>

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
                                  
    @SqlQuery("""
        SELECT * FROM customer_activate_zero_total_membership(
            :organizationId,
            :customerUserId,
            :planId,
            :explicitOfferId,
            :idempotencyKey,
            :actorUserId
        )
    """)
    fun activateZeroTotalMembership(
        @Bind("organizationId") organizationId: String,
        @Bind("customerUserId") customerUserId: String,
        @Bind("planId") planId: String,
        @Bind("explicitOfferId") explicitOfferId: String?,
        @Bind("idempotencyKey") idempotencyKey: String,
        @Bind("actorUserId") actorUserId: String,
    ): CounterPurchaseResult?

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
                       
    @SqlQuery("SELECT customer_can_start_membership_purchase(:organizationId, :userId)")
    fun customerCanStartMembershipPurchase(
        @Bind("organizationId") organizationId: String,
        @Bind("userId") userId: String,
    ): Boolean
    
    @SqlQuery("""
        SELECT row_to_json(e)::text
        FROM customer_membership_purchase_eligibility(
            :organizationId,
            :userId
        ) e
    """)
    fun customerMembershipPurchaseEligibility(
        @Bind("organizationId") organizationId: String,
        @Bind("userId") userId: String,
    ): String

    @SqlQuery("SELECT record_membership_agreement_acceptance(:acceptanceId, :organizationId, :userId, :membershipProductId, :purchaseReference, :acceptanceChannel, :agreementText, :agreementSha256, CAST(:snapshotJson AS jsonb))::text")
    fun recordMembershipAgreementAcceptance(
        @Bind("acceptanceId") acceptanceId: String,
        @Bind("organizationId") organizationId: String,
        @Bind("userId") userId: String,
        @Bind("membershipProductId") membershipProductId: String,
        @Bind("purchaseReference") purchaseReference: String,
        @Bind("acceptanceChannel") acceptanceChannel: String,
        @Bind("agreementText") agreementText: String,
        @Bind("agreementSha256") agreementSha256: String,
        @Bind("snapshotJson") snapshotJson: String,
    ): String?

    @SqlQuery("SELECT customer_has_membership_agreement(:organizationId, :userId, :planId, :purchaseReference, :offerId, :agreementSha256)")
    fun customerHasMembershipAgreement(
        @Bind("organizationId") organizationId: String,
        @Bind("userId") userId: String,
        @Bind("planId") planId: String,
        @Bind("purchaseReference") purchaseReference: String,
        @Bind("offerId") offerId: String?,
        @Bind("agreementSha256") agreementSha256: String,
    ): Boolean

    @SqlQuery("SELECT customer_existing_membership_payment(:organizationId, :userId, :planId, :purchaseReference)")
    fun customerExistingMembershipPayment(
        @Bind("organizationId") organizationId: String,
        @Bind("userId") userId: String,
        @Bind("planId") planId: String,
        @Bind("purchaseReference") purchaseReference: String,
    ): Boolean

    @SqlQuery("SELECT get_customer_membership_agreements(:organizationId, :userId)::text")
    fun customerMembershipAgreements(
        @Bind("organizationId") organizationId: String,
        @Bind("userId") userId: String,
    ): String

}
