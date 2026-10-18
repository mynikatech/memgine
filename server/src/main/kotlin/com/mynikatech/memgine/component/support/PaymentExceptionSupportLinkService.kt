package com.mynikatech.memgine.component.support

import org.jdbi.v3.core.Jdbi
import kotlinx.serialization.Serializable

/**
 * Internal orchestration boundary for verified financial-exception support cases.
 * The SQL operation is idempotent and derives organization/customer identity from
 * the persisted exception; callers never supply either identity.
 */
class PaymentExceptionSupportLinkService(private val jdbi: Jdbi) {
    private companion object {
        const val BUSY_RESULT = "__MEMGINE_SUPPORT_LINK_BUSY__"
    }

    fun processVerifiedException(financialExceptionId: String): PaymentExceptionSupportLinkOutcome {
        val supportRequestId = jdbi.withHandle<String?, Exception> { handle ->
            handle.createQuery("SELECT support_create_case_for_verified_exception(:exceptionId)")
                .bind("exceptionId", financialExceptionId)
                .mapTo(String::class.java)
                .findOne()
                .orElse(null)
        }
        return when (supportRequestId) {
            null -> PaymentExceptionSupportLinkOutcome.Ineligible
            BUSY_RESULT -> PaymentExceptionSupportLinkOutcome.Busy
            else -> PaymentExceptionSupportLinkOutcome.Linked(supportRequestId)
        }
    }

    fun reconcileEligible(limit: Int = 50): PaymentExceptionSupportLinkReconciliationResult {
        val exceptionIds = jdbi.withHandle<List<String>, Exception> { handle ->
            handle.createQuery("SELECT * FROM support_verified_exception_support_link_candidates(:limit)")
                .bind("limit", limit.coerceIn(1, 200))
                .mapTo(String::class.java)
                .list()
        }
        var linked = 0
        var skipped = 0
        var busy = 0
        var failed = 0
        exceptionIds.forEach { exceptionId ->
            try {
                when (processVerifiedException(exceptionId)) {
                    is PaymentExceptionSupportLinkOutcome.Linked -> linked++
                    PaymentExceptionSupportLinkOutcome.Ineligible -> skipped++
                    PaymentExceptionSupportLinkOutcome.Busy -> busy++
                }
            } catch (_: Exception) {
                failed++
            }
        }
        return PaymentExceptionSupportLinkReconciliationResult(
            scanned = exceptionIds.size,
            linked = linked,
            skipped = skipped,
            busy = busy,
            failed = failed,
        )
    }
}

sealed interface PaymentExceptionSupportLinkOutcome {
    data class Linked(val supportRequestId: String) : PaymentExceptionSupportLinkOutcome
    data object Ineligible : PaymentExceptionSupportLinkOutcome
    /** Another bridge invocation owns the exception lock; reconciliation may retry later. */
    data object Busy : PaymentExceptionSupportLinkOutcome
}

@Serializable
data class PaymentExceptionSupportLinkReconciliationResult(
    val scanned: Int,
    val linked: Int,
    val skipped: Int,
    val busy: Int,
    val failed: Int,
)
