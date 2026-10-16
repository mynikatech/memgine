package com.mynikatech.memgine.component.payment

import org.jdbi.v3.sqlobject.config.RegisterBeanMapper
import org.jdbi.v3.sqlobject.customizer.Bind
import org.jdbi.v3.sqlobject.statement.SqlQuery
import kotlinx.serialization.Serializable

/** Stage B: evidence-backed, one-per-intent financial review cases. No refunds here. */
interface PoyntCollectFinancialExceptionSql {
    @SqlQuery("SELECT payment_open_collect_financial_exception(:organizationId, :intentId, :actorUserId)")
    fun openCapturedUnfulfilledCase(
        @Bind("organizationId") organizationId: String,
        @Bind("intentId") intentId: String,
        @Bind("actorUserId") actorUserId: String
    ): String

    @SqlQuery("SELECT * FROM payment_recover_collect_financial_exception(:organizationId, :intentId, :actorUserId)")
    @RegisterBeanMapper(CounterPaymentFinalizationRow::class)
    fun recoverCapturedUnfulfilledPayment(
        @Bind("organizationId") organizationId: String,
        @Bind("intentId") intentId: String,
        @Bind("actorUserId") actorUserId: String
    ): CounterPaymentFinalizationRow?
    @SqlQuery("SELECT financial_exception_record_recovery_failure(:organizationId, :intentId, NULL, :actorUserId, :recoveryAttemptId)")
    fun recordRecoveryFailure(
        @Bind("organizationId") organizationId: String,
        @Bind("intentId") intentId: String,
        @Bind("actorUserId") actorUserId: String,
        @Bind("recoveryAttemptId") recoveryAttemptId: String
    ): Boolean
    @SqlQuery("SELECT * FROM payment_get_collect_financial_exception(:organizationId, :intentId, :actorUserId)")
    @RegisterBeanMapper(PoyntCollectFinancialExceptionRow::class)
    fun getCustomerCase(
        @Bind("organizationId") organizationId: String,
        @Bind("intentId") intentId: String,
        @Bind("actorUserId") actorUserId: String
    ): PoyntCollectFinancialExceptionRow?
}

@Serializable
data class PoyntCollectFinancialExceptionRow(
    var financialExceptionId: String = "",
    var paymentIntentId: String = "",
    var classification: String = "",
    var caseStatus: String = "",
    var relatedPaymentIntentId: String? = null,
    var relatedSubscriptionId: String? = null,
    var amountMinor: Long = 0,
    var currencyCode: String = ""
)
