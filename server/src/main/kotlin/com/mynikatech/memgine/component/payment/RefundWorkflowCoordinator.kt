package com.mynikatech.memgine.component.payment

import com.mynikatech.memgine.component.commerce.provider.poynt.PoyntCatalogConfiguration
import kotlinx.serialization.Serializable
import org.jdbi.v3.core.Jdbi
import org.jdbi.v3.sqlobject.config.RegisterBeanMapper
import org.jdbi.v3.sqlobject.customizer.Bind
import org.jdbi.v3.sqlobject.statement.SqlQuery

/** Trusted database-backed preflight. No refund is claimed or dispatched here. */
data class CollectPreflightRow(
    var paymentRefundId: String = "",
    var originalCaptureId: String = "",
    var capturedAmountMinor: Long = 0L,
    var refundAmountMinor: Long = 0L,
    var currencyCode: String = "",
    var integrationConfigurationId: String = "",
    var businessId: String = "",
    var providerStoreId: String = "",
    var applicationId: String = "",
    var secretReference: String = "",
    var merchantCurrencyCode: String = ""
)

@Serializable
data class MembershipCancellationRow(
    var subscriptionId: String = "",
    var actionStatus: String = "",
    var lastErrorCode: String? = null
)

interface RefundWorkflowSql {
    @SqlQuery("SELECT * FROM payment_refund_collect_preflight(:org,:refund,:actor)")
    @RegisterBeanMapper(CollectPreflightRow::class)
    fun preflight(@Bind("org") org: String, @Bind("refund") refund: String,
                  @Bind("actor") actor: String): CollectPreflightRow?

    @SqlQuery("SELECT * FROM payment_refund_collect_original_binding(:org,:refund,:actor)")
    @RegisterBeanMapper(CollectPreflightRow::class)
    fun originalBinding(@Bind("org") org: String, @Bind("refund") refund: String,
                        @Bind("actor") actor: String): CollectPreflightRow?

    @SqlQuery("SELECT payment_refund_record_verified_legacy_merchant(:org,:refund,:actor,:capture,:business,:store)")
    fun recordVerifiedLegacyMerchant(@Bind("org") org: String, @Bind("refund") refund: String,
        @Bind("actor") actor: String, @Bind("capture") capture: String,
        @Bind("business") business: String, @Bind("store") store: String): Boolean

    @SqlQuery("SELECT * FROM payment_refund_request_and_cancel(:refund,:org,:intent,:amount,:reason,:explanation,:support,:exception,:key,:actor)")
    @RegisterBeanMapper(PaymentRefundSummaryDto::class)
    fun requestAndCancel(@Bind("refund") refund: String, @Bind("org") org: String,
        @Bind("intent") intent: String, @Bind("amount") amount: Long,
        @Bind("reason") reason: String, @Bind("explanation") explanation: String?,
        @Bind("support") support: String?, @Bind("exception") exception: String?,
        @Bind("key") key: String, @Bind("actor") actor: String): PaymentRefundSummaryDto?

    @SqlQuery("SELECT * FROM payment_refund_membership_action_read(:org,:refund,:actor)")
    @RegisterBeanMapper(MembershipCancellationRow::class)
    fun membershipAction(@Bind("org") org: String, @Bind("refund") refund: String,
        @Bind("actor") actor: String): MembershipCancellationRow?

    @SqlQuery("SELECT payment_refund_mark_membership_action_review(:org,:refund,:actor)")
    fun markMembershipActionReview(@Bind("org") org: String, @Bind("refund") refund: String,
        @Bind("actor") actor: String): Boolean

    @SqlQuery("SELECT payment_refund_complete_membership_cancellation(:org,:refund,:actor)")
    fun completeMembershipAction(@Bind("org") org: String, @Bind("refund") refund: String,
        @Bind("actor") actor: String): String
}

/** Business-language response. Provider credentials never leave this service. */
data class RefundVerificationDecision(val eligible: Boolean, val message: String)

