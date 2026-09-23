package com.mynikatech.memgine.component.payment

import com.mynikatech.memgine.net.dto.PaymentIntentDto
import org.jdbi.v3.sqlobject.config.RegisterBeanMapper
import org.jdbi.v3.sqlobject.customizer.Bind
import org.jdbi.v3.sqlobject.statement.SqlQuery

@RegisterBeanMapper(CounterPaymentFinalizationRow::class)
interface PaymentSql {
    @SqlQuery("""SELECT * FROM payment_start_membership_intent(
        :intentId, :attemptId, :organizationId, :challengeId, :providerCode, :idempotencyKey, :actorUserId)""")
    fun start(
        @Bind("intentId") intentId: String,
        @Bind("attemptId") attemptId: String,
        @Bind("organizationId") organizationId: String,
        @Bind("challengeId") challengeId: String,
        @Bind("providerCode") providerCode: String,
        @Bind("idempotencyKey") idempotencyKey: String,
        @Bind("actorUserId") actorUserId: String?
    ): PaymentIntentDto?

    @SqlQuery("""SELECT * FROM payment_start_authenticated_membership_intent(
        :intentId, :attemptId, :organizationId, :planId, :customerUserId, :providerCode, :idempotencyKey)""")
    fun startAuthenticated(
        @Bind("intentId") intentId: String,
        @Bind("attemptId") attemptId: String,
        @Bind("organizationId") organizationId: String,
        @Bind("planId") planId: String,
        @Bind("customerUserId") customerUserId: String,
        @Bind("providerCode") providerCode: String,
        @Bind("idempotencyKey") idempotencyKey: String
    ): PaymentIntentDto?

    @SqlQuery("""SELECT * FROM payment_start_customer_membership_intent(
        :intentId, :attemptId, :organizationId, :planId, :customerUserId, :providerCode, :idempotencyKey)""")
    fun startCustomer(
        @Bind("intentId") intentId: String,
        @Bind("attemptId") attemptId: String,
        @Bind("organizationId") organizationId: String,
        @Bind("planId") planId: String,
        @Bind("customerUserId") customerUserId: String,
        @Bind("providerCode") providerCode: String,
        @Bind("idempotencyKey") idempotencyKey: String
    ): PaymentIntentDto?

    @SqlQuery("SELECT * FROM payment_get_intent(:organizationId, :intentId, :actorUserId)")
    fun get(
        @Bind("organizationId") organizationId: String,
        @Bind("intentId") intentId: String,
        @Bind("actorUserId") actorUserId: String
    ): PaymentIntentDto?

    @SqlQuery("SELECT payment_record_result(:intentId, NULL, :status, :providerReferenceId, :failureCode, :failureMessage, :actorUserId)")
    fun recordResult(
        @Bind("intentId") intentId: String,
        @Bind("status") status: String,
        @Bind("providerReferenceId") providerReferenceId: String?,
        @Bind("failureCode") failureCode: String?,
        @Bind("failureMessage") failureMessage: String?,
        @Bind("actorUserId") actorUserId: String
    ): Boolean

    @SqlQuery("SELECT payment_cancel_intent(:organizationId, :intentId, :actorUserId)")
    fun cancel(
        @Bind("organizationId") organizationId: String,
        @Bind("intentId") intentId: String,
        @Bind("actorUserId") actorUserId: String
    ): Boolean

    @SqlQuery("SELECT * FROM payment_finalize_membership(:intentId, :actorUserId)")
    fun finalizeMembership(
        @Bind("intentId") intentId: String,
        @Bind("actorUserId") actorUserId: String
    ): CounterPaymentFinalizationRow?

    @SqlQuery("""SELECT * FROM payment_confirm_successful_membership(
        :intentId, :providerCode, :providerReferenceId, :actorUserId)""")
    fun confirmSuccessfulMembership(
        @Bind("intentId") intentId: String,
        @Bind("providerCode") providerCode: String,
        @Bind("providerReferenceId") providerReferenceId: String,
        @Bind("actorUserId") actorUserId: String
    ): CounterPaymentFinalizationRow?

    @SqlQuery("SELECT payment_set_provider_reference(:intentId, :providerCode, :providerReferenceId, :actorUserId)")
    fun setProviderReference(
        @Bind("intentId") intentId: String,
        @Bind("providerCode") providerCode: String,
        @Bind("providerReferenceId") providerReferenceId: String,
        @Bind("actorUserId") actorUserId: String
    ): String?

    @SqlQuery("""SELECT * FROM payment_confirm_provider_success(
        :intentId, :organizationId, :providerCode, :providerReferenceId, :amountMinor, :currencyCode)""")
    fun confirmProviderSuccess(
        @Bind("intentId") intentId: String,
        @Bind("organizationId") organizationId: String,
        @Bind("providerCode") providerCode: String,
        @Bind("providerReferenceId") providerReferenceId: String,
        @Bind("amountMinor") amountMinor: Long,
        @Bind("currencyCode") currencyCode: String
    ): CounterPaymentFinalizationRow?

    @SqlQuery("SELECT payment_record_provider_failure(:intentId, :organizationId, :providerCode, :providerReferenceId, :status, :failureCode)")
    fun recordProviderFailure(
        @Bind("intentId") intentId: String,
        @Bind("organizationId") organizationId: String,
        @Bind("providerCode") providerCode: String,
        @Bind("providerReferenceId") providerReferenceId: String,
        @Bind("status") status: String,
        @Bind("failureCode") failureCode: String
    ): Boolean

    @SqlQuery("SELECT * FROM payment_get_finalized_membership(:organizationId, :intentId, :actorUserId)")
    fun finalizedMembership(
        @Bind("organizationId") organizationId: String,
        @Bind("intentId") intentId: String,
        @Bind("actorUserId") actorUserId: String
    ): CounterPaymentFinalizationRow?
}

data class CounterPaymentFinalizationRow(
    var subscriptionId: String = "",
    var organizationUserId: String = "",
    var userId: String = "",
    var subscriptionNumber: String = "",
    var subscriptionPlanId: String = "",
    var subscriptionDate: String = "",
    var startDate: String = "",
    var endDate: String = "",
    var subscriptionStatusId: String = "",
    var totalAmount: Double = 0.0,
    var currencyCode: String = ""
)
