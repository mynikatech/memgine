package com.mynikatech.memgine.component.counter

import com.mynikatech.memgine.net.dto.*
import org.jdbi.v3.sqlobject.customizer.Bind
import org.jdbi.v3.sqlobject.statement.SqlQuery

interface CounterSql {
    @SqlQuery("SELECT counter_can_operate(:organizationId, :storeId, :staffId, :actorUserId)")
    fun canOperate(@Bind("organizationId") organizationId: String,
                   @Bind("storeId") storeId: String, @Bind("staffId") staffId: String,
                   @Bind("actorUserId") actorUserId: String): Boolean

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

    @SqlQuery("SELECT * FROM get_organization_customers_admin(:organizationId, :actorUserId)")
    fun customers(@Bind("organizationId") organizationId: String,
                  @Bind("actorUserId") actorUserId: String): List<OrgAdminCustomerDto>

    @SqlQuery("SELECT * FROM get_counter_subscriptions(:organizationId, :actorUserId)")
    fun subscriptions(@Bind("organizationId") organizationId: String,
                      @Bind("actorUserId") actorUserId: String): List<CounterSubscriptionDto>

    @SqlQuery("SELECT * FROM get_organization_redemptions_admin(:organizationId, :actorUserId)")
    fun redemptions(@Bind("organizationId") organizationId: String,
                    @Bind("actorUserId") actorUserId: String): List<OrgAdminRedemptionDto>

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

}
