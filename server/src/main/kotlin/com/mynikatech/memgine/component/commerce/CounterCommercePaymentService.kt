package com.mynikatech.memgine.component.commerce

import com.mynikatech.memgine.exception.ApiException
import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.exception.ConflictException
import com.mynikatech.memgine.exception.ForbiddenException
import com.mynikatech.memgine.exception.NotFoundException
import com.mynikatech.memgine.net.dto.CommerceCapability
import com.mynikatech.memgine.net.dto.CommerceCheckoutRequest
import com.mynikatech.memgine.net.dto.CommerceRemoteTerminalPaymentDispatchDto
import com.mynikatech.memgine.net.dto.CommerceTerminalPaymentInstruction
import com.mynikatech.memgine.net.dto.CommerceTerminalPaymentResultRequest
import com.mynikatech.memgine.net.dto.CommerceTransactionLineDto
import org.jdbi.v3.core.Jdbi
import org.jdbi.v3.sqlobject.config.RegisterBeanMapper
import org.jdbi.v3.sqlobject.customizer.Bind
import org.jdbi.v3.sqlobject.statement.SqlQuery
import org.postgresql.util.PSQLException
import java.util.UUID

/**
 * Counter-only Commerce payment orchestration.
 *
 * Customer identification and purchase OTP remain owned by CounterService.
 * This service starts only after a verified Counter membership purchase has
 * produced a Commerce-correlated PaymentIntent.
 */
