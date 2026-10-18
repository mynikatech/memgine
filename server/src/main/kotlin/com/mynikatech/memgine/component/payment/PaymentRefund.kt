package com.mynikatech.memgine.component.payment

import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.component.commerce.provider.poynt.PoyntCatalogConfiguration
import kotlinx.serialization.Serializable
import org.jdbi.v3.core.Jdbi
import org.jdbi.v3.sqlobject.config.RegisterBeanMapper
import org.jdbi.v3.sqlobject.customizer.Bind
import org.jdbi.v3.sqlobject.statement.SqlQuery
import java.util.UUID

/** R1 boundary. Live provider adapters deliberately remain disabled until their
 * refund contracts and callback/reconciliation semantics have been verified. */
interface PaymentRefundProvider {
    val providerCode: String
    fun execute(request: PaymentRefundDetailDto): PaymentRefundProviderResult
    fun reconcile(request: PaymentRefundDetailDto): PaymentRefundProviderResult
}

enum class PaymentRefundProviderOutcome { SUCCEEDED, PENDING, FAILED, UNKNOWN_REQUIRES_RECONCILIATION, UNSUPPORTED_REQUIRES_MANUAL }
data class PaymentRefundProviderResult(val outcome: PaymentRefundProviderOutcome, val providerReference: String? = null)

class UnsupportedPaymentRefundProvider(override val providerCode: String) : PaymentRefundProvider {
    override fun execute(request: PaymentRefundDetailDto) = PaymentRefundProviderResult(PaymentRefundProviderOutcome.UNSUPPORTED_REQUIRES_MANUAL)
    override fun reconcile(request: PaymentRefundDetailDto) = PaymentRefundProviderResult(PaymentRefundProviderOutcome.UNSUPPORTED_REQUIRES_MANUAL)
}

@Serializable
data class PaymentRefundRequestDto(
    val paymentIntentId: String,
    val amountMinor: Long,
    val reasonCode: String,
    val explanation: String? = null,
    val supportRequestId: String? = null,
    val financialExceptionId: String? = null,
    val idempotencyKey: String
)
@Serializable
data class PaymentRefundSummaryDto(
    var paymentRefundId: String = "", var organizationId: String? = null, var paymentIntentId: String? = null,
    var supportRequestId: String? = null, var financialExceptionId: String? = null,
    var originalProviderCode: String = "", var refundAmountMinor: Long = 0,
    var currencyCode: String = "", var reasonCode: String = "", var approvalStatus: String = "",
    var executionStatus: String = "", var requestedAt: String = "", var versionNo: Int = 0
)
@Serializable
data class PaymentRefundDetailDto(
    var paymentRefundId: String = "", var organizationId: String = "", var paymentIntentId: String? = null,
    var commerceTransactionId: String? = null, var supportRequestId: String? = null,
    var financialExceptionId: String? = null, var originalProviderCode: String = "",
    var originalProviderTransactionReference: String? = null, var capturedAmountMinor: Long = 0,
    var currencyCode: String = "", var refundAmountMinor: Long = 0, var reasonCode: String = "",
    var explanation: String? = null, var approvalStatus: String = "", var executionStatus: String = "",
    var providerRefundReference: String? = null, var failureCode: String? = null,
    var failureDescription: String? = null, var requestedAt: String = "", var updatedAt: String = "", var versionNo: Int = 0
)

data class PaymentRefundExecutionDto(
    var paymentRefundId: String = "",
    var paymentRefundAttemptId: String = "",
    var dispatchRequired: Boolean = false,
    var attemptStatus: String = "",
    var providerReference: String? = null,
    var originalCaptureId: String = "",
    var refundAmountMinor: Long = 0,
    var currencyCode: String = "",
    var integrationConfigurationId: String? = null,
    var businessId: String? = null,
    var providerStoreId: String? = null,
    var applicationId: String? = null,
    var secretReference: String? = null,
    var merchantCurrencyCode: String? = null,
    var recoveryAmbiguous: Boolean = false
)

@Serializable
data class PaymentRefundExecutionStatusDto(
    var paymentRefundId: String = "",
    var executionStatus: String = "",
    var providerRefundReference: String? = null,
    var versionNo: Int = 0
)

@Serializable
data class PoyntCollectVerifiedReferenceRequestDto(
    val organizationId: String,
    val paymentRefundAttemptId: String,
    val providerTransactionId: String,
    val attestation: String
)

@Serializable
data class PoyntCollectVerifiedReferenceConfirmationDto(
    val organizationId: String,
    val paymentRefundAttemptId: String,
    val verificationId: String
)

