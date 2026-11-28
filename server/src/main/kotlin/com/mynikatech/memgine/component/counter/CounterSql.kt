package com.mynikatech.memgine.component.counter

import com.mynikatech.memgine.net.dto.*
import org.jdbi.v3.sqlobject.customizer.Bind
import org.jdbi.v3.sqlobject.config.RegisterBeanMapper
import org.jdbi.v3.sqlobject.statement.SqlQuery

data class CounterRedemptionItemStatusRow(
    var itemId: String = "",
    var itemType: String = "",
    var status: String = "",
    var displayReason: String? = null
)
data class StaffAssistedPurchaseRow(
    var storeId: String = "",
    var staffId: String = "",
    var customerUserId: String = "",
    var planId: String = "",
    var purchaseMode: String = ""
)

interface CounterSql {
    @SqlQuery("SELECT get_counter_order_collection_extension(:org,:store,:staff,:actor,:order)")
    fun collectionExtension(@Bind("org") org: String, @Bind("store") store: String, @Bind("staff") staff: String, @Bind("actor") actor: String, @Bind("order") order: String): String?

    @SqlQuery("SELECT counter_order_collection_extension(:org,:store,:staff,:actor,:order,:version,:action,:request,CAST(:local AS timestamp),:reason)")
    fun changeCollectionExtension(@Bind("org") org: String, @Bind("store") store: String, @Bind("staff") staff: String, @Bind("actor") actor: String, @Bind("order") order: String, @Bind("version") version: Int, @Bind("action") action: String, @Bind("request") request: String?, @Bind("local") local: String?, @Bind("reason") reason: String?): String

    @SqlQuery("SELECT bind_counter_redemption_otp(:org,:redemption,:challenge,:actor)")
    fun bindRedemptionOtp(@Bind("org") org: String, @Bind("redemption") redemption: String,
        @Bind("challenge") challenge: String, @Bind("actor") actor: String): Boolean

    @SqlQuery("SELECT counter_order_pickup_otp_target(:org,:store,:staff,:actor,:order,:challenge)")
    fun orderPickupOtpTarget(@Bind("org") org: String, @Bind("store") store: String, @Bind("staff") staff: String,
        @Bind("actor") actor: String, @Bind("order") order: String, @Bind("challenge") challenge: String?): String?

    @SqlQuery("SELECT get_counter_order_lifecycle(:org,:store,:staff,:actor,:order)")
    fun orderLifecycle(@Bind("org") org: String, @Bind("store") store: String, @Bind("staff") staff: String,
        @Bind("actor") actor: String, @Bind("order") order: String): String?

    @SqlQuery("SELECT update_counter_order_lifecycle(:org,:store,:staff,:actor,:order,:version,:command,:hash)")
    fun updateOrderLifecycle(@Bind("org") org: String, @Bind("store") store: String, @Bind("staff") staff: String,
        @Bind("actor") actor: String, @Bind("order") order: String, @Bind("version") version: Int,
        @Bind("command") command: String, @Bind("hash") hash: String?): String

    @SqlQuery("SELECT counter_order_decide_cancellation(:org,:store,:staff,:actor,:order,:version,:decision,:reason)")
    fun decideOrderCancellation(@Bind("org") org: String, @Bind("store") store: String, @Bind("staff") staff: String,
        @Bind("actor") actor: String, @Bind("order") order: String, @Bind("version") version: Int,
        @Bind("decision") decision: String, @Bind("reason") reason: String): String

    @SqlQuery("SELECT counter_order_support_candidates(:org,:store,:staff,:actor,:order,:search,:limit)::text")
    fun orderSupportCandidates(@Bind("org") org: String, @Bind("store") store: String,
        @Bind("staff") staff: String, @Bind("actor") actor: String, @Bind("order") order: String,
        @Bind("search") search: String?, @Bind("limit") limit: Int): String

    @SqlQuery("SELECT counter_order_report_no_show(:org,:store,:staff,:actor,:order,:version,:reason)::text")
    fun reportOrderNoShow(@Bind("org") org: String, @Bind("store") store: String,
        @Bind("staff") staff: String, @Bind("actor") actor: String, @Bind("order") order: String,
        @Bind("version") version: Int, @Bind("reason") reason: String): String