class CounterCommercePaymentService(
    private val jdbi: Jdbi,
    private val providers: CommerceProviderRegistry,
    private val remotePaymentConfiguration: CommerceRemotePaymentConfiguration
) {
    private fun sql(): CounterCommercePaymentSql = jdbi.onDemand(CounterCommercePaymentSql::class.java)

    fun prepareMembershipProviderOrder(
        organizationId: String,
        transactionId: String,
        actorUserId: String
    ) = translate {
        val transaction = transaction(organizationId, transactionId, actorUserId)

        if (transaction.status == "ORDER_CREATED") return@translate
        if (transaction.status != "READY_FOR_PROVIDER") {
            throw ConflictException("Counter membership transaction is not ready for provider order")
        }

        val route = sql().provider(transaction.transactionId, actorUserId)
            ?: throw BadRequestException("Counter payment provider is unavailable")

        if (route.providerCode != "POYNT") {
            throw BadRequestException("Counter provider order is not required for ${route.providerCode}")
        }
        if (route.integrationConfigurationId.isNullOrBlank()) {
            throw BadRequestException("Poynt Commerce integration is unavailable")
        }

        val provider = providers.checkoutProvider(route.providerCode)
            ?: throw BadRequestException("Commerce checkout provider is unavailable")
        if (CommerceCapability.ORDER !in provider.capabilities) {
            throw BadRequestException("Commerce provider does not support orders")
        }

        val lines = sql().lines(transaction.transactionId, actorUserId).map(::lineDto)
        if (lines.size != 1 || lines.single().lineType != "MEMBERSHIP") {
            throw BadRequestException("Counter membership transaction must contain exactly one membership line")
        }

        val currency = transaction.currencyCode?.uppercase()
            ?.takeIf { it.matches(Regex("^[A-Z]{3}$")) }
            ?: throw BadRequestException("Commerce payment currency is unavailable")
        val subtotal = transaction.subtotalMinor
            ?: throw BadRequestException("Commerce subtotal is unavailable")
        val tax = transaction.taxTotalMinor
            ?: throw BadRequestException("Commerce tax is unavailable")
        val total = transaction.totalMinor
            ?: throw BadRequestException("Commerce total is unavailable")

        val request = CommerceCheckoutRequest(
            organizationId = transaction.organizationId,
            transactionId = transaction.transactionId,
            storeId = transaction.storeId,
            customerUserId = transaction.customerUserId,
            sourceChannel = transaction.sourceChannel,
            idempotencyKey = transaction.idempotencyKey,
            lines = lines,
            adjustments = emptyList(),
            currencyCode = currency,
            integrationConfigurationId = route.integrationConfigurationId,
            actorUserId = actorUserId,
            authoritativeTaxTotalMinor = tax,
            authoritativeTotalMinor = total
        )

        provider.prepareCheckout(request)
        val result = provider.startCheckout(request)

        val providerOrderId = result.providerOrderId?.trim()?.takeIf { it.isNotEmpty() }
            ?: throw BadRequestException("Poynt order response did not include an order ID")
        if (result.subtotalMinor != subtotal ||
            result.adjustmentTotalMinor != 0L ||
            result.taxTotalMinor != tax ||
            result.totalMinor != total ||
            result.currencyCode?.uppercase() != currency) {
            throw ConflictException("Poynt membership order totals do not match the Commerce transaction")
        }

        if (!sql().persistProviderOrder(
                transaction.transactionId,
                providerOrderId,
                subtotal,
                tax,
                total,
                currency,
                actorUserId
            )) {
            throw ConflictException("Counter membership provider order was not persisted")
        }
    }

    fun startLocalTerminalPayment(
        organizationId: String,
        transactionId: String,
        actorUserId: String
    ): CommerceTerminalPaymentInstruction = translate {
        val transaction = transaction(organizationId, transactionId, actorUserId)
        val route = sql().provider(transaction.transactionId, actorUserId)
            ?: throw BadRequestException("Counter payment provider is unavailable")

        if (route.providerCode != "POYNT" ||
            CommerceCapability.TERMINAL_PAYMENT !in providers.capabilities(route.providerCode)) {
            throw BadRequestException("Configured Counter provider does not support local terminal payment")
        }
        if (transaction.status != "ORDER_CREATED") {
            throw ConflictException("Counter membership transaction is not ready for terminal payment")
        }

        val providerOrderId = transaction.providerOrderId?.takeIf { it.isNotBlank() }
            ?: throw BadRequestException("Poynt provider order is unavailable")
        val amount = transaction.totalMinor?.takeIf { it > 0 }
            ?: throw BadRequestException("Commerce payment amount is unavailable")
        val currency = transaction.currencyCode?.uppercase()
            ?.takeIf { it.matches(Regex("^[A-Z]{3}$")) }
            ?: throw BadRequestException("Commerce payment currency is unavailable")

        if (!sql().startLocalTerminalPayment(organizationId, transaction.transactionId, actorUserId)) {
            throw ConflictException("Counter terminal payment was not started")
        }

        CommerceTerminalPaymentInstruction(
            commerceTransactionId = transaction.transactionId,
            providerCode = route.providerCode,
            providerOrderId = providerOrderId,
            amountMinor = amount,
            currencyCode = currency,
            referenceId = transaction.transactionId
        )
    }

    fun recordLocalTerminalPaymentResult(
        organizationId: String,
        transactionId: String,
        actorUserId: String,
        request: CommerceTerminalPaymentResultRequest
    ): Boolean = translate {
        val status = request.providerStatus.trim().uppercase()
        if (status !in setOf("SUCCEEDED", "FAILED", "CANCELLED")) {
            throw BadRequestException("Invalid terminal payment status")
        }
        if (!request.currencyCode.matches(Regex("^[A-Z]{3}$"))) {
            throw BadRequestException("Invalid terminal payment currency")
        }
        if ((request.failureCode?.length ?: 0) > 80 || (request.failureMessage?.length ?: 0) > 500) {
            throw BadRequestException("Terminal payment failure detail is too long")
        }

        sql().recordLocalTerminalPaymentResult(
            organizationId,
            transactionId,
            request.providerTransactionId,
            status,
            request.amountMinor,
            request.currencyCode.uppercase(),
            request.failureCode,
            request.failureMessage,
            actorUserId
        )
    }

    fun startRemoteTerminalPayment(
        organizationId: String,
        transactionId: String,
        storeId: String,
        staffId: String,
        actorUserId: String
    ): CommerceRemoteTerminalPaymentDispatchDto = translate {
        val callbackUrl = remotePaymentConfiguration.callbackUrl
        val callbackHeaderName = remotePaymentConfiguration.callbackHeaderName
        val callbackHeaderValue = remotePaymentConfiguration.callbackHeaderValue
        val ttlSeconds = remotePaymentConfiguration.ttlSeconds
        if (callbackUrl.isBlank() || callbackHeaderName.isBlank() || callbackHeaderValue.isBlank() || ttlSeconds <= 0) {
            throw BadRequestException("Poynt Payment Bridge is not configured")
        }

        val transaction = transaction(organizationId, transactionId, actorUserId)
        if (transaction.storeId != storeId) {
            throw ForbiddenException("Counter store does not match this Commerce transaction")
        }

        val route = sql().provider(transaction.transactionId, actorUserId)
            ?: throw BadRequestException("Counter payment provider is unavailable")
        if (route.providerCode != "POYNT") {
            throw BadRequestException("Configured Counter provider does not support Poynt terminal payment")
        }
        val provider = providers.remoteTerminalPaymentProvider(route.providerCode)
            ?: throw BadRequestException("Commerce provider does not support remote terminal payment")

        val posDeviceId = sql().resolvePosDevice(organizationId, storeId, staffId, actorUserId)
        val reference = "MRP-${UUID.randomUUID()}"
        val row = sql().beginRemoteTerminalPayment(
            organizationId,
            transaction.transactionId,
            posDeviceId,
            reference,
            actorUserId
        )

        if (!row.alreadyDispatched) {
            provider.dispatchRemoteTerminalPayment(
                CommerceRemoteTerminalPaymentRequest(
                    organizationId = organizationId,
                    integrationConfigurationId = row.integrationConfigurationId,
                    actorUserId = actorUserId,
                    providerOrderId = row.providerOrderId,
                    amountMinor = row.amountMinor,
                    currencyCode = row.currencyCode,
                    referenceId = row.providerReferenceId,
                    target = CommerceRemoteTerminalTarget(
                        row.providerBusinessId,
                        row.providerStoreId,
                        row.providerDeviceId
                    ),
                    callbackUrl = callbackUrl,
                    callbackHeaderName = callbackHeaderName,
                    callbackHeaderValue = callbackHeaderValue,
                    ttlSeconds = ttlSeconds,
                    transactionId = transaction.transactionId
                )
            )
            sql().markRemotePaymentDispatched(row.providerReferenceId)
        }

        CommerceRemoteTerminalPaymentDispatchDto(
            commerceTransactionId = transaction.transactionId,
            referenceId = row.providerReferenceId,
            status = "PROVIDER_IN_PROGRESS"
        )
    }

    fun finalizeRemoteTerminalPayment(referenceId: String) = translate {
        sql().finalizeRemoteTerminalPayment(referenceId.trim())
    }

    private fun transaction(
        organizationId: String,
        transactionId: String,
        actorUserId: String
    ): CounterCommerceTransactionRow = sql().transaction(organizationId, transactionId, actorUserId)
        ?: throw NotFoundException("Counter Commerce transaction was not found")

    private fun lineDto(row: CounterCommerceLineRow) = CommerceTransactionLineDto(
        lineId = row.lineId,
        transactionId = row.transactionId,
        lineType = row.lineType,
        sourceEntityType = null,
        sourceEntityId = null,
        productMappingId = null,
        subscriptionPlanId = row.subscriptionPlanId,
        externalProductId = null,
        externalVariantId = null,
        description = row.description,
        quantity = row.quantity,
        unitPriceMinorSnapshot = null,
        unitPriceMinorAuthoritative = row.unitPriceMinorAuthoritative,
        lineSubtotalMinor = row.lineSubtotalMinor,
        currencyCode = row.currencyCode,
        priceSource = row.priceSource,
        metadataJson = null,
        versionNo = 1
    )

    private fun <T> translate(action: () -> T): T {
        try {
            return action()
        } catch (error: ApiException) {
            throw error
        } catch (error: Exception) {
            val postgres = generateSequence<Throwable>(error) { it.cause }
                .filterIsInstance<PSQLException>()
                .firstOrNull()
            when (postgres?.sqlState) {
                "42501" -> throw ForbiddenException("Counter Commerce operation is not permitted")
                "23505", "40001" -> throw ConflictException("Counter Commerce state changed; retry the request")
                "22001", "22003", "22023", "23502", "23503", "23514", "P0002" ->
                    throw BadRequestException("Counter Commerce payment details are unavailable")
                else -> throw error
            }
        }
    }
}

