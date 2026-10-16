package com.mynikatech.memgine.component.commerce

import org.jdbi.v3.sqlobject.customizer.Bind
import org.jdbi.v3.sqlobject.statement.SqlQuery

/**
 * Durable, provider-neutral Counter financial-exception evidence.
 * The database function derives organization, amount, currency, provider
 * outcome, and fulfillment state from the persisted remote payment attempt.
 */
interface CommerceFinancialExceptionSql {
    @SqlQuery("SELECT commerce_open_remote_terminal_financial_exception(:referenceId)")
    fun openRemoteTerminalCase(@Bind("referenceId") referenceId: String): String?

    @SqlQuery("SELECT commerce_open_counter_financial_exception_for_recovery(:organizationId, :transactionId, :actorUserId)")
    fun openCounterCaseForRecovery(
        @Bind("organizationId") organizationId: String,
        @Bind("transactionId") transactionId: String,
        @Bind("actorUserId") actorUserId: String
    ): String?

    @SqlQuery("SELECT financial_exception_record_recovery_failure(:organizationId, NULL, :transactionId, :actorUserId, :recoveryAttemptId)")
    fun recordCounterRecoveryFailure(
        @Bind("organizationId") organizationId: String,
        @Bind("transactionId") transactionId: String,
        @Bind("actorUserId") actorUserId: String,
        @Bind("recoveryAttemptId") recoveryAttemptId: String
    ): Boolean
    @SqlQuery("SELECT commerce_recover_counter_financial_exception(:organizationId, :transactionId, :actorUserId)")
    fun recoverCounterFulfillment(
        @Bind("organizationId") organizationId: String,
        @Bind("transactionId") transactionId: String,
        @Bind("actorUserId") actorUserId: String
    ): String?
}

/**
 * Keeps durable exception persistence outside the transaction that replays
 * fulfillment. Callers must establish evidence first; finalization remains
 * entirely in the existing idempotent domain functions.
 */
internal class DurableFinancialExceptionRecovery<T>(
    private val establishCase: () -> Unit,
    private val finalizeFulfillment: () -> T
) {
    fun recover(): T {
        establishCase()
        return finalizeFulfillment()
    }
}
internal class RemoteTerminalFinancialExceptionFinalizer(
    private val finalizePayment: (String) -> String?,
    private val openExceptionCase: (String) -> String?,
    private val recordCompletion: (String) -> Unit,
    private val reportExceptionFailure: () -> Unit
) {
    fun finalize(referenceId: String): String? = try {
        finalizePayment(referenceId)?.also(recordCompletion)
    } catch (failure: Exception) {
        try {
            openExceptionCase(referenceId)
        } catch (_: Exception) {
            // Preserve the original fulfillment failure.
            reportExceptionFailure()
        }
        throw failure
    }
}