    @SqlQuery("SELECT counter_verify_six_digit_code(:org,:store,:staff,:actor,:hash,:previous,:expected)")
    fun authorizePickupCode(@Bind("org") org: String, @Bind("store") store: String, @Bind("staff") staff: String,
        @Bind("actor") actor: String, @Bind("hash") hash: String, @Bind("previous") previous: String,
        @Bind("expected") expected: String?): String

    @SqlQuery("SELECT verify_counter_pickup_qr(:org,:store,:staff,:actor,:hash)")
    fun verifyPickup(@Bind("org") org: String, @Bind("store") store: String, @Bind("staff") staff: String,
        @Bind("actor") actor: String, @Bind("hash") hash: String): String

    @SqlQuery("SELECT lookup_counter_pickup_order_reference(:org,:store,:staff,:actor,:reference)")
    fun pickupOrderReference(@Bind("org") org: String, @Bind("store") store: String, @Bind("staff") staff: String,
        @Bind("actor") actor: String, @Bind("reference") reference: String): String

    @SqlQuery("SELECT get_counter_order_stores(:org,:actor,:staff,:store)")
    fun orderStores(@Bind("org") org: String, @Bind("actor") actor: String,
        @Bind("staff") staff: String?, @Bind("store") store: String?): String

    @SqlQuery("SELECT get_counter_fulfillment_orders(:org,:store,:staff,:actor,:orderId,:status,:search,:pickup,:limit,:offset)")
    fun orders(@Bind("org") org: String, @Bind("store") store: String, @Bind("staff") staff: String,
        @Bind("actor") actor: String, @Bind("orderId") orderId: String?, @Bind("status") status: String?,
        @Bind("search") search: String?, @Bind("pickup") pickup: java.time.LocalDate?,
        @Bind("limit") limit: Int, @Bind("offset") offset: Int): String?
    @SqlQuery("""SELECT counter_prepare_purchase_identity(
        :counterPurchaseId, :organizationId, :storeId, :staffId,
        :customerUserId, :planId, :actorUserId)""")
    fun preparePurchaseIdentity(
        @Bind("counterPurchaseId") counterPurchaseId: String?,
        @Bind("organizationId") organizationId: String,
        @Bind("storeId") storeId: String,
        @Bind("staffId") staffId: String,
        @Bind("customerUserId") customerUserId: String,
        @Bind("planId") planId: String,
        @Bind("actorUserId") actorUserId: String
    ): String

    @SqlQuery("""
        SELECT counter_prepare_staff_assisted_purchase(
            :organizationId, :storeId, :staffId,
            :customerUserId, :planId, :actorUserId
        )
    """)
    fun prepareStaffAssistedPurchase(
        @Bind("organizationId") organizationId: String,
        @Bind("storeId") storeId: String,
        @Bind("staffId") staffId: String,
        @Bind("customerUserId") customerUserId: String,
        @Bind("planId") planId: String,
        @Bind("actorUserId") actorUserId: String
    ): String

    @SqlQuery("""
        SELECT * FROM counter_resolve_staff_assisted_purchase(
            :organizationId, :counterPurchaseId, :actorUserId
        )
    """)
    @RegisterBeanMapper(StaffAssistedPurchaseRow::class)
    fun resolveStaffAssistedPurchase(
        @Bind("organizationId") organizationId: String,
        @Bind("counterPurchaseId") counterPurchaseId: String,
        @Bind("actorUserId") actorUserId: String
    ): StaffAssistedPurchaseRow?

    @SqlQuery("""SELECT counter_bind_purchase_otp_context(
        :counterPurchaseId, :challengeId, :organizationId, :storeId,
        :staffId, :customerUserId, :planId)""")
    fun bindPurchaseOtpContext(
        @Bind("counterPurchaseId") counterPurchaseId: String,
        @Bind("challengeId") challengeId: String,
        @Bind("organizationId") organizationId: String,
        @Bind("storeId") storeId: String,
        @Bind("staffId") staffId: String,
        @Bind("customerUserId") customerUserId: String,
        @Bind("planId") planId: String
    ): Boolean

    @SqlQuery("SELECT counter_can_operate(:organizationId, :storeId, :staffId, :actorUserId)")
    fun canOperate(@Bind("organizationId") organizationId: String,
                   @Bind("storeId") storeId: String, @Bind("staffId") staffId: String,
                   @Bind("actorUserId") actorUserId: String): Boolean