class CounterCommerceTransactionRow {
    var transactionId: String = ""
    var organizationId: String = ""
    var storeId: String? = null
    var customerUserId: String? = null
    var integrationConfigurationId: String? = null
    var sourceChannel: String = ""
    var status: String = ""
    var currencyCode: String? = null
    var subtotalMinor: Long? = null
    var adjustmentTotalMinor: Long? = null
    var taxTotalMinor: Long? = null
    var totalMinor: Long? = null
    var providerOrderId: String? = null
    var idempotencyKey: String = ""
}

class CounterCommerceLineRow {
    var lineId: String = ""
    var transactionId: String = ""
    var lineType: String = ""
    var subscriptionPlanId: String? = null
    var description: String = ""
    var quantity: Int = 0
    var unitPriceMinorAuthoritative: Long? = null
    var lineSubtotalMinor: Long? = null
    var currencyCode: String? = null
    var priceSource: String = ""
}

class CounterCommerceProviderRow {
    var providerCode: String = ""
    var integrationConfigurationId: String? = null
}

class CounterCommerceRemotePaymentStartRow {
    var alreadyDispatched: Boolean = false
    var integrationConfigurationId: String = ""
    var providerOrderId: String = ""
    var amountMinor: Long = 0
    var currencyCode: String = ""
    var providerBusinessId: String = ""
    var providerStoreId: String = ""
    var providerDeviceId: String = ""
    var providerReferenceId: String = ""
}

