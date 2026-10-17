package com.mynikatech.memgine.component.payment

import com.mynikatech.memgine.exception.BadRequestException
import org.jdbi.v3.core.Jdbi
import java.util.UUID

/** P5-A2: administratively authorized fulfillment replay, never payment capture. */
internal class FinancialExceptionAdminRecovery(private val jdbi: Jdbi) {
    fun recover(organizationId: String, exceptionId: String, actorUserId: String, reason: String): String? {
        if (reason.isBlank() || reason.length > 500) {
            throw BadRequestException("A recovery reason (1-500 characters) is required")
        }
        // The SQL function performs the authoritative org authorization and evidence checks.
        // One transaction ensures the trigger sees the admin actor; failure rolls back fulfillment.
        val attemptId = "FRA_${UUID.randomUUID()}"
        try {
            return jdbi.inTransaction<String?, Exception> { handle ->
                handle.createQuery("SELECT financial_exception_admin_recover(:org, :id, :actor, :reason)")
                    .bind("org", organizationId)
                    .bind("id", exceptionId)
                    .bind("actor", actorUserId)
                    .bind("reason", reason.trim())
                    .mapTo(String::class.java)
                    .one()
            }
        } catch (originalError: Exception) {
            // A second transaction ensures failure audit survives a rolled-back finalizer.
            // Do not expose/log the original financial/provider exception's payload here.
            try {
                jdbi.withHandle<Boolean, Exception> { handle ->
                    handle.createQuery("SELECT financial_exception_admin_record_failure(:org, :id, :actor, :attempt)")
                        .bind("org", organizationId)
                        .bind("id", exceptionId)
                        .bind("actor", actorUserId)
                        .bind("attempt", attemptId)
                        .mapTo(Boolean::class.java)
                        .one()
                }
            } catch (_: Exception) {
                // Never hide the original recovery failure behind an audit write failure.
            }
            throw originalError
        }
    }
}