    @SqlQuery("""SELECT * FROM counter_membership_purchase_offer_quote(
        :organizationId, :storeId, :staffId, :customerUserId, :planId, :actorUserId, :explicitOfferId)""")
    fun purchaseQuote(
        @Bind("organizationId") organizationId: String,
        @Bind("storeId") storeId: String,
        @Bind("staffId") staffId: String,
        @Bind("customerUserId") customerUserId: String?,
        @Bind("planId") planId: String,
        @Bind("actorUserId") actorUserId: String,
        @Bind("explicitOfferId") explicitOfferId: String?
    ): CounterMembershipPurchaseQuoteDto?

    @SqlQuery("""SELECT * FROM resolve_counter_membership_purchase_offer_qr(
        :organizationId, :storeId, :staffId, :token, :actorUserId)""")
    fun resolveMembershipPurchaseOfferQr(
        @Bind("organizationId") organizationId: String,
        @Bind("storeId") storeId: String,
        @Bind("staffId") staffId: String,
        @Bind("token") token: String,
        @Bind("actorUserId") actorUserId: String
    ): CounterMembershipOfferQrDto?

    @SqlQuery("SELECT get_counter_staff_name(:organizationId, :staffId)")
    fun staffName(@Bind("organizationId") organizationId: String,
                  @Bind("staffId") staffId: String): String?

    @SqlQuery("""SELECT q.qr_code_type_id FROM qr_codes q
        JOIN entity_status es ON es.entity_status_id = q.status_id
        JOIN statuses st ON st.status_id = es.status_id
        WHERE q.organization_id = :organizationId AND q.qr_code_token = :token
          AND q.is_deleted = false AND st.status_code = 'ACTIVE'""")
    fun qrCodeType(@Bind("organizationId") organizationId: String,
                   @Bind("token") token: String): String?

    @SqlQuery("SELECT * FROM get_counter_customers(:organizationId, :actorUserId)")
    fun customers(
        @Bind("organizationId") organizationId: String,
        @Bind("actorUserId") actorUserId: String
    ): List<OrgAdminCustomerDto>

    @SqlQuery("SELECT * FROM counter_lookup_customer(:organizationId, :phone, :actorUserId)")
    fun lookupCustomer(
        @Bind("organizationId") organizationId: String,
        @Bind("phone") phone: String,
        @Bind("actorUserId") actorUserId: String
    ): CounterCustomerLookupDto?

    @SqlQuery(
        """
        SELECT counter_create_prospective_customer(
            :organizationId,
            :storeId,
            :staffId,
            :firstName,
            NULL,
            :lastName,
            NULL,
            :primaryEmail,
            :primaryPhone,
            :actorUserId
        )
        """
    )
    fun createProspectiveCustomer(
        @Bind("organizationId") organizationId: String,
        @Bind("storeId") storeId: String,
        @Bind("staffId") staffId: String,
        @Bind("firstName") firstName: String,
        @Bind("lastName") lastName: String,
        @Bind("primaryEmail") primaryEmail: String?,
        @Bind("primaryPhone") primaryPhone: String,
        @Bind("actorUserId") actorUserId: String
    ): String

    @SqlQuery("SELECT * FROM get_counter_subscriptions(:organizationId, :actorUserId)")
    fun subscriptions(@Bind("organizationId") organizationId: String,
                      @Bind("actorUserId") actorUserId: String): List<CounterSubscriptionDto>

    @SqlQuery("SELECT * FROM get_counter_redemptions(:organizationId, :actorUserId)")
    fun redemptions(
        @Bind("organizationId") organizationId: String,
        @Bind("actorUserId") actorUserId: String
    ): List<OrgAdminRedemptionDto>

    @SqlQuery("""SELECT * FROM counter_purchase_subscription(
        :organizationId, :storeId, :staffId, :planId, :customerUserId,
        :firstName, :lastName, :primaryEmail, :primaryPhone, :actorUserId)""")
    fun purchase(@Bind("organizationId") organizationId: String,
                 @Bind("storeId") storeId: String, @Bind("staffId") staffId: String,
                 @Bind("planId") planId: String, @Bind("customerUserId") customerUserId: String?,
                 @Bind("firstName") firstName: String?, @Bind("lastName") lastName: String?,
                 @Bind("primaryEmail") primaryEmail: String?, @Bind("primaryPhone") primaryPhone: String?,
                 @Bind("actorUserId") actorUserId: String): CounterPurchaseResult?