@Serializable
data class PoyntCollectReferenceVerificationDto(
    var verificationId: String = "",
    var paymentRefundId: String = "",
    var paymentRefundAttemptId: String = "",
    var providerRefundReference: String = "",
    var verificationOutcome: String = "",
    var verifiedAt: String = ""
)

@RegisterBeanMapper(PaymentRefundSummaryDto::class)
@RegisterBeanMapper(PaymentRefundDetailDto::class)
interface PaymentRefundSql {
    @SqlQuery("SELECT * FROM payment_refund_request(:refundId,:organizationId,:paymentIntentId,:amountMinor,:reasonCode,:explanation,:supportRequestId,:financialExceptionId,:idempotencyKey,:actorUserId)")
    fun request(@Bind("refundId") refundId: String, @Bind("organizationId") organizationId: String, @Bind("paymentIntentId") paymentIntentId: String, @Bind("amountMinor") amountMinor: Long, @Bind("reasonCode") reasonCode: String, @Bind("explanation") explanation: String?, @Bind("supportRequestId") supportRequestId: String?, @Bind("financialExceptionId") financialExceptionId: String?, @Bind("idempotencyKey") idempotencyKey: String, @Bind("actorUserId") actorUserId: String): PaymentRefundSummaryDto?
    @SqlQuery("SELECT * FROM payment_refund_list(:organizationId,:actorUserId)") fun list(@Bind("organizationId") organizationId: String, @Bind("actorUserId") actorUserId: String): List<PaymentRefundSummaryDto>
    @SqlQuery("SELECT * FROM payment_refund_detail(:organizationId,:refundId,:actorUserId)") fun detail(@Bind("organizationId") organizationId: String, @Bind("refundId") refundId: String, @Bind("actorUserId") actorUserId: String): PaymentRefundDetailDto?
    @SqlQuery("SELECT * FROM payment_refund_platform_list(:actorUserId)") fun platformList(@Bind("actorUserId") actorUserId: String): List<PaymentRefundSummaryDto>
    @SqlQuery("SELECT * FROM payment_refund_claim_poynt_collect_execution(:organizationId,:refundId,:attemptId,:actorUserId)")
    @RegisterBeanMapper(PaymentRefundExecutionDto::class)
    fun claimPoyntCollectExecution(@Bind("organizationId") organizationId: String, @Bind("refundId") refundId: String, @Bind("attemptId") attemptId: String, @Bind("actorUserId") actorUserId: String): PaymentRefundExecutionDto?
    @SqlQuery("SELECT * FROM payment_refund_poynt_collect_context(:organizationId,:refundId,:actorUserId)")
    @RegisterBeanMapper(PaymentRefundExecutionDto::class)
    fun poyntCollectContext(@Bind("organizationId") organizationId: String, @Bind("refundId") refundId: String, @Bind("actorUserId") actorUserId: String): PaymentRefundExecutionDto?
    @SqlQuery("SELECT * FROM payment_refund_poynt_collect_execution_status(:organizationId,:refundId,:actorUserId)")
    @RegisterBeanMapper(PaymentRefundExecutionStatusDto::class)
    fun poyntCollectExecutionStatus(@Bind("organizationId") organizationId: String, @Bind("refundId") refundId: String, @Bind("actorUserId") actorUserId: String): PaymentRefundExecutionStatusDto?
    @SqlQuery("SELECT * FROM platform_payment_refund_poynt_collect_recovery_context(:organizationId,:refundId,:attemptId,:actorUserId)")
    @RegisterBeanMapper(PaymentRefundExecutionDto::class)
    fun platformPoyntCollectRecoveryContext(@Bind("organizationId") organizationId: String, @Bind("refundId") refundId: String, @Bind("attemptId") attemptId: String, @Bind("actorUserId") actorUserId: String): PaymentRefundExecutionDto?
    @SqlQuery("SELECT * FROM platform_payment_refund_record_poynt_collect_reference_verification(:verificationId,:organizationId,:refundId,:attemptId,:providerReference,:providerOriginalRequestId,:attestation,:actorUserId)")
    @RegisterBeanMapper(PoyntCollectReferenceVerificationDto::class)
    fun recordPoyntCollectReferenceVerification(@Bind("verificationId") verificationId: String, @Bind("organizationId") organizationId: String, @Bind("refundId") refundId: String, @Bind("attemptId") attemptId: String, @Bind("providerReference") providerReference: String, @Bind("providerOriginalRequestId") providerOriginalRequestId: String?, @Bind("attestation") attestation: String, @Bind("actorUserId") actorUserId: String): PoyntCollectReferenceVerificationDto?
    @SqlQuery("SELECT * FROM platform_payment_refund_confirm_poynt_collect_reference(:organizationId,:refundId,:attemptId,:verificationId,:actorUserId)")
    @RegisterBeanMapper(PaymentRefundExecutionStatusDto::class)
    fun confirmPoyntCollectReference(@Bind("organizationId") organizationId: String, @Bind("refundId") refundId: String, @Bind("attemptId") attemptId: String, @Bind("verificationId") verificationId: String, @Bind("actorUserId") actorUserId: String): PaymentRefundExecutionStatusDto?
    @SqlQuery("SELECT * FROM payment_refund_record_poynt_collect_outcome(:organizationId,:refundId,:attemptId,:outcome,:providerReference,:actorUserId)")
    @RegisterBeanMapper(PaymentRefundExecutionStatusDto::class)
    fun recordPoyntCollectOutcome(@Bind("organizationId") organizationId: String, @Bind("refundId") refundId: String, @Bind("attemptId") attemptId: String, @Bind("outcome") outcome: String, @Bind("providerReference") providerReference: String?, @Bind("actorUserId") actorUserId: String): PaymentRefundExecutionStatusDto?
}