interface CounterCommercePaymentSql {
    @SqlQuery("SELECT * FROM commerce_get_counter_membership_transaction(:organizationId,:transactionId,:actorUserId)")
    @RegisterBeanMapper(CounterCommerceTransactionRow::class)
    fun transaction(
        @Bind("organizationId") organizationId: String,
        @Bind("transactionId") transactionId: String,
        @Bind("actorUserId") actorUserId: String
    ): CounterCommerceTransactionRow?

    @SqlQuery("SELECT * FROM commerce_get_counter_membership_lines(:transactionId,:actorUserId)")
    @RegisterBeanMapper(CounterCommerceLineRow::class)
    fun lines(
        @Bind("transactionId") transactionId: String,
        @Bind("actorUserId") actorUserId: String
    ): List<CounterCommerceLineRow>

    @SqlQuery("SELECT * FROM commerce_get_counter_payment_provider(:transactionId,:actorUserId)")
    @RegisterBeanMapper(CounterCommerceProviderRow::class)
    fun provider(
        @Bind("transactionId") transactionId: String,
        @Bind("actorUserId") actorUserId: String
    ): CounterCommerceProviderRow?

    @SqlQuery("SELECT commerce_persist_counter_membership_provider_order(:transactionId,:providerOrderId,:subtotalMinor,:taxTotalMinor,:totalMinor,:currencyCode,:actorUserId)")
    fun persistProviderOrder(
        @Bind("transactionId") transactionId: String,
        @Bind("providerOrderId") providerOrderId: String,
        @Bind("subtotalMinor") subtotalMinor: Long,
        @Bind("taxTotalMinor") taxTotalMinor: Long,
        @Bind("totalMinor") totalMinor: Long,
        @Bind("currencyCode") currencyCode: String,
        @Bind("actorUserId") actorUserId: String
    ): Boolean

    @SqlQuery("SELECT commerce_start_counter_terminal_payment(:organizationId,:transactionId,:actorUserId)")
    fun startLocalTerminalPayment(
        @Bind("organizationId") organizationId: String,
        @Bind("transactionId") transactionId: String,
        @Bind("actorUserId") actorUserId: String
    ): Boolean

    @SqlQuery("SELECT commerce_record_counter_terminal_payment_result(:organizationId,:transactionId,:providerTransactionId,:providerStatus,:amountMinor,:currencyCode,:failureCode,:failureMessage,:actorUserId)")
    fun recordLocalTerminalPaymentResult(
        @Bind("organizationId") organizationId: String,
        @Bind("transactionId") transactionId: String,
        @Bind("providerTransactionId") providerTransactionId: String?,
        @Bind("providerStatus") providerStatus: String,
        @Bind("amountMinor") amountMinor: Long,
        @Bind("currencyCode") currencyCode: String,
        @Bind("failureCode") failureCode: String?,
        @Bind("failureMessage") failureMessage: String?,
        @Bind("actorUserId") actorUserId: String
    ): Boolean

    @SqlQuery("SELECT commerce_resolve_counter_pos_device(:organizationId,:storeId,:staffId,:actorUserId)")
    fun resolvePosDevice(
        @Bind("organizationId") organizationId: String,
        @Bind("storeId") storeId: String,
        @Bind("staffId") staffId: String,
        @Bind("actorUserId") actorUserId: String
    ): String

    @SqlQuery("SELECT * FROM commerce_begin_counter_remote_terminal_payment(:organizationId,:transactionId,:posDeviceId,:referenceId,:actorUserId)")
    @RegisterBeanMapper(CounterCommerceRemotePaymentStartRow::class)
    fun beginRemoteTerminalPayment(
        @Bind("organizationId") organizationId: String,
        @Bind("transactionId") transactionId: String,
        @Bind("posDeviceId") posDeviceId: String,
        @Bind("referenceId") referenceId: String,
        @Bind("actorUserId") actorUserId: String
    ): CounterCommerceRemotePaymentStartRow

    @SqlQuery("SELECT commerce_mark_remote_payment_dispatched(:referenceId)")
    fun markRemotePaymentDispatched(@Bind("referenceId") referenceId: String): Boolean

    @SqlQuery("SELECT commerce_finalize_counter_payment_by_reference(:referenceId)")
    fun finalizeRemoteTerminalPayment(@Bind("referenceId") referenceId: String): String?
}
