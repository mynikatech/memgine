package com.mynikatech.memgine.component.commerce

import com.mynikatech.memgine.exception.ApiException
import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.exception.ConflictException
import com.mynikatech.memgine.exception.ForbiddenException
import com.mynikatech.memgine.exception.NotFoundException
import com.mynikatech.memgine.net.dto.CommerceCapability
import com.mynikatech.memgine.net.dto.CommerceCheckoutAdjustment
import com.mynikatech.memgine.net.dto.CommerceCheckoutRequest
import com.mynikatech.memgine.net.dto.CommerceCheckoutResult
import com.mynikatech.memgine.net.dto.CommerceRemoteTerminalPaymentDispatchDto
import com.mynikatech.memgine.net.dto.CommerceTerminalPaymentInstruction
import com.mynikatech.memgine.net.dto.CommerceTerminalPaymentResultRequest
import com.mynikatech.memgine.net.dto.CommerceTransactionAdjustmentDto
import com.mynikatech.memgine.net.dto.CommerceTransactionLineDto
import com.mynikatech.memgine.net.dto.CounterRedemptionCheckoutDto
import com.mynikatech.memgine.net.dto.CounterRedemptionTestPaymentRequest
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.jdbi.v3.core.Jdbi
import org.jdbi.v3.sqlobject.config.RegisterBeanMapper
import org.jdbi.v3.sqlobject.customizer.Bind
import org.jdbi.v3.sqlobject.statement.SqlQuery
import org.postgresql.util.PSQLException
import java.util.UUID

/**
 * Counter-only Commerce payment orchestration.
 *
 * Membership checkout keeps its existing PaymentIntent-correlated lifecycle.
 * Benefit/Offer redemption uses a separate COUNTER_REDEMPTION Commerce lifecycle:
 *
 *   Redemption PENDING
 *      -> provider order
 *      -> provider payment (when total > 0)
 *      -> migration-123 atomic entitlement finalization
 *
 * A provider order alone never consumes a Benefit or Offer.
 */