    @SqlQuery("SELECT counter_benefit_rejection(:organizationId, :subscriptionId, :benefitId)")
    fun rejection(@Bind("organizationId") organizationId: String,
                  @Bind("subscriptionId") subscriptionId: String,
                  @Bind("benefitId") benefitId: String): String?

    @SqlQuery("""SELECT * FROM counter_redeem_benefits(
        :organizationId, :storeId, :staffId, :subscriptionId, :benefitIds, :actorUserId)""")
    fun redeem(@Bind("organizationId") organizationId: String,
               @Bind("storeId") storeId: String, @Bind("staffId") staffId: String,
               @Bind("subscriptionId") subscriptionId: String,
               @Bind("benefitIds") benefitIds: Array<String>,
               @Bind("actorUserId") actorUserId: String): List<CounterRedemptionResult>

    @SqlQuery("""SELECT q.qr_code_token AS token, q.qr_code_type_id AS "qrCodeTypeId",
        q.target_entity_id AS "subscriptionId", ou.user_id AS "customerUserId",
        COALESCE(NULLIF(u.display_name, ''), concat_ws(' ', u.first_name, u.last_name)) AS "customerName"
        FROM qr_codes q
        JOIN subscriptions s ON s.subscription_id = q.target_entity_id AND s.is_deleted = false
        JOIN organization_user ou ON ou.organization_user_id = s.organization_user_id
        JOIN "user" u ON u.user_id = ou.user_id
        JOIN entity_status es ON es.entity_status_id = q.status_id
        JOIN statuses st ON st.status_id = es.status_id
        WHERE q.organization_id = :organizationId AND ou.organization_id = :organizationId
          AND q.is_deleted = false AND st.status_code = 'ACTIVE'
          AND q.qr_code_type_id = 'QR_BENEFIT_REDEMPTION'
          AND q.target_entity_type = 'subscription-benefit-redemption'
          AND (:token IS NULL OR q.qr_code_token = :token)
        ORDER BY q.qr_code_id""")
    fun qrCodes(@Bind("organizationId") organizationId: String,
                @Bind("token") token: String?): List<CounterQrDto>

    @SqlQuery("""
        SELECT *
        FROM get_counter_subscription_benefits(
            :organizationId,
            :subscriptionId,
            :actorUserId
        )
    """)
    fun subscriptionBenefits(
        @Bind("organizationId") organizationId: String,
        @Bind("subscriptionId") subscriptionId: String,
        @Bind("actorUserId") actorUserId: String
    ): List<BenefitDto>


    // Reuse canonical entitlement statuses. Only replace a non-available status
    // when exactly one active, same-customer, same-store reservation is found.