internal class RefundWorkflowCoordinator(
    private val jdbi: Jdbi,
    private val verifier: PoyntOriginalCaptureVerifier?
) {
    private fun sql() = jdbi.onDemand(RefundWorkflowSql::class.java)

    fun requestAndCancel(org: String, refundId: String, request: PaymentRefundRequestDto, actor: String): PaymentRefundSummaryDto? {
        val intent = request.paymentIntentId?.takeIf(String::isNotBlank)
            ?: throw com.mynikatech.memgine.exception.BadRequestException(
                "Refund and cancel requires a payment linked to the membership being cancelled.")
        if (!request.commerceTransactionId.isNullOrBlank()) {
            throw com.mynikatech.memgine.exception.BadRequestException(
                "This payment type does not yet support automatic membership cancellation.")
        }
        return sql().requestAndCancel(refundId,org,intent,request.amountMinor,request.reasonCode,
            request.explanation,request.supportRequestId,request.financialExceptionId,request.idempotencyKey,actor)
    }

    /** Called BEFORE the durable execution claim, not after it. */
    fun verifyBeforeCollectExecution(org: String, refundId: String, actor: String): RefundVerificationDecision {
        // Binding lookup is read-only and does not require merchant identity from
        // legacy capture evidence. The live Poynt check must run first.
        val context = sql().originalBinding(org, refundId, actor)
            ?: return RefundVerificationDecision(false,
                "The original payment or its Poynt configuration needs investigation. No refund was sent.")
        val provider = verifier ?: return RefundVerificationDecision(false,
            "Poynt verification is temporarily unavailable. No refund was sent. Please retry later.")
        val config = PoyntCatalogConfiguration(
            integrationConfigurationId=context.integrationConfigurationId,
            organizationId=org,
            applicationId=context.applicationId,
            businessId=context.businessId,
            providerStoreId=context.providerStoreId,
            secretReference=context.secretReference,
            merchantCurrencyCode=context.merchantCurrencyCode,
            lastIncrementalSyncAt=null
        )
        when (provider.verify(config,context.originalCaptureId,context.capturedAmountMinor,context.currencyCode)) {
            PoyntOriginalCaptureVerifier.Result.NOT_CAPTURED -> return RefundVerificationDecision(false,
                "Poynt did not confirm a captured payment. No refund was sent.")
            PoyntOriginalCaptureVerifier.Result.REQUIRES_RECONCILIATION -> return RefundVerificationDecision(false,
                "Poynt could not conclusively verify the original payment. No refund was sent; please request reconciliation.")
            PoyntOriginalCaptureVerifier.Result.VERIFIED -> Unit
        }
        // Poynt verified the exact original capture, merchant, store, amount and
        // currency. Now persist missing historical merchant identity without
        // replacing conflicting identity evidence.
        val recorded = try {
            sql().recordVerifiedLegacyMerchant(org,refundId,actor,context.originalCaptureId,
                context.businessId,context.providerStoreId)
        } catch (_: Exception) { false }
        if (!recorded) return RefundVerificationDecision(false,
            "Payment verification succeeded, but the original transaction record changed. No refund was sent; please retry or contact support.")
        // Recheck original strict preflight: no relaxation of execution claims.
        val strict = sql().preflight(org,refundId,actor)
            ?: return RefundVerificationDecision(false,
                "Payment verification succeeded, but refund execution is not ready. No refund was sent.")
        if (strict.originalCaptureId != context.originalCaptureId ||
            strict.refundAmountMinor != context.refundAmountMinor ||
            strict.capturedAmountMinor != context.capturedAmountMinor ||
            strict.currencyCode != context.currencyCode ||
            strict.businessId != context.businessId || strict.providerStoreId != context.providerStoreId)
            return RefundVerificationDecision(false,
                "Original transaction evidence changed during verification. No refund was sent.")
        return RefundVerificationDecision(true,"Original Poynt payment verified.")
    }

    fun membershipAction(org: String, refundId: String, actor: String): MembershipCancellationRow? =
        sql().membershipAction(org,refundId,actor)

    /** May be called repeatedly after callback, reconciliation, or page reload. */
    fun completeIfRefundSucceeded(org: String, refundId: String, actor: String,
                                  refundExecutionStatus: String): MembershipCancellationRow? {
        val action = membershipAction(org,refundId,actor) ?: return null
        if (action.actionStatus=="COMPLETED" || refundExecutionStatus!="SUCCEEDED") return action
        // The DB function rechecks refund success, payment-to-membership linkage,
        // and locks the exact subscription. A failure never initiates another refund.
        return try {
            sql().completeMembershipAction(org,refundId,actor)
            membershipAction(org,refundId,actor)
        } catch (_: Exception) {
            // Completion rolled back; record the failure independently. Never throw
            // after verified money movement, and never request another refund.
            try { sql().markMembershipActionReview(org,refundId,actor) } catch (_: Exception) { }
            MembershipCancellationRow(action.subscriptionId,"NEEDS_REVIEW","CANCELLATION_REQUIRES_REVIEW")
        }
    }
}
