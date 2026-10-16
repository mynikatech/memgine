package com.mynikatech.memgine.component.payment

import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.exception.ConflictException
import com.mynikatech.memgine.exception.NotFoundException
import com.mynikatech.memgine.exception.ForbiddenException
import com.mynikatech.memgine.exception.ApiException
import com.mynikatech.memgine.component.organization.OrganizationSql
import com.mynikatech.memgine.component.commerce.DurableFinancialExceptionRecovery
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.contentOrNull
import com.mynikatech.memgine.config.PaymentConfig
import com.mynikatech.memgine.component.commerce.provider.poynt.PoyntCatalogConfiguration
import com.mynikatech.memgine.net.dto.CounterPurchaseResult
import com.mynikatech.memgine.net.dto.PaymentIntentDto
import com.mynikatech.memgine.net.dto.PaymentReturnContextDto
import com.mynikatech.memgine.net.dto.PaymentStartRequestDto
import com.mynikatech.memgine.net.dto.MembershipPurchaseQuoteDto
import com.mynikatech.memgine.net.dto.CounterMembershipPurchaseQuoteDto
import com.mynikatech.memgine.net.dto.TestPaymentConfirmationDto
import com.mynikatech.memgine.net.dto.PoyntCollectBootstrapDto
import com.mynikatech.memgine.net.dto.PoyntCollectWalletDto
import com.mynikatech.memgine.net.dto.PoyntCollectConfirmationDto
import com.stripe.model.Event
import org.jdbi.v3.core.Jdbi
import java.util.UUID
import java.security.MessageDigest
import java.security.SecureRandom
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.net.URI
import org.postgresql.util.PSQLException

data class BrowserCollectCheckout(
    val browserToken: String,
    val csrfToken: String,
    val session: PoyntCollectCheckoutSessionRow
)