    @SqlQuery("""
        SELECT
            item."itemId" AS "itemId",
            item."itemType" AS "itemType",

            CASE
                WHEN reserved_order.reference IS NULL
                     OR reserved_location.store_id IS NULL
                    THEN item.status

                WHEN reserved_location.store_id = :storeId
                    THEN 'RESERVED_FOR_ORDER'

                ELSE 'RESERVED_OTHER_STORE'
            END AS status,

            CASE
                WHEN reserved_order.reference IS NULL
                     OR reserved_location.store_id IS NULL
                    THEN item."displayReason"

                WHEN reserved_location.store_id = :storeId
                    THEN 'Reserved for Order ' ||
                         reserved_order.reference

                ELSE 'Reserved at ' ||
                     reserved_location.store_name
            END AS "displayReason"

        FROM get_customer_redemption_item_status(
            :organizationId,
            :subscriptionId,
            :customerUserId
        ) AS item

        LEFT JOIN LATERAL (
            SELECT counter_reserved_order_reference_for_item(
                :organizationId,
                :storeId,
                :staffId,
                :actorUserId,
                :subscriptionId,
                :customerUserId,
                item."itemType",
                item."itemId"
            ) AS reference
        ) AS reserved_order ON TRUE

        LEFT JOIN LATERAL (
            SELECT
                fulfillment.store_id,
                store.store_name

            FROM fulfillments fulfillment

            JOIN stores store
              ON store.store_id = fulfillment.store_id
             AND store.organization_id = fulfillment.organization_id

            JOIN commerce_transactions commerce
              ON commerce.commerce_transaction_id =
                 fulfillment.commerce_transaction_id
             AND commerce.organization_id = :organizationId
             AND commerce.customer_user_id = :customerUserId
             AND commerce.subscription_id = :subscriptionId
             AND commerce.store_id = fulfillment.store_id
             AND commerce.source_channel = 'CUSTOMER_FULFILLMENT'
             AND NOT commerce.is_deleted

            JOIN redemption_transaction redemption
              ON redemption.redemption_transaction_id =
                 fulfillment.redemption_transaction_id
             AND redemption.organization_id = :organizationId
             AND redemption.subscription_id = :subscriptionId
             AND redemption.store_id = fulfillment.store_id
             AND redemption.status = 'RESERVED'

            JOIN redemption_transaction_item redemption_item
              ON redemption_item.redemption_transaction_id =
                 redemption.redemption_transaction_id
             AND redemption_item.item_type = item."itemType"
             AND (
                 (
                     item."itemType" = 'BENEFIT'
                     AND redemption_item.benefit_id = item."itemId"
                 )
                 OR
                 (
                     item."itemType" = 'OFFER'
                     AND redemption_item.offer_id = item."itemId"
                 )
             )

            JOIN redemption_entitlement_reservations reservation
              ON reservation.fulfillment_id = fulfillment.fulfillment_id
             AND reservation.redemption_transaction_item_id =
                 redemption_item.redemption_transaction_item_id
             AND reservation.reserved_quantity >
                 COALESCE(reservation.consumed_quantity, 0)
                 + COALESCE(reservation.released_quantity, 0)

            JOIN statuses reservation_status
              ON reservation_status.status_id =
                 reservation.reservation_status_id
             AND reservation_status.status_code = 'RESERVED'

            WHERE fulfillment.organization_id = :organizationId
              AND fulfillment.customer_user_id = :customerUserId
              AND fulfillment.fulfillment_number =
                  reserved_order.reference

            ORDER BY fulfillment.fulfillment_id
            LIMIT 1
        ) AS reserved_location ON TRUE
    """)
    @RegisterBeanMapper(CounterRedemptionItemStatusRow::class)
    fun redemptionItemStatuses(
        @Bind("organizationId") organizationId: String,
        @Bind("subscriptionId") subscriptionId: String,
        @Bind("customerUserId") customerUserId: String,
        @Bind("storeId") storeId: String,
        @Bind("staffId") staffId: String,
        @Bind("actorUserId") actorUserId: String
    ): List<CounterRedemptionItemStatusRow>

    @SqlQuery(
        "SELECT counter_order_lifecycle_with_notifications(" +
            ":org,:store,:staff,:actor,:order,:version,:command,:hash)::text"
    )
    fun updateOrderLifecycleWithNotifications(
        @Bind("org") org: String,
        @Bind("store") store: String,
        @Bind("staff") staff: String,
        @Bind("actor") actor: String,
        @Bind("order") order: String,
        @Bind("version") version: Int,
        @Bind("command") command: String,
        @Bind("hash") hash: String?
    ): String

    @SqlQuery(
        "SELECT counter_collection_extension_with_notifications(" +
            ":org,:store,:staff,:actor,:order,:version,:action,:request," +
            "CAST(:local AS timestamp),:reason)::text"
    )
    fun changeCollectionExtensionWithNotifications(
        @Bind("org") org: String,
        @Bind("store") store: String,
        @Bind("staff") staff: String,
        @Bind("actor") actor: String,
        @Bind("order") order: String,
        @Bind("version") version: Int,
        @Bind("action") action: String,
        @Bind("request") request: String?,
        @Bind("local") local: String?,
        @Bind("reason") reason: String?
    ): String

    @SqlQuery(
        "SELECT counter_cancellation_with_notifications(" +
            ":org,:store,:staff,:actor,:order,:version,:decision,:reason)::text"
    )
    fun decideOrderCancellationWithNotifications(
        @Bind("org") org: String,
        @Bind("store") store: String,
        @Bind("staff") staff: String,
        @Bind("actor") actor: String,
        @Bind("order") order: String,
        @Bind("version") version: Int,
        @Bind("decision") decision: String,
        @Bind("reason") reason: String
    ): String




    @SqlQuery("SELECT * FROM get_customer_offers(:organizationId, :customerUserId)")
    fun customerOffers(
        @Bind("organizationId") organizationId: String,
        @Bind("customerUserId") customerUserId: String
    ): List<OfferDto>

}