class CounterCommercePaymentService(
    private val jdbi: Jdbi,
    private val providers: CommerceProviderRegistry,
    private val remotePaymentConfiguration: CommerceRemotePaymentConfiguration,
    private val testProviderEnabled: Boolean = false
) {
    private fun sql(): CounterCommercePaymentSql =
        jdbi.onDemand(CounterCommercePaymentSql::class.java)

    /*
     * -------------------------------------------------------------------------
     * Existing Counter membership payment flow
     * -------------------------------------------------------------------------
     */

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
            ?.takeIf { it.matches(CURRENCY_CODE) }
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
            ?.takeIf { it.matches(CURRENCY_CODE) }
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
        if (status !in PAYMENT_RESULTS) {
            throw BadRequestException("Invalid terminal payment status")
        }
        if (!request.currencyCode.matches(CURRENCY_CODE)) {
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
        requireRemotePaymentConfiguration()

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
            dispatchRemotePayment(
                provider,
                organizationId,
                actorUserId,
                transaction.transactionId,
                row
            )
        }

        CommerceRemoteTerminalPaymentDispatchDto(
            commerceTransactionId = transaction.transactionId,
            referenceId = row.providerReferenceId,
            status = "PROVIDER_IN_PROGRESS"
        )
    }

    /*
     * -------------------------------------------------------------------------
     * Counter Benefit / Offer redemption POS checkout
     * -------------------------------------------------------------------------
     */

    /**
     * Prepares/reuses the Commerce basket and provider order.
     *
     * This method is intentionally idempotent. It may be called after a browser
     * retry or reload; persisted ORDER_CREATED / PROVIDER_IN_PROGRESS /
     * COMPLETED state wins.
     */
    fun prepareRedemptionCheckout(
        organizationId: String,
        redemptionTransactionId: String,
        storeId: String,
        staffId: String,
        actorUserId: String
    ): CounterRedemptionCheckoutDto = translate {
        var checkout = sql().redemptionCheckout(
            organizationId,
            redemptionTransactionId,
            storeId,
            staffId,
            actorUserId
        )

        if (checkout == null) {
            sql().prepareRedemptionCheckout(
                redemptionTransactionId,
                organizationId,
                storeId,
                staffId,
                actorUserId
            ) ?: throw BadRequestException("Unable to prepare Counter redemption checkout")

            checkout = redemptionCheckout(
                organizationId,
                redemptionTransactionId,
                storeId,
                staffId,
                actorUserId
            )
        }

        when (checkout.commerceStatus) {
            "READY_FOR_PROVIDER" -> {
                when (checkout.providerCode.uppercase()) {
                    "POYNT" -> createPoyntRedemptionOrder(checkout, actorUserId)
                    "TEST" -> createTestRedemptionOrder(checkout, actorUserId)
                    else -> throw BadRequestException(
                        "Configured Counter redemption provider is not supported"
                    )
                }

                checkout = redemptionCheckout(
                    organizationId,
                    redemptionTransactionId,
                    storeId,
                    staffId,
                    actorUserId
                )
            }

            "PROVIDER_SUCCEEDED" -> {
                sql().finalizeRedemption(checkout.commerceTransactionId, actorUserId)
                checkout = redemptionCheckout(
                    organizationId,
                    redemptionTransactionId,
                    storeId,
                    staffId,
                    actorUserId
                )
            }
        }

        if (checkout.commerceStatus == "ORDER_CREATED" && checkout.totalMinor == 0L) {
            if (!sql().completeZeroValueRedemption(
                    organizationId,
                    checkout.commerceTransactionId,
                    actorUserId
                )) {
                throw ConflictException("Zero-value redemption was not finalized")
            }

            checkout = redemptionCheckout(
                organizationId,
                redemptionTransactionId,
                storeId,
                staffId,
                actorUserId
            )
        }

        redemptionCheckoutDto(checkout)
    }

    fun redemptionCheckoutStatus(
        organizationId: String,
        redemptionTransactionId: String,
        storeId: String,
        staffId: String,
        actorUserId: String
    ): CounterRedemptionCheckoutDto = translate {
        var checkout = redemptionCheckout(
            organizationId,
            redemptionTransactionId,
            storeId,
            staffId,
            actorUserId
        )

        if (checkout.commerceStatus == "PROVIDER_SUCCEEDED") {
            sql().finalizeRedemption(checkout.commerceTransactionId, actorUserId)
            checkout = redemptionCheckout(
                organizationId,
                redemptionTransactionId,
                storeId,
                staffId,
                actorUserId
            )
        }

        redemptionCheckoutDto(checkout)
    }

    fun startRedemptionRemoteTerminalPayment(
        organizationId: String,
        redemptionTransactionId: String,
        storeId: String,
        staffId: String,
        actorUserId: String
    ): CommerceRemoteTerminalPaymentDispatchDto = translate {
        requireRemotePaymentConfiguration()

        val checkout = redemptionCheckout(
            organizationId,
            redemptionTransactionId,
            storeId,
            staffId,
            actorUserId
        )

        if (checkout.providerCode.uppercase() != "POYNT") {
            throw BadRequestException("Configured redemption provider does not support Poynt terminal payment")
        }
        if (checkout.commerceStatus != "ORDER_CREATED") {
            throw ConflictException("Counter redemption is not ready for terminal payment")
        }
        if ((checkout.totalMinor ?: 0L) <= 0L) {
            throw BadRequestException("Counter redemption does not require terminal payment")
        }

        val provider = providers.remoteTerminalPaymentProvider("POYNT")
            ?: throw BadRequestException("Commerce provider does not support remote terminal payment")

        val posDeviceId = sql().resolvePosDevice(
            organizationId,
            storeId,
            staffId,
            actorUserId
        )
        val reference = "RDP-${UUID.randomUUID()}"
        val row = sql().beginRedemptionRemoteTerminalPayment(
            organizationId,
            checkout.commerceTransactionId,
            posDeviceId,
            reference,
            actorUserId
        )

        if (!row.alreadyDispatched) {
            dispatchRemotePayment(
                provider,
                organizationId,
                actorUserId,
                checkout.commerceTransactionId,
                row
            )
        }

        CommerceRemoteTerminalPaymentDispatchDto(
            commerceTransactionId = checkout.commerceTransactionId,
            referenceId = row.providerReferenceId,
            status = "PROVIDER_IN_PROGRESS"
        )
    }

    fun confirmRedemptionTestPayment(
        organizationId: String,
        redemptionTransactionId: String,
        storeId: String,
        staffId: String,
        actorUserId: String,
        request: CounterRedemptionTestPaymentRequest
    ): CounterRedemptionCheckoutDto = translate {
        if (!testProviderEnabled) {
            throw ForbiddenException("TEST payment provider is unavailable in this environment")
        }

        val status = request.status.trim().uppercase()
        if (status !in PAYMENT_RESULTS) {
            throw BadRequestException("Invalid TEST payment status")
        }
        if ((request.failureCode?.length ?: 0) > 80 ||
            (request.failureMessage?.length ?: 0) > 500) {
            throw BadRequestException("TEST payment failure detail is too long")
        }

        val checkout = redemptionCheckout(
            organizationId,
            redemptionTransactionId,
            storeId,
            staffId,
            actorUserId
        )

        if (checkout.providerCode.uppercase() != "TEST") {
            throw BadRequestException("This redemption is not using the TEST provider")
        }

        if (!sql().recordRedemptionTestResult(
                organizationId,
                checkout.commerceTransactionId,
                status,
                if (status == "SUCCEEDED") "test-${checkout.commerceTransactionId}" else null,
                request.failureCode,
                request.failureMessage,
                actorUserId
            )) {
            throw ConflictException("TEST redemption payment result was not persisted")
        }

        redemptionCheckoutDto(
            redemptionCheckout(
                organizationId,
                redemptionTransactionId,
                storeId,
                staffId,
                actorUserId
            )
        )
    }

    fun finalizeRemoteTerminalPayment(referenceId: String) = translate {
        sql().finalizeRemoteTerminalPayment(referenceId.trim())
    }

    /*
     * -------------------------------------------------------------------------
     * Provider order creation
     * -------------------------------------------------------------------------
     */

    private fun createPoyntRedemptionOrder(
        checkout: CounterRedemptionCheckoutRow,
        actorUserId: String
    ) {
        val integrationId = checkout.integrationConfigurationId
            ?.takeIf { it.isNotBlank() }
            ?: throw BadRequestException("Poynt Commerce integration is unavailable")

        val catalogProvider = providers.catalogProvider("POYNT")
            ?: throw BadRequestException("Poynt product lookup is unavailable")
        val checkoutProvider = providers.checkoutProvider("POYNT")
            ?: throw BadRequestException("Poynt checkout provider is unavailable")

        if (CommerceCapability.ORDER !in checkoutProvider.capabilities ||
            CommerceCapability.PRODUCT_LOOKUP !in catalogProvider.capabilities) {
            throw BadRequestException("Poynt Commerce capabilities are unavailable")
        }

        val baseLines = sql().redemptionLines(
            checkout.commerceTransactionId,
            actorUserId
        ).map(::redemptionLineDto)

        if (baseLines.isEmpty() || baseLines.any { it.lineType != "EXTERNAL_PRODUCT" }) {
            throw BadRequestException("Counter redemption requires POS product lines")
        }

        val pricedLines = baseLines.map { line ->
            val externalProductId = line.externalProductId
                ?.takeIf { it.isNotBlank() }
                ?: throw BadRequestException("Counter redemption POS product is unavailable")

            val current = catalogProvider.getProduct(
                CommerceCatalogProductRequest(
                    organizationId = checkout.organizationId,
                    integrationConfigurationId = integrationId,
                    storeId = checkout.storeId,
                    externalProductId = externalProductId,
                    externalVariantId = line.externalVariantId,
                    actorUserId = actorUserId,
                    transactionId = checkout.commerceTransactionId
                )
            ) ?: throw BadRequestException("Current POS product is unavailable")

            val currentCurrency = current.currencyCode.uppercase()
            if (!current.active ||
                current.integrationConfigurationId != integrationId ||
                current.externalProductId != externalProductId ||
                current.externalVariantId != line.externalVariantId ||
                current.unitPriceMinorSnapshot < 0 ||
                !currentCurrency.matches(CURRENCY_CODE)) {
                throw BadRequestException("Current POS product is invalid")
            }

            line.copy(
                unitPriceMinorAuthoritative = current.unitPriceMinorSnapshot,
                lineSubtotalMinor = current.unitPriceMinorSnapshot * line.quantity.toLong(),
                currencyCode = currentCurrency,
                priceSource = "PROVIDER_FINAL"
            )
        }

        createAndPersistRedemptionOrder(
            checkout = checkout,
            actorUserId = actorUserId,
            pricedLines = pricedLines,
            checkoutProvider = checkoutProvider
        )
    }

    private fun createTestRedemptionOrder(
        checkout: CounterRedemptionCheckoutRow,
        actorUserId: String
    ) {
        if (!testProviderEnabled) {
            throw ForbiddenException("TEST payment provider is unavailable in this environment")
        }

        val pricedLines = sql().redemptionLines(
            checkout.commerceTransactionId,
            actorUserId
        ).map(::redemptionLineDto)
            .map { line ->
                val unit = line.unitPriceMinorSnapshot
                    ?: throw BadRequestException("TEST POS product price is unavailable")
                val currency = line.currencyCode?.uppercase()
                    ?.takeIf { it.matches(CURRENCY_CODE) }
                    ?: throw BadRequestException("TEST POS product currency is unavailable")

                if (line.lineType != "EXTERNAL_PRODUCT" || unit < 0) {
                    throw BadRequestException("TEST POS product is invalid")
                }

                line.copy(
                    unitPriceMinorAuthoritative = unit,
                    lineSubtotalMinor = unit * line.quantity.toLong(),
                    currencyCode = currency,
                    priceSource = "PROVIDER_FINAL"
                )
            }

        val currency = pricedLines.mapNotNull { it.currencyCode?.uppercase() }
            .distinct()
            .singleOrNull()
            ?: throw BadRequestException("TEST POS product currencies must match")

        val adjustments = redemptionAdjustments(
            checkout.commerceTransactionId,
            actorUserId
        )
        val materialized = materializeAdjustments(adjustments, pricedLines)
        val subtotal = pricedLines.sumOf { requireNotNull(it.lineSubtotalMinor) }
        val discount = materialized.sumOf { it.appliedAmountMinor }
        val tax = 0L
        val total = subtotal - discount

        persistRedemptionProviderOrder(
            checkout.commerceTransactionId,
            "TEST-${checkout.commerceTransactionId}",
            pricedLines,
            materialized,
            subtotal,
            discount,
            tax,
            total,
            currency,
            actorUserId
        )
    }

    private fun createAndPersistRedemptionOrder(
        checkout: CounterRedemptionCheckoutRow,
        actorUserId: String,
        pricedLines: List<CommerceTransactionLineDto>,
        checkoutProvider: CommerceCheckoutProvider
    ) {
        val currency = pricedLines.mapNotNull { it.currencyCode?.uppercase() }
            .distinct()
            .singleOrNull()
            ?: throw BadRequestException("POS product currencies must match")

        val adjustments = redemptionAdjustments(
            checkout.commerceTransactionId,
            actorUserId
        )
        val materialized = materializeAdjustments(adjustments, pricedLines)

        val request = CommerceCheckoutRequest(
            organizationId = checkout.organizationId,
            transactionId = checkout.commerceTransactionId,
            storeId = checkout.storeId,
            customerUserId = checkout.customerUserId,
            sourceChannel = "COUNTER_REDEMPTION",
            idempotencyKey = checkout.idempotencyKey,
            lines = pricedLines,
            adjustments = adjustments,
            currencyCode = currency,
            integrationConfigurationId = checkout.integrationConfigurationId,
            actorUserId = actorUserId,
            materializedAdjustments = materialized
        )

        checkoutProvider.prepareCheckout(request)
        val result = checkoutProvider.startCheckout(request)
        validateProviderOrderResult(result, pricedLines, materialized, currency)

        persistRedemptionProviderOrder(
            checkout.commerceTransactionId,
            requireNotNull(result.providerOrderId).trim(),
            pricedLines,
            materialized,
            requireNotNull(result.subtotalMinor),
            requireNotNull(result.adjustmentTotalMinor),
            requireNotNull(result.taxTotalMinor),
            requireNotNull(result.totalMinor),
            currency,
            actorUserId
        )
    }

    private fun persistRedemptionProviderOrder(
        transactionId: String,
        providerOrderId: String,
        pricedLines: List<CommerceTransactionLineDto>,
        materialized: List<CommerceCheckoutAdjustment>,
        subtotal: Long,
        adjustment: Long,
        tax: Long,
        total: Long,
        currency: String,
        actorUserId: String
    ) {
        val linesJson = Json.encodeToString(
            pricedLines.map {
                CounterAuthoritativeLinePrice(
                    it.lineId,
                    requireNotNull(it.unitPriceMinorAuthoritative),
                    requireNotNull(it.lineSubtotalMinor),
                    currency,
                    "PROVIDER_FINAL"
                )
            }
        )
        val adjustmentsJson = Json.encodeToString(
            materialized.map {
                CounterAppliedAdjustment(
                    it.adjustmentId,
                    it.appliedAmountMinor,
                    "APPLIED"
                )
            }
        )

        if (!sql().persistRedemptionProviderOrder(
                transactionId,
                providerOrderId,
                linesJson,
                adjustmentsJson,
                subtotal,
                adjustment,
                tax,
                total,
                currency,
                actorUserId
            )) {
            throw ConflictException("Counter redemption provider order was not persisted")
        }
    }

    /*
     * -------------------------------------------------------------------------
     * Shared helpers
     * -------------------------------------------------------------------------
     */

    private fun redemptionCheckout(
        organizationId: String,
        redemptionTransactionId: String,
        storeId: String,
        staffId: String,
        actorUserId: String
    ): CounterRedemptionCheckoutRow =
        sql().redemptionCheckout(
            organizationId,
            redemptionTransactionId,
            storeId,
            staffId,
            actorUserId
        ) ?: throw NotFoundException("Counter redemption checkout was not found")

    private fun redemptionCheckoutDto(
        row: CounterRedemptionCheckoutRow
    ) = CounterRedemptionCheckoutDto(
        redemptionTransactionId = row.redemptionTransactionId,
        transactionNumber = row.transactionNumber,
        redemptionStatus = row.redemptionStatus,
        redemptionCompletedAt = row.redemptionCompletedAt,
        commerceTransactionId = row.commerceTransactionId,
        providerCode = row.providerCode,
        commerceStatus = row.commerceStatus,
        subtotalMinor = row.subtotalMinor,
        adjustmentTotalMinor = row.adjustmentTotalMinor,
        taxTotalMinor = row.taxTotalMinor,
        totalMinor = row.totalMinor,
        currencyCode = row.currencyCode,
        providerOrderId = row.providerOrderId,
        providerTransactionId = row.providerTransactionId,
        failureCode = row.failureCode,
        failureMessage = row.failureMessage,
        paymentRequired = (row.totalMinor ?: 0L) > 0L &&
            row.commerceStatus !in setOf("COMPLETED", "PROVIDER_SUCCEEDED")
    )

    private fun redemptionLineDto(row: CounterRedemptionLineRow) =
        CommerceTransactionLineDto(
            lineId = row.lineId,
            transactionId = row.transactionId,
            lineType = row.lineType,
            sourceEntityType = row.sourceEntityType,
            sourceEntityId = row.sourceEntityId,
            productMappingId = row.productMappingId,
            subscriptionPlanId = null,
            externalProductId = row.externalProductId,
            externalVariantId = row.externalVariantId,
            description = row.description,
            quantity = row.quantity,
            unitPriceMinorSnapshot = row.unitPriceMinorSnapshot,
            unitPriceMinorAuthoritative = row.unitPriceMinorAuthoritative,
            lineSubtotalMinor = row.lineSubtotalMinor,
            currencyCode = row.currencyCode,
            priceSource = row.priceSource,
            metadataJson = null,
            versionNo = 1
        )

    private fun redemptionAdjustments(
        transactionId: String,
        actorUserId: String
    ): List<CommerceTransactionAdjustmentDto> =
        sql().redemptionAdjustments(transactionId, actorUserId).map { row ->
            CommerceTransactionAdjustmentDto(
                adjustmentId = row.adjustmentId,
                transactionId = row.transactionId,
                targetLineId = row.targetLineId,
                commerceAdjustmentId = row.commerceAdjustmentId,
                sourceType = row.sourceType,
                sourceId = row.sourceId,
                adjustmentType = row.adjustmentType,
                percentage = row.percentage,
                requestedAmountMinor = row.requestedAmountMinor,
                appliedAmountMinor = row.appliedAmountMinor,
                currencyCode = row.currencyCode,
                status = row.status,
                versionNo = 1
            )
        }

    private fun materializeAdjustments(
        adjustments: List<CommerceTransactionAdjustmentDto>,
        lines: List<CommerceTransactionLineDto>
    ): List<CommerceCheckoutAdjustment> {
        val byLine = lines.associateBy { it.lineId }
        val lineRemainders = lines.associate {
            it.lineId to requireNotNull(it.lineSubtotalMinor)
        }.toMutableMap()
        var appliedOrderDiscounts = 0L

        val ordered =
            adjustments.filter { it.adjustmentType.startsWith("PRODUCT_") } +
                adjustments.filter { it.adjustmentType.startsWith("ORDER_") }

        return ordered.map { adjustment ->
            if (adjustment.status != "REQUESTED") {
                throw BadRequestException("Commerce adjustment is not pending")
            }

            val amount = when (adjustment.adjustmentType) {
                "PRODUCT_FREE",
                "PRODUCT_PERCENT_OFF",
                "PRODUCT_FIXED_OFF",
                "PRODUCT_SPECIAL_PRICE" -> {
                    val line = adjustment.targetLineId?.let(byLine::get)
                        ?: throw BadRequestException("Product adjustment target line is invalid")
                    val remainder = requireNotNull(lineRemainders[line.lineId])
                    val applied = when (adjustment.adjustmentType) {
                        "PRODUCT_FREE" -> remainder
                        "PRODUCT_PERCENT_OFF" -> (
                            remainder *
                                (adjustment.percentage
                                    ?: throw BadRequestException("Product percentage is required")) /
                                100.0
                            ).toLong()
                        "PRODUCT_FIXED_OFF" -> minOf(
                            remainder,
                            adjustment.requestedAmountMinor
                                ?: throw BadRequestException("Product discount amount is required")
                        )
                        else -> maxOf(
                            0,
                            remainder -
                                (adjustment.requestedAmountMinor
                                    ?: throw BadRequestException("Special price is required")) *
                                line.quantity
                        )
                    }

                    lineRemainders[line.lineId] = remainder - applied
                    applied
                }

                "ORDER_PERCENT_OFF",
                "ORDER_FIXED_OFF" -> {
                    val orderRemainder =
                        lineRemainders.values.sum() - appliedOrderDiscounts
                    val amount = if (adjustment.adjustmentType == "ORDER_PERCENT_OFF") {
                        (
                            orderRemainder *
                                (adjustment.percentage
                                    ?: throw BadRequestException("Order percentage is required")) /
                                100.0
                            ).toLong()
                    } else {
                        adjustment.requestedAmountMinor
                            ?: throw BadRequestException("Order discount amount is required")
                    }

                    minOf(orderRemainder, amount).also {
                        appliedOrderDiscounts += it
                    }
                }

                else -> throw BadRequestException("Unsupported commerce adjustment")
            }

            CommerceCheckoutAdjustment(
                adjustment.adjustmentId,
                adjustment.targetLineId,
                adjustment.sourceType,
                adjustment.sourceId,
                adjustment.adjustmentType,
                amount
            )
        }
    }

    private fun validateProviderOrderResult(
        result: CommerceCheckoutResult,
        pricedLines: List<CommerceTransactionLineDto>,
        adjustments: List<CommerceCheckoutAdjustment>,
        currency: String
    ) {
        val providerOrderId = result.providerOrderId?.trim()
        val subtotal = result.subtotalMinor
        val adjustment = result.adjustmentTotalMinor
        val tax = result.taxTotalMinor
        val total = result.totalMinor

        if (providerOrderId.isNullOrEmpty() ||
            result.providerTransactionId != null ||
            result.providerStatus.isBlank() ||
            result.providerStatus.uppercase() in setOf("SUCCEEDED", "PAID") ||
            result.currencyCode?.uppercase() != currency ||
            subtotal == null ||
            adjustment == null ||
            tax == null ||
            total == null ||
            subtotal < 0 ||
            adjustment != adjustments.sumOf { it.appliedAmountMinor } ||
            tax < 0 ||
            total < 0 ||
            subtotal != pricedLines.sumOf { requireNotNull(it.lineSubtotalMinor) } ||
            total != subtotal - adjustment + tax) {
            throw BadRequestException("Provider order result is invalid")
        }
    }

    private fun requireRemotePaymentConfiguration() {
        if (remotePaymentConfiguration.callbackUrl.isBlank() ||
            remotePaymentConfiguration.callbackHeaderName.isBlank() ||
            remotePaymentConfiguration.callbackHeaderValue.isBlank() ||
            remotePaymentConfiguration.ttlSeconds <= 0) {
            throw BadRequestException("Poynt Payment Bridge is not configured")
        }
    }

    private fun dispatchRemotePayment(
        provider: CommerceRemoteTerminalPaymentProvider,
        organizationId: String,
        actorUserId: String,
        transactionId: String,
        row: CounterCommerceRemotePaymentStartRow
    ) {
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
                callbackUrl = remotePaymentConfiguration.callbackUrl,
                callbackHeaderName = remotePaymentConfiguration.callbackHeaderName,
                callbackHeaderValue = remotePaymentConfiguration.callbackHeaderValue,
                ttlSeconds = remotePaymentConfiguration.ttlSeconds,
                transactionId = transactionId
            )
        )

        sql().markRemotePaymentDispatched(row.providerReferenceId)
    }

    private fun transaction(
        organizationId: String,
        transactionId: String,
        actorUserId: String
    ): CounterCommerceTransactionRow =
        sql().transaction(organizationId, transactionId, actorUserId)
            ?: throw NotFoundException("Counter Commerce transaction was not found")

    private fun lineDto(row: CounterCommerceLineRow) =
        CommerceTransactionLineDto(
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
                "42501" ->
                    throw ForbiddenException("Counter Commerce operation is not permitted")
                "23505", "40001" ->
                    throw ConflictException("Counter Commerce state changed; retry the request")
                "22001", "22003", "22023", "23502", "23503", "23514", "P0002" ->
                    throw BadRequestException("Counter Commerce payment details are unavailable")
                else -> throw error
            }
        }
    }

    private companion object {
        val CURRENCY_CODE = Regex("^[A-Z]{3}$")
        val PAYMENT_RESULTS = setOf("SUCCEEDED", "FAILED", "CANCELLED")
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

class CounterRedemptionPreparedRow {
    var commerceTransactionId: String = ""
    var providerCode: String = ""
    var integrationConfigurationId: String? = null
    var status: String = ""
}

class CounterRedemptionCheckoutRow {
    var redemptionTransactionId: String = ""
    var transactionNumber: String = ""
    var redemptionStatus: String = ""
    var redemptionCompletedAt: String? = null
    var commerceTransactionId: String = ""
    var providerCode: String = ""
    var integrationConfigurationId: String? = null
    var commerceStatus: String = ""
    var subtotalMinor: Long? = null
    var adjustmentTotalMinor: Long? = null
    var taxTotalMinor: Long? = null
    var totalMinor: Long? = null
    var currencyCode: String? = null
    var providerOrderId: String? = null
    var providerTransactionId: String? = null
    var failureCode: String? = null
    var failureMessage: String? = null
    var storeId: String = ""
    var customerUserId: String? = null
    var idempotencyKey: String = ""
    var organizationId: String = ""
}

class CounterRedemptionLineRow {
    var lineId: String = ""
    var transactionId: String = ""
    var lineType: String = ""
    var sourceEntityType: String? = null
    var sourceEntityId: String? = null
    var productMappingId: String? = null
    var externalProductId: String? = null
    var externalVariantId: String? = null
    var description: String = ""
    var quantity: Int = 0
    var unitPriceMinorSnapshot: Long? = null
    var unitPriceMinorAuthoritative: Long? = null
    var lineSubtotalMinor: Long? = null
    var currencyCode: String? = null
    var priceSource: String = ""
}

class CounterRedemptionAdjustmentRow {
    var adjustmentId: String = ""
    var transactionId: String = ""
    var targetLineId: String? = null
    var commerceAdjustmentId: String = ""
    var sourceType: String = ""
    var sourceId: String = ""
    var adjustmentType: String = ""
    var percentage: Double? = null
    var requestedAmountMinor: Long? = null
    var appliedAmountMinor: Long? = null
    var currencyCode: String? = null
    var status: String = ""
}

@Serializable
private data class CounterAuthoritativeLinePrice(
    @SerialName("line_id")
    val lineId: String,
    @SerialName("unit_price_minor")
    val unitPriceMinor: Long,
    @SerialName("line_subtotal_minor")
    val lineSubtotalMinor: Long,
    @SerialName("currency_code")
    val currencyCode: String,
    @SerialName("price_source")
    val priceSource: String
)

@Serializable
private data class CounterAppliedAdjustment(
    @SerialName("adjustment_id")
    val adjustmentId: String,
    @SerialName("applied_amount_minor")
    val appliedAmountMinor: Long,
    val status: String
)

interface CounterCommercePaymentSql {
    /*
     * Existing membership payment functions.
     */
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

    /*
     * Counter redemption Commerce functions (migration 135).
     */
    @SqlQuery("""SELECT * FROM commerce_prepare_counter_redemption_checkout(
        :redemptionTransactionId,:organizationId,:storeId,:staffId,:actorUserId)""")
    @RegisterBeanMapper(CounterRedemptionPreparedRow::class)
    fun prepareRedemptionCheckout(
        @Bind("redemptionTransactionId") redemptionTransactionId: String,
        @Bind("organizationId") organizationId: String,
        @Bind("storeId") storeId: String,
        @Bind("staffId") staffId: String,
        @Bind("actorUserId") actorUserId: String
    ): CounterRedemptionPreparedRow?

    @SqlQuery("""SELECT * FROM commerce_get_counter_redemption_checkout(
        :organizationId,:redemptionTransactionId,:storeId,:staffId,:actorUserId)""")
    @RegisterBeanMapper(CounterRedemptionCheckoutRow::class)
    fun redemptionCheckout(
        @Bind("organizationId") organizationId: String,
        @Bind("redemptionTransactionId") redemptionTransactionId: String,
        @Bind("storeId") storeId: String,
        @Bind("staffId") staffId: String,
        @Bind("actorUserId") actorUserId: String
    ): CounterRedemptionCheckoutRow?

    @SqlQuery("SELECT * FROM commerce_get_counter_redemption_lines(:transactionId,:actorUserId)")
    @RegisterBeanMapper(CounterRedemptionLineRow::class)
    fun redemptionLines(
        @Bind("transactionId") transactionId: String,
        @Bind("actorUserId") actorUserId: String
    ): List<CounterRedemptionLineRow>

    @SqlQuery("SELECT * FROM commerce_get_counter_redemption_adjustments(:transactionId,:actorUserId)")
    @RegisterBeanMapper(CounterRedemptionAdjustmentRow::class)
    fun redemptionAdjustments(
        @Bind("transactionId") transactionId: String,
        @Bind("actorUserId") actorUserId: String
    ): List<CounterRedemptionAdjustmentRow>

    @SqlQuery("""SELECT commerce_persist_counter_redemption_provider_order(
        :transactionId,:providerOrderId,
        CAST(:linePricesJson AS jsonb),CAST(:adjustmentsJson AS jsonb),
        :subtotalMinor,:adjustmentTotalMinor,:taxTotalMinor,:totalMinor,
        :currencyCode,:actorUserId)""")
    fun persistRedemptionProviderOrder(
        @Bind("transactionId") transactionId: String,
        @Bind("providerOrderId") providerOrderId: String,
        @Bind("linePricesJson") linePricesJson: String,
        @Bind("adjustmentsJson") adjustmentsJson: String,
        @Bind("subtotalMinor") subtotalMinor: Long,
        @Bind("adjustmentTotalMinor") adjustmentTotalMinor: Long,
        @Bind("taxTotalMinor") taxTotalMinor: Long,
        @Bind("totalMinor") totalMinor: Long,
        @Bind("currencyCode") currencyCode: String,
        @Bind("actorUserId") actorUserId: String
    ): Boolean

    @SqlQuery("""SELECT * FROM commerce_begin_counter_redemption_remote_terminal_payment(
        :organizationId,:transactionId,:posDeviceId,:referenceId,:actorUserId)""")
    @RegisterBeanMapper(CounterCommerceRemotePaymentStartRow::class)
    fun beginRedemptionRemoteTerminalPayment(
        @Bind("organizationId") organizationId: String,
        @Bind("transactionId") transactionId: String,
        @Bind("posDeviceId") posDeviceId: String,
        @Bind("referenceId") referenceId: String,
        @Bind("actorUserId") actorUserId: String
    ): CounterCommerceRemotePaymentStartRow

    @SqlQuery("""SELECT commerce_complete_counter_redemption_zero_value(
        :organizationId,:transactionId,:actorUserId)""")
    fun completeZeroValueRedemption(
        @Bind("organizationId") organizationId: String,
        @Bind("transactionId") transactionId: String,
        @Bind("actorUserId") actorUserId: String
    ): Boolean

    @SqlQuery("""SELECT commerce_record_counter_redemption_test_result(
        :organizationId,:transactionId,:providerStatus,:providerTransactionId,
        :failureCode,:failureMessage,:actorUserId)""")
    fun recordRedemptionTestResult(
        @Bind("organizationId") organizationId: String,
        @Bind("transactionId") transactionId: String,
        @Bind("providerStatus") providerStatus: String,
        @Bind("providerTransactionId") providerTransactionId: String?,
        @Bind("failureCode") failureCode: String?,
        @Bind("failureMessage") failureMessage: String?,
        @Bind("actorUserId") actorUserId: String
    ): Boolean

    @SqlQuery("SELECT commerce_finalize_counter_redemption_transaction(:transactionId,:actorUserId)")
    fun finalizeRedemption(
        @Bind("transactionId") transactionId: String,
        @Bind("actorUserId") actorUserId: String
    ): Boolean

    /*
     * Shared callback helpers.
     */
    @SqlQuery("SELECT commerce_mark_remote_payment_dispatched(:referenceId)")
    fun markRemotePaymentDispatched(@Bind("referenceId") referenceId: String): Boolean

    @SqlQuery("SELECT commerce_finalize_counter_payment_by_reference(:referenceId)")
    fun finalizeRemoteTerminalPayment(@Bind("referenceId") referenceId: String): String?
}