class PaymentService(
    private val jdbi: Jdbi,
    environment: String,
    private val paymentConfig: PaymentConfig,
    private val paymentSqlOverride: PaymentSql? = null,
    private val collectProvider: PoyntCollectPaymentProvider? = null,
    private val collectSdkUrl: String,
    private val collectCaptureSqlOverride: PoyntCollectCaptureSql? = null,
    private val collectExceptionSqlOverride: PoyntCollectFinancialExceptionSql? = null
) {
    private val testProvider = TestPaymentProvider(environment in setOf("local", "dev", "development"))
    private val stripeProvider = StripePaymentProvider(paymentConfig)
    private val monerisProvider = MonerisPaymentProvider(paymentConfig)
    private val configuredProvider: PaymentProvider = when (paymentConfig.providerCode) {
        "TEST" -> testProvider
        "STRIPE" -> stripeProvider
        "MONERIS" -> monerisProvider
        "POYNT_COLLECT" -> collectProvider ?: throw IllegalArgumentException("Poynt Collect is not configured")
        else -> throw IllegalArgumentException("Unsupported payment provider configuration")
    }
    private fun sql() = paymentSqlOverride ?: jdbi.onDemand(PaymentSql::class.java)
    private fun collectCaptureSql() = collectCaptureSqlOverride ?: jdbi.onDemand(PoyntCollectCaptureSql::class.java)
    private fun collectExceptionSql() = collectExceptionSqlOverride ?: jdbi.onDemand(PoyntCollectFinancialExceptionSql::class.java)
    private val checkoutRandom = SecureRandom()
    private val browserCheckoutTtlMinutes = 10L

    /** Pricing comes from the database so every checkout uses the same tax rule. */
    fun quoteMembership(org: String, planId: String): MembershipPurchaseQuoteDto {
        validateId(org, "organization id")
        validateId(planId, "membership plan id")
        return translate {
            sql().quote(org, planId)
                ?: throw NotFoundException("Membership plan was not found")
        }
    }

    fun quoteCustomerMembership(
        org: String,
        planId: String,
        customerUserId: String,
        explicitOfferId: String?
    ): CounterMembershipPurchaseQuoteDto {
        validateId(org, "organization id")
        validateId(planId, "membership plan id")
        validateId(customerUserId, "customer user id")
        explicitOfferId?.let { validateId(it, "membership offer id") }
        return translate {
            sql().quoteCustomerMembership(org, customerUserId, planId, explicitOfferId)
                ?: throw NotFoundException("Membership plan was not found")
        }
    }

    fun startMembershipPayment(org: String, request: PaymentStartRequestDto, actorUserId: String?): PaymentIntentDto {
        requirePaymentProvider()
        return startMembershipPayment(org, request, actorUserId, configuredProvider)
    }

    /**
     * Counter membership checkout starts with the Memgine-owned Commerce order.
     * The database function prepares/reuses that order and creates/reuses the
     * correlated payment intent atomically before any provider interaction.
     */
    fun startCounterMembershipPayment(
        org: String,
        request: PaymentStartRequestDto,
        storeId: String,
        staffId: String,
        customerUserId: String,
        planId: String,
        actorUserId: String
    ): PaymentIntentDto = startCounterMembershipPayment(
        org = org,
        request = request,
        storeId = storeId,
        staffId = staffId,
        customerUserId = customerUserId,
        planId = planId,
        actorUserId = actorUserId,
        providerCode = "ROUTED"
    )

    fun startCounterCashMembershipPayment(
        org: String,
        request: PaymentStartRequestDto,
        storeId: String,
        staffId: String,
        customerUserId: String,
        planId: String,
        actorUserId: String
    ): PaymentIntentDto = startCounterMembershipPayment(
        org = org,
        request = request,
        storeId = storeId,
        staffId = staffId,
        customerUserId = customerUserId,
        planId = planId,
        actorUserId = actorUserId,
        providerCode = CashPaymentProvider.code
    )

    private fun startCounterMembershipPayment(
        org: String,
        request: PaymentStartRequestDto,
        storeId: String,
        staffId: String,
        customerUserId: String,
        planId: String,
        actorUserId: String,
        providerCode: String
    ): PaymentIntentDto {
        validateId(org, "organization id")
        validateId(request.challengeId, "challenge id")
        validateId(storeId, "store id")
        validateId(staffId, "staff id")
        validateId(customerUserId, "customer user id")
        validateId(planId, "membership plan id")
        request.explicitOfferId?.let { validateId(it, "membership offer id") }
        validateIdempotencyKey(request.idempotencyKey)

        val intent = translate {
            sql().startCounterMembership(
                UUID.randomUUID().toString(),
                UUID.randomUUID().toString(),
                org,
                request.challengeId,
                storeId,
                staffId,
                customerUserId,
                planId,
                providerCode,
                request.idempotencyKey.trim(),
                actorUserId,
                request.explicitOfferId
            ) ?: throw ConflictException("Payment was not started")
        }
        return checkoutForProvider(intent, org, request.returnContext, actorUserId)
    }

    fun startCounterCashPayment(
        org: String,
        request: PaymentStartRequestDto,
        actorUserId: String
    ): PaymentIntentDto = startMembershipPayment(org, request, actorUserId, CashPaymentProvider)

    private fun startMembershipPayment(
        org: String,
        request: PaymentStartRequestDto,
        actorUserId: String?,
        provider: PaymentProvider
    ): PaymentIntentDto {
        validateId(org, "organization id")
        validateId(request.challengeId, "challenge id")
        if (request.idempotencyKey.isBlank() || request.idempotencyKey.length > 128) {
            throw BadRequestException("Valid payment idempotency key is required")
        }
        val intent = translate { sql().start(
            UUID.randomUUID().toString(), UUID.randomUUID().toString(), org,
            request.challengeId, provider.code, request.idempotencyKey.trim(), actorUserId
        ) ?: throw ConflictException("Payment was not started") }
        return checkoutForProvider(intent, org, request.returnContext, actorUserId)
    }

    fun startAuthenticatedMembershipPayment(
        org: String,
        planId: String,
        customerUserId: String,
        idempotencyKey: String,
        returnContext: PaymentReturnContextDto? = null,
        explicitOfferId: String? = null
    ): PaymentIntentDto {
        validateId(org, "organization id")
        validateId(planId, "membership plan id")
        validateId(customerUserId, "customer user id")
        explicitOfferId?.let { validateId(it, "membership offer id") }
        validateIdempotencyKey(idempotencyKey)
        val intent = translate { sql().startCustomerCommerce(
            UUID.randomUUID().toString(),
            UUID.randomUUID().toString(),
            org,
            planId,
            customerUserId,
            idempotencyKey.trim(),
            explicitOfferId,
            customerUserId
        ) ?: throw ConflictException("Payment was not started") }
        requireCustomerPaymentProvider(intent.providerCode)
        // A persisted PROCESSING/SUCCEEDED intent returned by the database guard
        // is recovery-only. Never create another provider checkout from it.
        return if (intent.status == "PENDING") {
            checkoutForProvider(intent, org, returnContext, customerUserId)
        } else {
            intent
        }
    }

    fun get(org: String, intentId: String, actorUserId: String): PaymentIntentDto = translate {
        sql().get(org, intentId, actorUserId) ?: throw NotFoundException("Payment was not found")
    }
    
    /**
    * Stage B: read the financial exception for an authenticated payment owner.
    * No reconciliation, payment mutation or refund occurs here.
    */
    fun getCollectFinancialException(
        org: String,
        intentId: String,
        actorUserId: String
    ): PoyntCollectFinancialExceptionRow? {
        validateId(org, "organization id")
        validateId(intentId, "payment intent id")
        validateId(actorUserId, "actor user id")

        // Enforce payment ownership using the existing authorization-backed SQL.
        get(org, intentId, actorUserId)

        return translate {
            collectExceptionSql().getCustomerCase(org, intentId, actorUserId)
        }
    }

    fun collectBootstrap(org: String, intentId: String, actorUserId: String): PoyntCollectBootstrapDto {
        val provider = collectProvider ?: throw BadRequestException("Poynt Collect is not configured")
        if (!provider.isAvailable) {
            throw BadRequestException("Poynt Collect payment is unavailable")
        }
        val current = get(org, intentId, actorUserId)
        if (current.providerCode != provider.code) throw BadRequestException("Payment is not a Collect payment")
        if (current.status != "PENDING") throw ConflictException("Payment cannot accept card details")
        val row = translate { sql().collectConfiguration(org, intentId, actorUserId) }
            ?: throw BadRequestException("Poynt Collect configuration is unavailable")
        if (row.organizationId != org || row.providerStoreId.isNullOrBlank() ||
            row.merchantCurrencyCode != current.currencyCode || row.businessId.isBlank() ||
            row.applicationId.isBlank() || row.secretReference.isBlank()
        ) throw BadRequestException("Poynt Collect configuration is unavailable")
        if (collectSdkUrl !in setOf(
                "https://collect.commerce.godaddy.com/sdk.js",
                "https://collect.commerce.ote-godaddy.com/sdk.js"
            )) throw BadRequestException("Poynt Collect SDK is unavailable")
        // Resolve wallet display metadata using existing organization DB functions.
        // No per-organization environment variables, new functions, or schema changes.
        // Missing/malformed metadata hides wallet buttons without affecting card checkout.
        val wallet = try {
            val organizationSql = jdbi.onDemand(OrganizationSql::class.java)
            val organization = organizationSql.getOrganization(org)
                ?.let { Json.parseToJsonElement(it).jsonObject }
            val details = organizationSql.getOrganizationDetails(org)
                ?.let { Json.parseToJsonElement(it).jsonObject }
            val displayName = listOf(
                organization?.get("displayName")?.jsonPrimitive?.contentOrNull,
                organization?.get("name")?.jsonPrimitive?.contentOrNull
            ).firstOrNull { !it.isNullOrBlank() }?.trim()
            val country = details?.get("address")?.jsonObject
                ?.get("countryCode")?.jsonPrimitive?.contentOrNull
                ?.trim()?.uppercase(java.util.Locale.ROOT)
            if (displayName != null && displayName.length <= 80 &&
                country != null && country.matches(Regex("^[A-Z]{2}$"))) {
                PoyntCollectWalletDto(
                    country = country,
                    currency = current.currencyCode,
                    merchantName = displayName,
                    amount = java.math.BigDecimal.valueOf(amountMinor(current.amount), 2)
                        .setScale(2).toPlainString()
                )
            } else null
        } catch (_: Exception) {
            null
        }
        return PoyntCollectBootstrapDto(collectSdkUrl, row.businessId, row.applicationId, wallet)
    }

    /**
     * Creates a one-time native-to-browser hand-off. The bearer value is never
     * stored, and normal native session credentials are never placed in the URL.
     */
    fun createCollectBrowserCheckout(org: String, intentId: String, actorUserId: String): String {
        val checkoutBase = checkoutBaseUrl()
        get(org, intentId, actorUserId) // preserves payment ownership before issuing a bearer value
        val rawToken = randomToken()
        val created = translate {
            sql().createCollectCheckoutSession(
                UUID.randomUUID().toString(), sha256(rawToken), org, intentId, actorUserId,
                OffsetDateTime.now(ZoneOffset.UTC).plusMinutes(browserCheckoutTtlMinutes)
            )
        }
        if (!created) throw ConflictException("Checkout session was not created")
        return "$checkoutBase/poynt-collect/checkout?session=${java.net.URLEncoder.encode(rawToken, Charsets.UTF_8)}"
    }

    fun isCollectBrowserOrigin(origin: String?): Boolean = try {
        val expected = URI(checkoutBaseUrl())
        val actual = origin?.let(::URI)
        actual != null && actual.scheme == expected.scheme && actual.host == expected.host && actual.port == expected.port
    } catch (_: Exception) { false }

    /** Atomically consumes the URL bearer and establishes the browser session. */
    fun redeemCollectBrowserCheckout(token: String): BrowserCollectCheckout {
        if (token.length !in 40..512) throw BadRequestException("Checkout session is invalid")
        val browserToken = randomToken()
        val csrfToken = randomToken()
        val row = translate {
            sql().redeemCollectCheckoutSession(
                sha256(token), sha256(browserToken), sha256(csrfToken),
                OffsetDateTime.now(ZoneOffset.UTC).plusMinutes(browserCheckoutTtlMinutes)
            )
        } ?: throw ForbiddenException("Checkout session is unavailable")
        return BrowserCollectCheckout(browserToken, csrfToken, row)
    }

    fun browserCollectBootstrap(browserToken: String): PoyntCollectBootstrapDto {
        val session = browserSession(browserToken)
        return collectBootstrap(session.organizationId, session.paymentIntentId, session.customerUserId)
    }

    fun browserCollectConfirmation(browserToken: String): Pair<PaymentIntentDto, CounterPurchaseResult?> {
        val session = browserSession(browserToken)
        return getConfirmation(session.organizationId, session.paymentIntentId, session.customerUserId)
    }

    fun browserConfirmCollectAndFinalize(browserToken: String, csrfToken: String, request: PoyntCollectConfirmationDto): Pair<PaymentIntentDto, CounterPurchaseResult?> {
        val session = browserSession(browserToken)
        if (session.csrfTokenHash == null || !constantTimeEquals(session.csrfTokenHash!!, sha256(csrfToken))) {
            throw ForbiddenException("Checkout request is invalid")
        }
        return confirmCollectAndFinalize(session.organizationId, session.paymentIntentId, session.customerUserId, request)
    }

    // Compatibility overload retained for existing card integration tests/call sites.
    fun browserConfirmCollectAndFinalize(browserToken: String, csrfToken: String, nonce: String): Pair<PaymentIntentDto, CounterPurchaseResult?> =
        browserConfirmCollectAndFinalize(browserToken, csrfToken, PoyntCollectConfirmationDto(nonce))

    private fun browserSession(browserToken: String): PoyntCollectCheckoutSessionRow {
        if (browserToken.length !in 40..512) throw ForbiddenException("Checkout session is unavailable")
        return translate { sql().browserCollectCheckoutSession(sha256(browserToken)) }
            ?: throw ForbiddenException("Checkout session is unavailable")
    }

    private fun checkoutBaseUrl(): String {
        val value = paymentConfig.webBaseUrl
        val uri = try { URI(value) } catch (_: Exception) { null }
        if (uri?.scheme != "https" || uri.host.isNullOrBlank()) {
            throw BadRequestException("Secure browser checkout is unavailable")
        }
        return value
    }

    private fun randomToken(): String = ByteArray(32).also(checkoutRandom::nextBytes)
        .let { java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(it) }

    private fun sha256(value: String): String = MessageDigest.getInstance("SHA-256")
        .digest(value.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }

    private fun constantTimeEquals(left: String, right: String): Boolean =
        MessageDigest.isEqual(left.toByteArray(Charsets.UTF_8), right.toByteArray(Charsets.UTF_8))

    fun getConfirmation(org: String, intentId: String, actorUserId: String): Pair<PaymentIntentDto, CounterPurchaseResult?> {
        val current = get(org, intentId, actorUserId)
        val payment = get(org, intentId, actorUserId)
        val subscription = if (payment.finalizedSubscriptionId == null) null else translate {
            sql().finalizedMembership(org, intentId, actorUserId)
        }?.let { row ->
            CounterPurchaseResult(
                row.subscriptionId, row.organizationUserId, row.userId, row.subscriptionNumber,
                row.subscriptionPlanId, row.subscriptionDate, row.startDate, row.endDate,
                row.subscriptionStatusId, row.totalAmount, row.currencyCode
            )
        }
        return payment to subscription
    }

    /** Explicit reconciliation without card tokenization or another charge. */
    fun reconcileCollectAndGet(
        org: String,
        intentId: String,
        actorUserId: String
    ): com.mynikatech.memgine.net.dto.PoyntCollectRecoveryDto {
        val initial = get(org, intentId, actorUserId)
        if (initial.providerCode != "POYNT_COLLECT") {
            throw BadRequestException("Payment is not a Poynt Collect payment")
        }
        if (initial.status == "PROCESSING") {
            reconcileCollectPayment(org, intentId, actorUserId, initial)
        }
        val (payment, subscription) = getConfirmation(org, intentId, actorUserId)
        val hasCapture = translate {
            collectCaptureSql().hasVerifiedCapture(org, intentId, actorUserId)
        }
        // Stage B: persist a durable review case only after Stage A has verified capture.
        // This is a separate Jdbi call/transaction from membership finalization.
        // Do not infer duplicate membership or initiate a refund here.
        if (hasCapture && payment.status == "PROCESSING" &&
            payment.finalizedSubscriptionId == null && subscription == null
        ) {
            translate { collectExceptionSql().openCapturedUnfulfilledCase(org, intentId, actorUserId) }
        }
        val outcome = when {
            payment.status == "SUCCEEDED" && subscription != null -> "FULFILLED"
            hasCapture && subscription == null -> "CAPTURED_UNFULFILLED"
            payment.status == "PENDING" -> "PAYMENT_PENDING"
            payment.status == "FAILED" || payment.status == "CANCELED" -> "PAYMENT_FAILED"
            else -> "OUTCOME_UNKNOWN"
        }
        return com.mynikatech.memgine.net.dto.PoyntCollectRecoveryDto(
            outcome = outcome, payment = payment, subscription = subscription
        )
    }

    /**
     * Replays only Memgine fulfillment from already persisted, verified Collect
     * capture evidence. It deliberately has no provider/token/charge path.
     */
    fun recoverCollectFulfillment(
        org: String,
        intentId: String,
        actorUserId: String
    ): Pair<PaymentIntentDto, CounterPurchaseResult?> {
        val current = get(org, intentId, actorUserId)
        if (current.providerCode != "POYNT_COLLECT") {
            throw BadRequestException("Payment is not a Poynt Collect payment")
        }
        if (current.finalizedSubscriptionId != null) {
            return getConfirmation(org, intentId, actorUserId)
        }
        // This separate transaction preserves the review case if finalization
        // below fails and its transaction rolls back.
        DurableFinancialExceptionRecovery(
            establishCase = {
                translate { collectExceptionSql().openCapturedUnfulfilledCase(org, intentId, actorUserId) }
            },
            finalizeFulfillment = {
                translate {
                    collectExceptionSql().recoverCapturedUnfulfilledPayment(org, intentId, actorUserId)
                        ?: throw ConflictException("Membership fulfillment was unavailable")
                }
            }
        ).recover()
        syncCommercePaymentResult(org, intentId, actorUserId)
        return getConfirmation(org, intentId, actorUserId)
    }
    /**
     * Resolves an ambiguous Collect result using the stable Poynt request ID.
     * It never sends a second charge and intentionally leaves PROCESSING intact
     * when Poynt cannot prove a single terminal result.
     */
    private fun reconcileCollectPayment(
        org: String,
        intentId: String,
        actorUserId: String,
        current: PaymentIntentDto
    ) {
        val provider = collectProvider ?: return
        if (!provider.isAvailable) return
        val configuration = try {
            val row = translate { sql().collectConfiguration(org, intentId, actorUserId) } ?: return
            if (row.organizationId != org || row.providerStoreId.isNullOrBlank() ||
                row.merchantCurrencyCode != current.currencyCode || row.businessId.isBlank() ||
                row.applicationId.isBlank() || row.secretReference.isBlank()
            ) return
            PoyntCatalogConfiguration(
                row.integrationConfigurationId, row.organizationId, row.applicationId,
                row.businessId, row.providerStoreId, row.secretReference,
                row.merchantCurrencyCode, null
            )
        } catch (_: Exception) {
            return
        }
        val result = try {
            provider.reconcile(
                current,
                configuration,
                provider.token(configuration),
                amountMinor(current.amount)
            )
        } catch (_: Exception) {
            return
        } ?: return
        val persistedReference = try {
            translate { sql().setProviderReference(intentId, provider.code, result.transactionId, actorUserId) }
        } catch (_: Exception) {
            return
        } ?: return
        if (persistedReference != result.transactionId) return
        if (result.approved) {
            // Commit verified capture in its own Jdbi operation before subscription finalization.
            val recordedCapture = try {
                translate {
                    collectCaptureSql().recordVerifiedCapture(
                        org, intentId, actorUserId, result.transactionId,
                        amountMinor(current.amount), current.currencyCode
                    )
                }
            } catch (_: Exception) {
                false
            }
            if (!recordedCapture) return
            val finalized = try {
                translate {
                    sql().confirmProviderSuccess(
                        intentId, org, provider.code, result.transactionId,
                        amountMinor(current.amount), current.currencyCode
                    )
                }
            } catch (_: Exception) {
                null
            }
            if (finalized != null) syncCommercePaymentResult(org, intentId, actorUserId)
        } else if (result.definiteDecline) {
            val recorded = try {
                translate {
                    sql().recordProviderFailure(
                        intentId, org, provider.code, result.transactionId,
                        "FAILED", "POYNT_COLLECT_DECLINED"
                    )
                }
            } catch (_: Exception) {
                false
            }
            if (recorded) syncCommercePaymentResult(org, intentId, actorUserId)
        }
    }

    fun cancel(org: String, intentId: String, actorUserId: String): PaymentIntentDto {
        if (!translate { sql().cancel(org, intentId, actorUserId) }) throw ConflictException("Payment cannot be canceled")
        syncCommercePaymentResult(org, intentId, actorUserId)
        return get(org, intentId, actorUserId)
    }

    fun confirmTestAndFinalize(
        org: String,
        intentId: String,
        actorUserId: String,
        result: TestPaymentConfirmationDto
    ): Pair<PaymentIntentDto, CounterPurchaseResult?> {
        val current = get(org, intentId, actorUserId)
        val status = result.status.trim().uppercase()
        if (!testProvider.canConfirm(status)) throw BadRequestException("Test payment confirmation is unavailable")
        if (result.failureMessage != null && result.failureMessage.length > 500) throw BadRequestException("Payment failure message is too long")
        val subscription = if (status == "SUCCEEDED") {
            val row = translate {
                sql().confirmSuccessfulMembership(
                    intentId,
                    testProvider.code,
                    testProvider.providerReference(current, result.providerReferenceId) ?: error("Test reference is required"),
                    actorUserId
                )
            } ?: throw ConflictException("Payment succeeded but membership finalization was unavailable")
            CounterPurchaseResult(row.subscriptionId, row.organizationUserId, row.userId,
                row.subscriptionNumber, row.subscriptionPlanId, row.subscriptionDate, row.startDate,
                row.endDate, row.subscriptionStatusId, row.totalAmount, row.currencyCode)
        } else null
        if (status != "SUCCEEDED") {
            translate { sql().recordResult(intentId, status, testProvider.providerReference(current, result.providerReferenceId),
                result.failureCode?.take(80), result.failureMessage?.take(500), actorUserId)
            }
        }
        syncCommercePaymentResult(org, intentId, actorUserId)
        val updated = get(org, intentId, actorUserId)
        return updated to subscription
    }

    fun confirmCounterCashAndFinalize(
        org: String,
        intentId: String,
        actorUserId: String
    ): Pair<PaymentIntentDto, CounterPurchaseResult> {
        val current = get(org, intentId, actorUserId)
        if (current.providerCode != CashPaymentProvider.code) {
            throw BadRequestException("Payment is not a cash payment")
        }
        val row = translate {
            sql().confirmSuccessfulMembership(
                intentId,
                CashPaymentProvider.code,
                CashPaymentProvider.providerReference(current, null) ?: error("Cash reference is required"),
                actorUserId
            )
        } ?: throw ConflictException("Cash payment finalization was unavailable")
        syncCommercePaymentResult(org, intentId, actorUserId)
        val subscription = CounterPurchaseResult(row.subscriptionId, row.organizationUserId, row.userId,
            row.subscriptionNumber, row.subscriptionPlanId, row.subscriptionDate, row.startDate,
            row.endDate, row.subscriptionStatusId, row.totalAmount, row.currencyCode)
        return get(org, intentId, actorUserId) to subscription
    }

    fun confirmMonerisAndFinalize(
        org: String,
        intentId: String,
        actorUserId: String,
        temporaryToken: String
    ): Pair<PaymentIntentDto, CounterPurchaseResult?> {
        val current = get(org, intentId, actorUserId)
        if (current.providerCode != monerisProvider.code) {
            throw BadRequestException("Payment is not a Moneris payment")
        }
        if (current.status == "SUCCEEDED") return getConfirmation(org, intentId, actorUserId)
        if (current.status !in setOf("PENDING", "PROCESSING")) {
            throw ConflictException("Payment cannot be confirmed")
        }

        val outcome = monerisProvider.purchase(current, temporaryToken)
        val providerReference = outcome.paymentId
            ?: throw ConflictException("Moneris payment reference is unavailable")
        val persistedReference = translate {
            sql().setProviderReference(intentId, monerisProvider.code, providerReference, actorUserId)
        } ?: throw ConflictException("Moneris payment reference is unavailable")
        if (persistedReference != providerReference) {
            throw ConflictException("Payment is already associated with another provider transaction")
        }

        if (outcome.status == "SUCCEEDED") {
            translate {
                sql().confirmProviderSuccess(
                    intentId,
                    org,
                    monerisProvider.code,
                    providerReference,
                    amountMinor(current.amount),
                    current.currencyCode
                )
            } ?: throw ConflictException("Moneris payment finalization was unavailable")
        } else {
            translate {
                sql().recordProviderFailure(
                    intentId,
                    org,
                    monerisProvider.code,
                    providerReference,
                    "FAILED",
                    outcome.failureCode ?: "MONERIS_DECLINED"
                )
            }
            syncCommercePaymentResult(org, intentId, actorUserId)
            throw BadRequestException("Moneris payment was not approved")
        }
        syncCommercePaymentResult(org, intentId, actorUserId)
        return getConfirmation(org, intentId, actorUserId)
    }

    fun confirmCollectAndFinalize(
        org: String, intentId: String, actorUserId: String, request: PoyntCollectConfirmationDto
    ): Pair<PaymentIntentDto, CounterPurchaseResult?> {
        val nonce = request.nonce
        if (request.method !in setOf("card", "apple_pay", "google_pay")) {
            throw BadRequestException("Unsupported Poynt payment method")
        }
        val walletPayment = request.method != "card"
        if (walletPayment && collectBootstrap(org, intentId, actorUserId).wallet == null) {
            throw BadRequestException("Wallet payments are not configured for this organization")
        }
        val provider = collectProvider ?: throw BadRequestException("Poynt Collect is not configured")
        if (!provider.isAvailable) {
            throw BadRequestException("Poynt Collect payment is unavailable")
        }
        val current = get(org, intentId, actorUserId)
        if (current.providerCode != provider.code) throw BadRequestException("Payment is not a Collect payment")
        if (current.status == "SUCCEEDED") return getConfirmation(org, intentId, actorUserId)
        if (current.status != "PENDING") throw ConflictException("Payment is already in progress or closed")
        if (nonce.isBlank() || nonce.length > 4096) throw BadRequestException("Payment nonce is invalid")
        val row = translate { sql().collectConfiguration(org, intentId, actorUserId) }
            ?: throw BadRequestException("Poynt Collect configuration is unavailable")
        if (row.organizationId != org || row.providerStoreId.isNullOrBlank() ||
            row.merchantCurrencyCode != current.currencyCode || row.businessId.isBlank() ||
            row.applicationId.isBlank() || row.secretReference.isBlank()
        ) throw BadRequestException("Poynt Collect configuration is unavailable")
        val configuration = PoyntCatalogConfiguration(
            row.integrationConfigurationId, row.organizationId, row.applicationId,
            row.businessId, row.providerStoreId, row.secretReference,
            row.merchantCurrencyCode, null
        )
        val token = provider.token(configuration)
        // Card tokenization is non-charging and stays before the claim.
        // A wallet nonce is single-use charge material: ALWAYS claim first.
        val paymentToken = if (walletPayment) null else provider.tokenize(configuration, nonce, token)
        if (!translate { sql().claimCollectCharge(org, intentId, actorUserId) }) {
            throw ConflictException("Payment is already in progress or closed")
        }
        val result = if (walletPayment) {
            provider.chargeWalletNonce(current, configuration, nonce, token, amountMinor(current.amount))
        } else {
            provider.charge(current, configuration, paymentToken!!, token, amountMinor(current.amount))
        }
        val persistedReference = translate {
            sql().setProviderReference(intentId, provider.code, result.transactionId, actorUserId)
        } ?: throw ConflictException("Collect transaction reference is unavailable")
        if (persistedReference != result.transactionId) {
            throw ConflictException("Payment is associated with another Collect transaction")
        }
        if (result.approved) {
            // Persist capture before any membership finalization, even if it later rolls back.
            val recordedCapture = translate {
                collectCaptureSql().recordVerifiedCapture(
                    org, intentId, actorUserId, result.transactionId,
                    amountMinor(current.amount), current.currencyCode
                )
            }
            if (!recordedCapture) {
                throw ConflictException("Collect capture evidence is unavailable; reconciliation required")
            }
            translate {
                sql().confirmProviderSuccess(
                    intentId, org, provider.code, result.transactionId,
                    amountMinor(current.amount), current.currencyCode
                )
            } ?: throw ConflictException("Collect payment finalization is unavailable")
        } else if (result.definiteDecline) {
            translate {
                sql().recordProviderFailure(
                    intentId, org, provider.code, result.transactionId, "FAILED", "POYNT_COLLECT_DECLINED"
                )
            }
            syncCommercePaymentResult(org, intentId, actorUserId)
            throw BadRequestException("Poynt Collect payment was declined")
        }
        if (!result.approved) {
            throw ConflictException("Poynt Collect result is inconsistent; payment requires reconciliation")
        }
        syncCommercePaymentResult(org, intentId, actorUserId)
        return getConfirmation(org, intentId, actorUserId)
    }


    // Compatibility overload for existing card-only call sites.
    fun confirmCollectAndFinalize(
        org: String, intentId: String, actorUserId: String, nonce: String
    ): Pair<PaymentIntentDto, CounterPurchaseResult?> =
        confirmCollectAndFinalize(org, intentId, actorUserId, PoyntCollectConfirmationDto(nonce))

    fun handleStripeWebhook(rawBody: String, signature: String?): Boolean {
        val event = stripeProvider.verifiedEvent(rawBody, signature)
        return handleStripeEvent(event)
    }

    private fun handleStripeEvent(event: Event): Boolean {
        val session = stripeProvider.session(event) ?: return true
        val metadata = session.metadata ?: return true
        val intentId = metadata["memgine_payment_intent_id"] ?: return true
        val organizationId = metadata["organization_id"] ?: return true
        val sessionId = session.id ?: return true
        val currency = session.currency ?: return true

        return when (event.type) {
            "checkout.session.completed", "checkout.session.async_payment_succeeded" -> {
                if (session.paymentStatus != "paid" || session.amountTotal == null) return true
                translate {
                    sql().confirmProviderSuccess(
                        intentId,
                        organizationId,
                        stripeProvider.code,
                        sessionId,
                        session.amountTotal,
                        currency.uppercase()
                    )
                } ?: throw ConflictException("Stripe payment finalization was unavailable")
                syncCommercePaymentResult(organizationId, intentId, null)
                true
            }
            "checkout.session.async_payment_failed" ->
                translate {
                    sql().recordProviderFailure(
                        intentId,
                        organizationId,
                        stripeProvider.code,
                        sessionId,
                        "FAILED",
                        "STRIPE_ASYNC_PAYMENT_FAILED"
                    )
                }
                    .also { syncCommercePaymentResult(organizationId, intentId, null) }
            "checkout.session.expired" ->
                translate {
                    sql().recordProviderFailure(
                        intentId,
                        organizationId,
                        stripeProvider.code,
                        sessionId,
                        "CANCELED",
                        "STRIPE_CHECKOUT_EXPIRED"
                    )
                }
                    .also { syncCommercePaymentResult(organizationId, intentId, null) }
            else -> true
        }
    }

    private fun checkoutForProvider(
        intent: PaymentIntentDto,
        organizationId: String,
        returnContext: com.mynikatech.memgine.net.dto.PaymentReturnContextDto?,
        actorUserId: String?
    ): PaymentIntentDto {
        if (intent.providerCode == monerisProvider.code) {
            return intent.copy(
                monerisHostedTokenizationProfileId = monerisProvider.hostedTokenizationProfileId(),
                monerisHostedTokenizationUrl = monerisProvider.hostedTokenizationUrl()
            )
        }
        if (intent.providerCode != stripeProvider.code) return intent
        val actor = actorUserId ?: throw ForbiddenException("Payment actor is required")
        val sessionId = if (intent.providerReferenceId.isNullOrBlank()) {
            val created = stripeProvider.createCheckoutSession(intent, organizationId, returnContext)
            translate {
                sql().setProviderReference(intent.paymentIntentId, stripeProvider.code, created.id, actor)
            } ?: throw ConflictException("Stripe checkout session was unavailable")
        } else {
            intent.providerReferenceId
        }
        return intent.copy(
            providerReferenceId = sessionId,
            checkoutUrl = stripeProvider.checkoutUrl(sessionId)
        )
    }

    private fun syncCommercePaymentResult(org: String, intentId: String, actorUserId: String?) {
        translate {
            if (!sql().syncCommerceMembershipPaymentResult(org, intentId, actorUserId)) {
                throw ConflictException("Commerce payment synchronization was unavailable")
            }
        }
    }

    private fun validateId(value: String, name: String) {
        if (value.isBlank() || value.length > 64) throw BadRequestException("Invalid $name")
    }

    private fun validateIdempotencyKey(value: String) {
        if (value.isBlank() || value.length > 128) {
            throw BadRequestException("Valid payment idempotency key is required")
        }
    }

    private fun amountMinor(amount: Double): Long = try {
        java.math.BigDecimal.valueOf(amount)
            .movePointRight(2)
            .setScale(0, java.math.RoundingMode.UNNECESSARY)
            .longValueExact()
    } catch (_: ArithmeticException) {
        throw BadRequestException("Payment amount is invalid")
    }

    private fun requirePaymentProvider() {
        if (!configuredProvider.isAvailable) throw BadRequestException("Payment provider is not configured")
    }

    private fun requireCustomerPaymentProvider(code: String) {
        val provider = when (code) {
            "TEST" -> testProvider
            "STRIPE" -> stripeProvider
            "MONERIS" -> monerisProvider
            "POYNT_COLLECT" -> collectProvider
            else -> null
        }
        if (provider?.isAvailable != true) {
            throw BadRequestException("Customer payment provider is unavailable")
        }
    }

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
                "42501" -> throw ForbiddenException("Payment operation is not permitted")
                "23505", "40001" -> throw ConflictException("Payment state changed; retry the request")
                "22001", "22003", "22023", "23502", "23503", "23514", "P0002" -> {
                    val databaseMessage: String? = postgres?.serverErrorMessage?.message
                    val safeMessage: String? = when (databaseMessage) {
                        "Membership Offer is unavailable",
                        "Membership Offer is not eligible for this purchase",
                        "Customer already has an active subscription for this membership",
                        "Existing membership payment requires review before another purchase",
                        "Existing membership payment terms require review before another purchase" -> databaseMessage
                        else -> null
                    }
                    throw BadRequestException(
                        safeMessage ?: "Payment or membership details are unavailable"
                    )
                
                }
                else -> throw error
            }
        }
    }
}