enum class PaymentRefundApprovalDecision { AUTO_APPROVED, PENDING_APPROVAL, REJECTED }

interface PaymentRefundApprovalPolicy {
    fun decide(request: PaymentRefundRequestDto, actorUserId: String): PaymentRefundApprovalDecision
}

object MvpAutoApprovePaymentRefundPolicy : PaymentRefundApprovalPolicy {
    override fun decide(request: PaymentRefundRequestDto, actorUserId: String) = PaymentRefundApprovalDecision.AUTO_APPROVED
}

class PaymentRefundService(
    private val jdbi: Jdbi,
    private val approvalPolicy: PaymentRefundApprovalPolicy = MvpAutoApprovePaymentRefundPolicy,
    private val poyntCollectRefundAdapter: PoyntCollectRefundAdapter? = null,
    private val poyntCollectRefundDispatchEnabled: Boolean = false
) {
    private fun sql() = jdbi.onDemand(PaymentRefundSql::class.java)
    fun request(org: String, request: PaymentRefundRequestDto, actor: String): PaymentRefundSummaryDto {
        if (request.paymentIntentId.isBlank() || request.idempotencyKey.isBlank()) throw BadRequestException("Payment and idempotency key are required")
        check(approvalPolicy.decide(request, actor) == PaymentRefundApprovalDecision.AUTO_APPROVED) {
            "The configured refund approval policy is not supported by the MVP ledger"
        }
        return sql().request("PRF_${UUID.randomUUID()}", org, request.paymentIntentId, request.amountMinor, request.reasonCode, request.explanation, request.supportRequestId, request.financialExceptionId, request.idempotencyKey, actor) ?: throw BadRequestException("Refund request could not be created")
    }
    fun list(org: String, actor: String) = sql().list(org, actor)
    fun platformList(actor: String) = sql().platformList(actor)
    fun detail(org: String, id: String, actor: String) = sql().detail(org, id, actor) ?: throw BadRequestException("Refund request was not found")

    fun executionStatus(org: String, id: String, actor: String): PaymentRefundExecutionStatusDto =
        sql().poyntCollectExecutionStatus(org, id, actor)
            ?: throw BadRequestException("Collect refund execution is not available")

    fun executePoyntCollect(org: String, id: String, actor: String): PaymentRefundExecutionStatusDto {
        if (!poyntCollectRefundDispatchEnabled) {
            throw BadRequestException("Poynt Collect refund dispatch is disabled")
        }
        val claim = sql().claimPoyntCollectExecution(org, id, "PRA_${UUID.randomUUID()}", actor)
            ?: throw BadRequestException("Collect refund execution is not available")
        if (!claim.dispatchRequired) return executionStatus(claim)
        val adapter = poyntCollectRefundAdapter
            ?: return recordOutcome(org, id, claim, PaymentRefundProviderOutcome.UNKNOWN_REQUIRES_RECONCILIATION, null, actor)
        val result = adapter.execute(request(claim))
        return recordOutcome(org, id, claim, result.outcome, result.providerReference, actor)
    }

    fun reconcilePoyntCollect(org: String, id: String, actor: String): PaymentRefundExecutionStatusDto {
        val context = sql().poyntCollectContext(org, id, actor)
            ?: throw BadRequestException("Collect refund reconciliation is not available")
        val adapter = poyntCollectRefundAdapter
            ?: return recordOutcome(org, id, context, PaymentRefundProviderOutcome.UNKNOWN_REQUIRES_RECONCILIATION, null, actor)
        if (context.providerReference.isNullOrBlank()) return executionStatus(context)
        val result = adapter.reconcile(request(context), context.providerReference)
        return recordOutcome(org, id, context, result.outcome, result.providerReference, actor)
    }

    fun verifyPoyntCollectReference(
        refundId: String,
        request: PoyntCollectVerifiedReferenceRequestDto,
        actor: String
    ): PoyntCollectReferenceVerificationDto {
        validateRecoveryRequest(refundId, request)
        val context = sql().platformPoyntCollectRecoveryContext(
            request.organizationId, refundId, request.paymentRefundAttemptId, actor
        ) ?: throw BadRequestException("Collect refund recovery is not available")
        val result = poyntCollectRefundAdapter?.verifyProviderReference(
            request(context), request.providerTransactionId.trim()
        ) ?: PoyntCollectRefundResult(PaymentRefundProviderOutcome.UNKNOWN_REQUIRES_RECONCILIATION)
        if (
            result.outcome == PaymentRefundProviderOutcome.SUCCEEDED &&
            result.providerReference == request.providerTransactionId.trim()
        ) {
            return sql().recordPoyntCollectReferenceVerification(
                "PRV_${UUID.randomUUID()}", request.organizationId, refundId,
                request.paymentRefundAttemptId, request.providerTransactionId.trim(),
                result.providerOriginalRequestId, request.attestation.trim(), actor
            ) ?: throw BadRequestException("Collect refund verification could not be recorded")
        }
        throw BadRequestException("Collect refund provider evidence could not be verified")
    }

    fun confirmPoyntCollectReference(
        refundId: String,
        request: PoyntCollectVerifiedReferenceConfirmationDto,
        actor: String
    ): PaymentRefundExecutionStatusDto {
        if (refundId.isBlank() || request.organizationId.isBlank() ||
            request.paymentRefundAttemptId.isBlank() || request.verificationId.isBlank()
        ) throw BadRequestException("Collect refund recovery confirmation is invalid")
        return sql().confirmPoyntCollectReference(
            request.organizationId, refundId, request.paymentRefundAttemptId,
            request.verificationId, actor
        ) ?: throw BadRequestException("Collect refund recovery confirmation is unavailable")
    }

    private fun validateRecoveryRequest(
        refundId: String,
        request: PoyntCollectVerifiedReferenceRequestDto
    ) {
        if (refundId.isBlank() || request.organizationId.isBlank() ||
            request.paymentRefundAttemptId.isBlank() ||
            request.providerTransactionId.length !in 1..160 ||
            request.attestation.trim().length !in 10..1000
        ) throw BadRequestException("Collect refund recovery request is invalid")
    }

    private fun request(context: PaymentRefundExecutionDto): PoyntCollectRefundRequest =
        PoyntCollectRefundRequest(
            refundAttemptId = context.paymentRefundAttemptId,
            originalCaptureId = context.originalCaptureId,
            refundAmountMinor = context.refundAmountMinor,
            currencyCode = context.currencyCode,
            configuration = PoyntCatalogConfiguration(
                integrationConfigurationId = context.integrationConfigurationId
                    ?: throw BadRequestException("Original Collect integration requires investigation"),
                organizationId = "",
                applicationId = context.applicationId
                    ?: throw BadRequestException("Original Collect integration requires investigation"),
                businessId = context.businessId
                    ?: throw BadRequestException("Original Collect integration requires investigation"),
                providerStoreId = context.providerStoreId,
                secretReference = context.secretReference
                    ?: throw BadRequestException("Original Collect credential requires investigation"),
                merchantCurrencyCode = context.merchantCurrencyCode
                    ?: throw BadRequestException("Original Collect integration requires investigation"),
                lastIncrementalSyncAt = null
            )
        )

    private fun executionStatus(context: PaymentRefundExecutionDto): PaymentRefundExecutionStatusDto =
        PaymentRefundExecutionStatusDto(
            paymentRefundId = context.paymentRefundId,
            executionStatus = context.attemptStatus,
            providerRefundReference = context.providerReference
        )

    private fun recordOutcome(
        org: String,
        refundId: String,
        context: PaymentRefundExecutionDto,
        outcome: PaymentRefundProviderOutcome,
        providerReference: String?,
        actor: String
    ): PaymentRefundExecutionStatusDto = sql().recordPoyntCollectOutcome(
        org, refundId, context.paymentRefundAttemptId, outcome.name, providerReference, actor
    ) ?: throw BadRequestException("Collect refund outcome could not be recorded")
}
