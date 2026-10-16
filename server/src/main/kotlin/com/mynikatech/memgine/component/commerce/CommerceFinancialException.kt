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