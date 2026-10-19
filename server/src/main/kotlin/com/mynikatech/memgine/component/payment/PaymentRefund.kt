package com.mynikatech.memgine.component.payment

import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.component.commerce.provider.poynt.PoyntCatalogConfiguration
import com.mynikatech.memgine.component.commerce.provider.poynt.PoyntPaymentBridgeClient
import com.mynikatech.memgine.component.commerce.provider.poynt.PoyntBridgeRefundDispatchRequest
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
    val paymentIntentId: String? = null,
    val amountMinor: Long,
    val reasonCode: String,
    val explanation: String? = null,
    val supportRequestId: String? = null,
    val financialExceptionId: String? = null,
    val idempotencyKey: String,
    val commerceTransactionId: String? = null
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

data class PaymentBridgeRefundExecutionDto(
    var paymentRefundId: String = "", var paymentRefundAttemptId: String = "", var dispatchRequired: Boolean = false,
    var attemptStatus: String = "", var providerReference: String? = null, var originalCaptureId: String = "",
    var refundAmountMinor: Long = 0, var currencyCode: String = "", var integrationConfigurationId: String? = null,
    var businessId: String? = null, var providerStoreId: String? = null,
    var providerDeviceId: String? = null, var targetPosDeviceId: String? = null
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

@Serializable
data class PoyntBridgeReferenceVerificationRequestDto(
    val organizationId:String,val paymentRefundAttemptId:String,
    val providerTransactionId:String,val attestation:String
)
@Serializable
data class PoyntBridgeReferenceConfirmationDto(
    val organizationId:String,val paymentRefundAttemptId:String,val verificationId:String
)

@RegisterBeanMapper(PaymentRefundSummaryDto::class)
@RegisterBeanMapper(PaymentRefundDetailDto::class)
@Serializable
data class RefundResolutionOptionDto(
    var code: String = "", var type: String = "", var name: String = "",
    var description: String? = null, var displayOrder: Int = 0
)

interface PaymentRefundSql {
    @SqlQuery("SELECT * FROM refund_resolution_reference_options(:organizationId,:actorUserId,:scope)")
    @RegisterBeanMapper(RefundResolutionOptionDto::class)
    fun resolutionOptions(@Bind("organizationId") organizationId: String,
        @Bind("actorUserId") actorUserId: String,
        @Bind("scope") scope: String): List<RefundResolutionOptionDto>

    @SqlQuery("SELECT * FROM payment_refund_request(:refundId,:organizationId,:paymentIntentId,:amountMinor,:reasonCode,:explanation,:supportRequestId,:financialExceptionId,:idempotencyKey,:actorUserId)")
    fun request(@Bind("refundId") refundId: String, @Bind("organizationId") organizationId: String, @Bind("paymentIntentId") paymentIntentId: String, @Bind("amountMinor") amountMinor: Long, @Bind("reasonCode") reasonCode: String, @Bind("explanation") explanation: String?, @Bind("supportRequestId") supportRequestId: String?, @Bind("financialExceptionId") financialExceptionId: String?, @Bind("idempotencyKey") idempotencyKey: String, @Bind("actorUserId") actorUserId: String): PaymentRefundSummaryDto?
    @SqlQuery("SELECT * FROM payment_refund_request_commerce(:refundId,:organizationId,:commerceTransactionId,:amountMinor,:reasonCode,:explanation,:supportRequestId,:idempotencyKey,:actorUserId)")
    fun requestCommerce(@Bind("refundId") refundId: String, @Bind("organizationId") organizationId: String, @Bind("commerceTransactionId") commerceTransactionId: String, @Bind("amountMinor") amountMinor: Long, @Bind("reasonCode") reasonCode: String, @Bind("explanation") explanation: String?, @Bind("supportRequestId") supportRequestId: String?, @Bind("idempotencyKey") idempotencyKey: String, @Bind("actorUserId") actorUserId: String): PaymentRefundSummaryDto?
    @SqlQuery("SELECT * FROM payment_refund_claim_poynt_bridge_execution(:organizationId,:refundId,:attemptId,:actorUserId)")
    @RegisterBeanMapper(PaymentBridgeRefundExecutionDto::class)
    fun claimPoyntBridgeExecution(@Bind("organizationId") organizationId:String,@Bind("refundId") refundId:String,@Bind("attemptId") attemptId:String,@Bind("actorUserId") actor:String): PaymentBridgeRefundExecutionDto?
    @SqlQuery("SELECT * FROM payment_refund_record_poynt_bridge_outcome(:organizationId,:refundId,:attemptId,:outcome,:providerReference,:actorUserId)")
    @RegisterBeanMapper(PaymentRefundExecutionStatusDto::class)
    fun recordPoyntBridgeOutcome(@Bind("organizationId") organizationId:String,@Bind("refundId") refundId:String,@Bind("attemptId") attemptId:String,@Bind("outcome") outcome:String,@Bind("providerReference") providerReference:String?,@Bind("actorUserId") actor:String): PaymentRefundExecutionStatusDto?
    @SqlQuery("SELECT * FROM payment_refund_poynt_bridge_execution_status(:organizationId,:refundId,:actorUserId)")
    @RegisterBeanMapper(PaymentRefundExecutionStatusDto::class)
    fun poyntBridgeExecutionStatus(@Bind("organizationId") organizationId:String,@Bind("refundId") refundId:String,@Bind("actorUserId") actor:String):PaymentRefundExecutionStatusDto?
    @SqlQuery("SELECT * FROM payment_refund_poynt_bridge_context(:organizationId,:refundId,:actorUserId)")
    @RegisterBeanMapper(PaymentBridgeRefundExecutionDto::class)
    fun poyntBridgeContext(@Bind("organizationId") organizationId:String,@Bind("refundId") refundId:String,@Bind("actorUserId") actor:String):PaymentBridgeRefundExecutionDto?
    @SqlQuery("SELECT * FROM payment_refund_record_poynt_bridge_callback(:attemptId,:outcome,:providerRefundId,:originalTransactionId,:amountMinor,:currencyCode,:businessId,:storeId)")
    @RegisterBeanMapper(PaymentRefundExecutionStatusDto::class)
    fun bridgeCallback(@Bind("attemptId") attemptId:String,@Bind("outcome") outcome:String,@Bind("providerRefundId") providerRefundId:String?,@Bind("originalTransactionId") originalTransactionId:String?,@Bind("amountMinor") amountMinor:Long?,@Bind("currencyCode") currencyCode:String?,@Bind("businessId") businessId:String?,@Bind("storeId") storeId:String?):PaymentRefundExecutionStatusDto?
    @SqlQuery("SELECT * FROM payment_refund_bridge_record_verification(:verificationId,:organizationId,:refundId,:attemptId,:providerReference,:attestation,:actorUserId)")
    @RegisterBeanMapper(PoyntCollectReferenceVerificationDto::class)
    fun bridgeRecordVerification(@Bind("verificationId") verificationId:String,@Bind("organizationId") organizationId:String,
        @Bind("refundId") refundId:String,@Bind("attemptId") attemptId:String,@Bind("providerReference") providerReference:String,
        @Bind("attestation") attestation:String,@Bind("actorUserId") actor:String):PoyntCollectReferenceVerificationDto?
    @SqlQuery("SELECT * FROM payment_refund_bridge_confirm_verified(:organizationId,:refundId,:attemptId,:verificationId,:actorUserId)")
    @RegisterBeanMapper(PaymentRefundExecutionStatusDto::class)
    fun bridgeConfirmVerification(@Bind("organizationId") organizationId:String,@Bind("refundId") refundId:String,
        @Bind("attemptId") attemptId:String,@Bind("verificationId") verificationId:String,
        @Bind("actorUserId") actor:String):PaymentRefundExecutionStatusDto?
    @SqlQuery("SELECT * FROM payment_refund_list(:organizationId,:actorUserId)") fun list(@Bind("organizationId") organizationId: String, @Bind("actorUserId") actorUserId: String): List<PaymentRefundSummaryDto>
    @SqlQuery("SELECT * FROM payment_refund_case_list(:organizationId,:actorUserId,:supportRequestId,:financialExceptionId)")
    fun caseList(@Bind("organizationId") organizationId: String,
                 @Bind("actorUserId") actorUserId: String,
                 @Bind("supportRequestId") supportRequestId: String?,
                 @Bind("financialExceptionId") financialExceptionId: String?): List<PaymentRefundSummaryDto>
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
    private val poyntCollectRefundDispatchEnabled: Boolean = false,
    private val poyntBridgeRefundDispatchEnabled: Boolean = false,
    private val poyntBridgeRefundClient: PoyntPaymentBridgeClient? = null,
    private val poyntBridgeTerminalCheck: ((String,String,String,String,String,String)->Boolean)? = null,
    private val poyntBridgeConfiguration: ((String,String,String)->PoyntCatalogConfiguration?)? = null,
    private val poyntBridgeRefundCallbackUrl: String = "",
    private val poyntBridgeCallbackHeaderName: String = "",
    private val poyntBridgeCallbackHeaderValue: String = "",
    private val poyntBridgeTtlSeconds: Long = 45L
) {
    private fun sql() = jdbi.onDemand(PaymentRefundSql::class.java)
    fun resolutionOptions(org: String, actor: String, scope: String): List<RefundResolutionOptionDto> =
        sql().resolutionOptions(org, actor, scope)

    fun request(org: String, request: PaymentRefundRequestDto, actor: String): PaymentRefundSummaryDto {
        val intentId = request.paymentIntentId?.trim().orEmpty()
        val commerceId = request.commerceTransactionId?.trim().orEmpty()
        if ((intentId.isBlank() == commerceId.isBlank()) || request.idempotencyKey.isBlank()) {
            throw BadRequestException("Exactly one payment or commerce transaction and an idempotency key are required")
        }
        if (commerceId.isNotBlank() && !request.financialExceptionId.isNullOrBlank()) {
            throw BadRequestException("Financial exceptions are not supported for commerce refunds")
        }
        check(approvalPolicy.decide(request, actor) == PaymentRefundApprovalDecision.AUTO_APPROVED) {
            "The configured refund approval policy is not supported by the MVP ledger"
        }
        return if (intentId.isNotBlank()) {
            sql().request("PRF_${UUID.randomUUID()}", org, intentId, request.amountMinor, request.reasonCode, request.explanation, request.supportRequestId, request.financialExceptionId, request.idempotencyKey, actor)
        } else {
            sql().requestCommerce("PRF_${UUID.randomUUID()}", org, commerceId, request.amountMinor, request.reasonCode, request.explanation, request.supportRequestId, request.idempotencyKey, actor)
        } ?: throw BadRequestException("Refund request could not be created")
    }
    fun list(org: String, actor: String) = sql().list(org, actor)
    fun listBySupportRequest(org: String, supportRequestId: String, actor: String) =
        sql().caseList(org, actor, supportRequestId, null)
    fun listByFinancialException(org: String, financialExceptionId: String, actor: String) =
        sql().caseList(org, actor, null, financialExceptionId)
    fun platformList(actor: String) = sql().platformList(actor)
    fun detail(org: String, id: String, actor: String) = sql().detail(org, id, actor) ?: throw BadRequestException("Refund request was not found")

    fun executionStatus(org: String, id: String, actor: String): PaymentRefundExecutionStatusDto =
        when (detail(org,id,actor).originalProviderCode) {
            "POYNT_PAYMENT_BRIDGE" -> sql().poyntBridgeExecutionStatus(org,id,actor)
            "POYNT_COLLECT" -> sql().poyntCollectExecutionStatus(org,id,actor)
            else -> null
        } ?: throw BadRequestException("Refund execution is not available")

    fun execute(org:String,id:String,actor:String):PaymentRefundExecutionStatusDto =
        when (detail(org,id,actor).originalProviderCode) {
            "POYNT_PAYMENT_BRIDGE" -> executePoyntBridge(org,id,actor)
            "POYNT_COLLECT" -> executePoyntCollect(org,id,actor)
            else -> throw BadRequestException("Refund provider is not supported")
        }

    fun reconcile(org:String,id:String,actor:String):PaymentRefundExecutionStatusDto =
        when (detail(org,id,actor).originalProviderCode) {
            "POYNT_PAYMENT_BRIDGE" -> reconcilePoyntBridge(org,id,actor)
            "POYNT_COLLECT" -> reconcilePoyntCollect(org,id,actor)
            else -> throw BadRequestException("Refund provider is not supported")
        }

    fun executePoyntBridge(org:String,id:String,actor:String):PaymentRefundExecutionStatusDto {
        if (!poyntBridgeRefundDispatchEnabled) throw BadRequestException("Payment Bridge refund dispatch is disabled")
        val existing = detail(org,id,actor)
        if (existing.originalProviderCode != "POYNT_PAYMENT_BRIDGE" || existing.commerceTransactionId.isNullOrBlank())
            throw BadRequestException("Payment Bridge refund is not available")
        // Validate configuration and historical identities BEFORE an irreversible claim.
        val contextConfig = existing.originalProviderTransactionReference ?: throw BadRequestException("Original provider reference is unavailable")
        val configuredClient = poyntBridgeRefundClient ?: throw BadRequestException("Bridge refund provider unavailable")
        val context = sql().claimPoyntBridgeExecution(org,id,"PRA_${UUID.randomUUID()}",actor)
            ?: throw BadRequestException("Bridge refund execution claim unavailable")
        if (!context.dispatchRequired) return executionStatus(org,id,actor)
        fun unknown():PaymentRefundExecutionStatusDto = sql().recordPoyntBridgeOutcome(org,id,context.paymentRefundAttemptId,
            "UNKNOWN_REQUIRES_RECONCILIATION",null,actor)
            ?: throw BadRequestException("Could not record uncertain Bridge refund outcome")
        try {
            val integrationId=context.integrationConfigurationId ?: return unknown()
            val config=poyntBridgeConfiguration?.invoke(org,integrationId,actor) ?: return unknown()
            if (config.organizationId!=org || config.businessId!=context.businessId || config.providerStoreId!=context.providerStoreId ||
                config.merchantCurrencyCode.uppercase()!=context.currencyCode.uppercase() ||
                context.originalCaptureId!=contextConfig ||
                context.providerDeviceId.isNullOrBlank() || context.providerStoreId.isNullOrBlank() ||
                context.targetPosDeviceId.isNullOrBlank() ||
                (poyntBridgeTerminalCheck?.invoke(org,integrationId,context.targetPosDeviceId!!,
                    context.businessId!!,context.providerStoreId!!,context.providerDeviceId!!) != true) ||
                poyntBridgeRefundCallbackUrl.isBlank() || poyntBridgeCallbackHeaderName.isBlank() ||
                poyntBridgeCallbackHeaderValue.isBlank() || poyntBridgeTtlSeconds<=0) return unknown()
            // Cloud-message accepted means dispatched only; financial success is callback-driven.
            configuredClient.dispatchRefund(config, PoyntBridgeRefundDispatchRequest(
                context.originalCaptureId,context.paymentRefundAttemptId,context.refundAmountMinor,
                context.currencyCode,config.businessId,context.providerStoreId!!,context.providerDeviceId!!,
                poyntBridgeRefundCallbackUrl,poyntBridgeCallbackHeaderName,poyntBridgeCallbackHeaderValue,poyntBridgeTtlSeconds))
            // Claim already persisted PENDING before dispatch. Callback may have arrived first.
            return executionStatus(org,id,actor)
        } catch (_:Exception) {
            // The POST may have reached the terminal; never resend automatically.
            val current = executionStatus(org,id,actor)
            if (current.executionStatus == "SUCCEEDED") return current
            return unknown()
        }
    }

    fun verifyPoyntBridgeReference(org:String,id:String,body:PoyntBridgeReferenceVerificationRequestDto,
        actor:String):PoyntCollectReferenceVerificationDto {
        if (body.organizationId!=org || body.paymentRefundAttemptId.isBlank() ||
            body.providerTransactionId.trim().length !in 1..160 || body.attestation.trim().length !in 10..1000)
            throw BadRequestException("Bridge refund verification request is invalid")
        val detail=detail(org,id,actor)
        if (detail.originalProviderCode!="POYNT_PAYMENT_BRIDGE" || detail.executionStatus!="UNKNOWN_REQUIRES_RECONCILIATION")
            throw BadRequestException("Bridge refund is not awaiting reference verification")
        val context=sql().poyntBridgeContext(org,id,actor)
            ?: throw BadRequestException("Bridge refund execution context missing")
        if (context.paymentRefundAttemptId!=body.paymentRefundAttemptId)
            throw BadRequestException("Bridge refund attempt reference mismatch")
        val integrationId=context.integrationConfigurationId ?:throw BadRequestException("Bridge integration missing")
        val config=poyntBridgeConfiguration?.invoke(org,integrationId,actor)
            ?:throw BadRequestException("Bridge provider verification unavailable")
        if (config.organizationId!=org || config.businessId!=context.businessId ||
            config.providerStoreId!=context.providerStoreId ||
            !((poyntBridgeRefundClient?.verifyRefundReference(config,context.originalCaptureId,
                context.paymentRefundAttemptId,context.refundAmountMinor,context.currencyCode,
                body.providerTransactionId.trim())) ?: false))
            throw BadRequestException("Independent Bridge refund provider evidence could not be verified")
        return sql().bridgeRecordVerification("PRV_${UUID.randomUUID()}",org,id,
            context.paymentRefundAttemptId,body.providerTransactionId.trim(),body.attestation.trim(),actor)
            ?:throw BadRequestException("Bridge refund verification could not be persisted")
    }

    fun confirmPoyntBridgeReference(org:String,id:String,body:PoyntBridgeReferenceConfirmationDto,
        actor:String):PaymentRefundExecutionStatusDto {
        if (body.organizationId!=org || body.paymentRefundAttemptId.isBlank() || body.verificationId.isBlank())
            throw BadRequestException("Bridge recovery confirmation is invalid")
        return sql().bridgeConfirmVerification(org,id,body.paymentRefundAttemptId,body.verificationId,actor)
            ?: throw BadRequestException("Bridge recovery confirmation is not available")
    }

    fun reconcilePoyntBridge(org:String,id:String,actor:String):PaymentRefundExecutionStatusDto {
        val context=sql().poyntBridgeContext(org,id,actor)
            ?: throw BadRequestException("Bridge refund has no execution attempt")
        val current=executionStatus(org,id,actor)
        if(current.executionStatus !in setOf("PENDING","UNKNOWN_REQUIRES_RECONCILIATION")) return current
        val integrationId=context.integrationConfigurationId ?:return current
        val config=poyntBridgeConfiguration?.invoke(org,integrationId,actor) ?:return current
        if(config.organizationId!=org || config.businessId!=context.businessId ||
            config.providerStoreId!=context.providerStoreId) return current
        val client=poyntBridgeRefundClient ?:return current
        // Both provider operations are HTTP GET, never refund POST.
        val reference=client.lookupRefundReference(config,context.paymentRefundAttemptId) ?:return current
        if(!client.verifyRefundReference(config,context.originalCaptureId,
            context.paymentRefundAttemptId,context.refundAmountMinor,context.currencyCode,reference)) return current
        return sql().bridgeCallback(context.paymentRefundAttemptId,"SUCCEEDED",reference,
            context.originalCaptureId,context.refundAmountMinor,context.currencyCode,
            context.businessId,context.providerStoreId) ?:current
    }

    fun recordPoyntBridgeCallback(callback:PoyntBridgeRefundCallback):PaymentRefundExecutionStatusDto? {
        if (callback.status in setOf("RECEIVED","STARTED")) return null
        val tx=callback.usableRefundTransaction()
        val verified=(callback.status=="PROCESSED" && tx!=null && tx.status=="REFUNDED" &&
          tx.action=="REFUND" && tx.id.isNotBlank() && !tx.authOnly &&
          tx.parentId!=null && tx.processorStatus=="Successful" &&
          !tx.invalidApprovedAmount && (tx.approvedAmount==null || tx.approvedAmount==tx.amountMinor) &&
          tx.amountMinor!=null && tx.amountMinor>0 && tx.currencyCode!=null &&
          tx.businessId!=null && tx.storeId!=null)
        return sql().bridgeCallback(callback.referenceId,
            if(verified) "SUCCEEDED" else "UNKNOWN_REQUIRES_RECONCILIATION",
            if(verified) tx?.id else null,if(verified) tx?.parentId else null,
            if(verified) tx?.amountMinor else null,
            if(verified) tx?.currencyCode else null,if(verified) tx?.businessId else null,
            if(verified) tx?.storeId else null)
    }

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
        organizationId: String,
        refundId: String,
        request: PoyntCollectVerifiedReferenceRequestDto,
        actor: String
    ): PoyntCollectReferenceVerificationDto {
        validateRecoveryRequest(organizationId, refundId, request)
        val context = sql().platformPoyntCollectRecoveryContext(
            organizationId, refundId, request.paymentRefundAttemptId, actor
        ) ?: throw BadRequestException("Collect refund recovery is not available")
        val result = poyntCollectRefundAdapter?.verifyProviderReference(
            request(context), request.providerTransactionId.trim()
        ) ?: PoyntCollectRefundResult(PaymentRefundProviderOutcome.UNKNOWN_REQUIRES_RECONCILIATION)
        if (
            result.outcome == PaymentRefundProviderOutcome.SUCCEEDED &&
            result.providerReference == request.providerTransactionId.trim()
        ) {
            return sql().recordPoyntCollectReferenceVerification(
                "PRV_${UUID.randomUUID()}", organizationId, refundId,
                request.paymentRefundAttemptId, request.providerTransactionId.trim(),
                result.providerOriginalRequestId, request.attestation.trim(), actor
            ) ?: throw BadRequestException("Collect refund verification could not be recorded")
        }
        throw BadRequestException("Collect refund provider evidence could not be verified")
    }

    fun confirmPoyntCollectReference(
        organizationId: String,
        refundId: String,
        request: PoyntCollectVerifiedReferenceConfirmationDto,
        actor: String
    ): PaymentRefundExecutionStatusDto {
        if (organizationId.isBlank() || refundId.isBlank() || request.organizationId != organizationId ||
            request.paymentRefundAttemptId.isBlank() || request.verificationId.isBlank()
        ) throw BadRequestException("Collect refund recovery confirmation is invalid")
        return sql().confirmPoyntCollectReference(
            organizationId, refundId, request.paymentRefundAttemptId,
            request.verificationId, actor
        ) ?: throw BadRequestException("Collect refund recovery confirmation is unavailable")
    }

    private fun validateRecoveryRequest(
        organizationId: String,
        refundId: String,
        request: PoyntCollectVerifiedReferenceRequestDto
    ) {
        if (organizationId.isBlank() || refundId.isBlank() || request.organizationId != organizationId ||
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
