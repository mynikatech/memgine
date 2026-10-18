package com.mynikatech.memgine.component.payment

import com.mynikatech.memgine.exception.BadRequestException
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

@RegisterBeanMapper(PaymentRefundSummaryDto::class)
@RegisterBeanMapper(PaymentRefundDetailDto::class)
interface PaymentRefundSql {
    @SqlQuery("SELECT * FROM payment_refund_request(:refundId,:organizationId,:paymentIntentId,:amountMinor,:reasonCode,:explanation,:supportRequestId,:financialExceptionId,:idempotencyKey,:actorUserId)")
    fun request(@Bind("refundId") refundId: String, @Bind("organizationId") organizationId: String, @Bind("paymentIntentId") paymentIntentId: String, @Bind("amountMinor") amountMinor: Long, @Bind("reasonCode") reasonCode: String, @Bind("explanation") explanation: String?, @Bind("supportRequestId") supportRequestId: String?, @Bind("financialExceptionId") financialExceptionId: String?, @Bind("idempotencyKey") idempotencyKey: String, @Bind("actorUserId") actorUserId: String): PaymentRefundSummaryDto?
    @SqlQuery("SELECT * FROM payment_refund_list(:organizationId,:actorUserId)") fun list(@Bind("organizationId") organizationId: String, @Bind("actorUserId") actorUserId: String): List<PaymentRefundSummaryDto>
    @SqlQuery("SELECT * FROM payment_refund_detail(:organizationId,:refundId,:actorUserId)") fun detail(@Bind("organizationId") organizationId: String, @Bind("refundId") refundId: String, @Bind("actorUserId") actorUserId: String): PaymentRefundDetailDto?
    @SqlQuery("SELECT * FROM payment_refund_platform_list(:actorUserId)") fun platformList(@Bind("actorUserId") actorUserId: String): List<PaymentRefundSummaryDto>
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
    private val approvalPolicy: PaymentRefundApprovalPolicy = MvpAutoApprovePaymentRefundPolicy
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
}
