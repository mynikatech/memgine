package com.mynikatech.memgine.component.payment

import com.mynikatech.memgine.component.commerce.provider.poynt.PoyntAccessToken
import com.mynikatech.memgine.component.commerce.provider.poynt.PoyntHttpResponse
import com.mynikatech.memgine.component.commerce.provider.poynt.PoyntHttpTransport
import com.mynikatech.memgine.config.PaymentConfig
import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.exception.ConflictException
import com.mynikatech.memgine.exception.ForbiddenException
import com.mynikatech.memgine.exception.NotFoundException
import com.mynikatech.memgine.net.dto.PaymentIntentDto
import com.mynikatech.memgine.net.dto.PoyntCollectConfirmationDto
import com.mynikatech.memgine.net.dto.PoyntCollectBootstrapDto
import java.io.IOException
import java.lang.reflect.Proxy
import java.net.URI
import java.util.concurrent.CountDownLatch
import java.util.concurrent.CompletableFuture
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference
import org.jdbi.v3.core.Jdbi
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull

class PoyntCollectConfirmationSecurityTest {
    @Test fun `bootstrap exposes only SDK and public Collect identifiers to owner`() {
        val fixture = Fixture(SUCCESS)
        val result = fixture.service.collectBootstrap("ORG-1", "PAY-1", "CUSTOMER-1")
        assertEquals(PoyntCollectBootstrapDto(
            "https://collect.commerce.ote-godaddy.com/sdk.js", "BUS-1", "APP-1"
        ), result)
        val body = Json.parseToJsonElement(Json.encodeToString(result)).jsonObject
        assertEquals(setOf("sdkUrl", "businessId", "applicationId"), body.keys)
        assertEquals(1, fixture.sql.configurationReads.get())
        assertEquals(0, fixture.tokenLookups.get())
    }

    @Test fun `routed Collect payment works when the global provider is TEST`() {
        val fixture = Fixture(SUCCESS, configuredProviderCode = "TEST")
        fixture.service.collectBootstrap("ORG-1", "PAY-1", "CUSTOMER-1")
        val result = fixture.service.confirmCollectAndFinalize("ORG-1", "PAY-1", "CUSTOMER-1", "nonce")
        assertEquals("SUCCEEDED", result.first.status)
        assertEquals(1, fixture.transport.charges.get())
    }

    @Test fun `bootstrap rejects another customer and organization before configuration read`() {
        val fixture = Fixture(SUCCESS)
        assertFailsWith<NotFoundException> {
            fixture.service.collectBootstrap("ORG-1", "PAY-1", "CUSTOMER-2")
        }
        assertFailsWith<NotFoundException> {
            fixture.service.collectBootstrap("ORG-2", "PAY-1", "CUSTOMER-1")
        }
        assertEquals(0, fixture.sql.configurationReads.get())
    }

    @Test fun `bootstrap rejects a payment for another provider`() {
        val fixture = Fixture(SUCCESS, intentProviderCode = "TEST")
        assertFailsWith<BadRequestException> {
            fixture.service.collectBootstrap("ORG-1", "PAY-1", "CUSTOMER-1")
        }
        assertEquals(0, fixture.sql.configurationReads.get())
    }

    @Test fun `bootstrap rejects an untrusted SDK URL`() {
        val fixture = Fixture(SUCCESS, sdkUrl = "javascript:alert(1)")
        assertFailsWith<BadRequestException> {
            fixture.service.collectBootstrap("ORG-1", "PAY-1", "CUSTOMER-1")
        }
        assertEquals(0, fixture.tokenLookups.get())
    }

    @Test fun `confirm contract contains only nonce`() {
        val body = Json.parseToJsonElement(Json.encodeToString(PoyntCollectConfirmationDto("nonce"))).jsonObject
        assertEquals(setOf("nonce"), body.keys)
    }

    @Test fun `browser checkout establishment is one time and browser session remains owner bound`() {
        val fixture = Fixture(SUCCESS)
        val url = fixture.service.createCollectBrowserCheckout("ORG-1", "PAY-1", "CUSTOMER-1")
        val token = URI(url).query.substringAfter("session=")
        val checkout = fixture.service.redeemCollectBrowserCheckout(token)
        assertEquals("PAY-1", checkout.session.paymentIntentId)
        assertEquals("CUSTOMER-1", checkout.session.customerUserId)
        assertFailsWith<ForbiddenException> { fixture.service.redeemCollectBrowserCheckout(token) }
        assertEquals("PAY-1", fixture.service.browserCollectConfirmation(checkout.browserToken).first.paymentIntentId)
    }

    @Test fun `success is finalized once and a second confirm makes no provider call`() {
        val fixture = Fixture(SUCCESS)
        val result = fixture.service.confirmCollectAndFinalize("ORG-1", "PAY-1", "CUSTOMER-1", "nonce")
        assertEquals("SUCCEEDED", result.first.status)
        assertEquals("TX-1", result.first.providerReferenceId)
        fixture.service.confirmCollectAndFinalize("ORG-1", "PAY-1", "CUSTOMER-1", "nonce-again")
        assertEquals(1, fixture.transport.charges.get())
        assertEquals(1, fixture.tokenLookups.get())
        assertEquals(1, fixture.sql.claims.get())
    }

    @Test fun `decline fails without finalizing membership`() {
        val fixture = Fixture("""{"id":"TX-2","action":"SALE","status":"DECLINED","context":{"businessId":"BUS-1","storeId":"STORE-1"}}""")
        assertFailsWith<BadRequestException> {
            fixture.service.confirmCollectAndFinalize("ORG-1", "PAY-1", "CUSTOMER-1", "nonce")
        }
        assertEquals("FAILED", fixture.sql.status.get())
        assertNull(fixture.sql.finalizedSubscriptionId)
        assertEquals("TX-2", fixture.sql.reference.get())
        assertEquals(0, fixture.sql.successFinalizations.get())
    }

    @Test fun `wrong customer or organization cannot resolve configuration or credentials`() {
        val fixture = Fixture(SUCCESS)
        assertFailsWith<NotFoundException> {
            fixture.service.confirmCollectAndFinalize("ORG-1", "PAY-1", "CUSTOMER-2", "nonce")
        }
        assertFailsWith<NotFoundException> {
            fixture.service.confirmCollectAndFinalize("ORG-2", "PAY-1", "CUSTOMER-1", "nonce")
        }
        assertEquals(0, fixture.sql.configurationReads.get())
        assertEquals(0, fixture.tokenLookups.get())
        assertEquals(0, fixture.transport.charges.get())
    }

    @Test fun `OAuth failure occurs before claim and does not expose the credential error`() {
        val fixture = Fixture(SUCCESS, failToken = true)
        val error = assertFailsWith<BadRequestException> {
            fixture.service.confirmCollectAndFinalize("ORG-1", "PAY-1", "CUSTOMER-1", "nonce")
        }
        assertEquals("Poynt Collect authentication is unavailable", error.message)
        assertEquals("PENDING", fixture.sql.status.get())
        assertEquals(0, fixture.sql.claims.get())
        assertEquals(0, fixture.transport.charges.get())
    }

    @Test fun `invalid tokenization leaves the intent pending and does not charge`() {
        val fixture = Fixture(SUCCESS, tokenizationBody = """{"status":"INVALID"}""")
        assertFailsWith<BadRequestException> {
            fixture.service.confirmCollectAndFinalize("ORG-1", "PAY-1", "CUSTOMER-1", "nonce")
        }
        assertEquals("PENDING", fixture.sql.status.get())
        assertEquals(0, fixture.sql.claims.get())
        assertEquals(0, fixture.transport.charges.get())
    }

    @Test fun `timeout stays PROCESSING and a second confirm does not redispatch`() {
        val fixture = Fixture(SUCCESS, timeout = true)
        val error = assertFailsWith<ConflictException> {
            fixture.service.confirmCollectAndFinalize("ORG-1", "PAY-1", "CUSTOMER-1", "nonce")
        }
        assertEquals("Poynt Collect result is unavailable; payment requires reconciliation", error.message)
        assertEquals("PROCESSING", fixture.sql.status.get())
        assertEquals(1, fixture.transport.charges.get())
        assertFailsWith<ConflictException> {
            fixture.service.confirmCollectAndFinalize("ORG-1", "PAY-1", "CUSTOMER-1", "nonce")
        }
        assertEquals(1, fixture.transport.charges.get())
        assertEquals(0, fixture.sql.failures.get())
    }

    @Test fun `inconsistent approved response keeps transaction reference for reconciliation`() {
        val fixture = Fixture(SUCCESS.replace("\"approvedAmount\":8999", "\"approvedAmount\":8998"))
        assertFailsWith<ConflictException> {
            fixture.service.confirmCollectAndFinalize("ORG-1", "PAY-1", "CUSTOMER-1", "nonce")
        }
        assertEquals("PROCESSING", fixture.sql.status.get())
        assertEquals("TX-1", fixture.sql.reference.get())
        assertEquals(0, fixture.sql.failures.get())
        assertEquals(0, fixture.sql.successFinalizations.get())
    }

    @Test fun `status lookup reconciles one approved processing Collect charge without reposting`() {
        val fixture = Fixture(
            SUCCESS,
            initialStatus = "PROCESSING",
            lookupBody = """{"transactions":[${SUCCESS}]}"""
        )
        val result = fixture.service.getConfirmation("ORG-1", "PAY-1", "CUSTOMER-1")
        assertEquals("SUCCEEDED", result.first.status)
        assertEquals("TX-1", result.first.providerReferenceId)
        assertEquals(0, fixture.transport.charges.get())
        assertEquals(1, fixture.transport.gets.get())
        assertEquals(1, fixture.sql.successFinalizations.get())
    }

    @Test fun `status lookup keeps processing when Poynt cannot prove one result`() {
        val fixture = Fixture(
            SUCCESS,
            initialStatus = "PROCESSING",
            lookupBody = """{"transactions":[]}"""
        )
        val result = fixture.service.getConfirmation("ORG-1", "PAY-1", "CUSTOMER-1")
        assertEquals("PROCESSING", result.first.status)
        assertEquals(0, fixture.transport.charges.get())
        assertEquals(1, fixture.transport.gets.get())
        assertEquals(0, fixture.sql.successFinalizations.get())
    }

    @Test fun `concurrent confirm cannot issue two POSTs`() {
        val entered = CountDownLatch(1)
        val release = CountDownLatch(1)
        val fixture = Fixture(SUCCESS, entered = entered, release = release)
        val executor = Executors.newSingleThreadExecutor()
        try {
            val first = CompletableFuture.supplyAsync({
                fixture.service.confirmCollectAndFinalize("ORG-1", "PAY-1", "CUSTOMER-1", "nonce")
            }, executor)
            assertEquals(true, entered.await(5, TimeUnit.SECONDS))
            assertFailsWith<ConflictException> {
                fixture.service.confirmCollectAndFinalize("ORG-1", "PAY-1", "CUSTOMER-1", "nonce-2")
            }
            release.countDown()
            assertEquals("SUCCEEDED", first.get(5, TimeUnit.SECONDS).first.status)
            assertEquals(1, fixture.transport.charges.get())
            assertEquals(1, fixture.sql.claims.get())
        } finally {
            release.countDown()
            executor.shutdownNow()
        }
    }

    private class Fixture(
        body: String,
        failToken: Boolean = false,
        timeout: Boolean = false,
        entered: CountDownLatch? = null,
        release: CountDownLatch? = null,
        intentProviderCode: String = "POYNT_COLLECT",
        sdkUrl: String = "https://collect.commerce.ote-godaddy.com/sdk.js",
        configuredProviderCode: String = "POYNT_COLLECT",
        initialStatus: String = "PENDING",
        lookupBody: String? = null,
        tokenizationBody: String = TOKENIZED
    ) {
        val sql = FakeSql(intentProviderCode, initialStatus)
        val transport = FakeTransport(body, timeout, entered, release, lookupBody, tokenizationBody)
        val tokenLookups = AtomicInteger()
        private val provider = PoyntCollectPaymentProvider("https://services-ote.poynt.net", transport) {
            tokenLookups.incrementAndGet()
            if (failToken) throw IllegalStateException("private-key-secret")
            PoyntAccessToken("access-secret", "Bearer", 9999999999)
        }
        val service = PaymentService(
            Jdbi.create("jdbc:postgresql://unused/memgine"), "dev",
            PaymentConfig(configuredProviderCode, "", "", "https://checkout.example.test", "", "", "",
                "https://api.sb.moneris.io", "2026-08-14", "", ""),
            sql.proxy, provider, sdkUrl
        )
    }

    private class FakeSql(private val intentProviderCode: String, initialStatus: String) {
        val status = AtomicReference(initialStatus)
        val reference = AtomicReference<String?>(null)
        val claims = AtomicInteger()
        val configurationReads = AtomicInteger()
        val successFinalizations = AtomicInteger()
        val failures = AtomicInteger()
        val finalizedSubscriptionId: String? = null
        private val establishment = AtomicReference<String?>(null)
        private val browser = AtomicReference<PoyntCollectCheckoutSessionRow?>(null)
        val proxy: PaymentSql = Proxy.newProxyInstance(
            PaymentSql::class.java.classLoader, arrayOf(PaymentSql::class.java)
        ) { _, method, args ->
            when (method.name) {
                "get" -> if (args?.get(0) == "ORG-1" && args[1] == "PAY-1" && args[2] == "CUSTOMER-1")
                    PaymentIntentDto("PAY-1", intentProviderCode, status.get(), 89.99, "CAD",
                        providerReferenceId = reference.get(), membershipPlanId = "PLAN-1",
                        customerUserId = "CUSTOMER-1", createdAt = "2026-10-04T00:00:00Z") else null
                "createCollectCheckoutSession" -> {
                    establishment.set(args?.get(1) as String)
                    true
                }
                "redeemCollectCheckoutSession" -> {
                    // The service owns SHA-256 encoding; this proxy models the
                    // database's one-time row lock rather than duplicating it.
                    if (establishment.getAndSet(null) == null) null
                    else PoyntCollectCheckoutSessionRow("ORG-1", "PAY-1", "CUSTOMER-1", args[2] as String)
                        .also { browser.set(it) }
                }
                "browserCollectCheckoutSession" -> browser.get()
                "collectConfiguration" -> {
                    configurationReads.incrementAndGet()
                    PoyntCollectConfigurationRow("INT-1", "ORG-1", "APP-1", "BUS-1", "STORE-1", "secret-ref", "CAD")
                }
                "claimCollectCharge" -> status.compareAndSet("PENDING", "PROCESSING").also { if (it) claims.incrementAndGet() }
                "setProviderReference" -> {
                    val supplied = args?.get(2) as String
                    reference.compareAndSet(null, supplied)
                    reference.get()
                }
                "confirmProviderSuccess" -> {
                    successFinalizations.incrementAndGet()
                    status.set("SUCCEEDED")
                    CounterPaymentFinalizationRow()
                }
                "recordProviderFailure" -> {
                    failures.incrementAndGet()
                    status.set("FAILED")
                    true
                }
                "syncCommerceMembershipPaymentResult" -> true
                else -> error("Unexpected PaymentSql call: ${method.name}")
            }
        } as PaymentSql
    }

    private class FakeTransport(
        private val body: String,
        private val timeout: Boolean,
        private val entered: CountDownLatch?,
        private val release: CountDownLatch?,
        private val lookupBody: String?,
        private val tokenizationBody: String
    ) : PoyntHttpTransport {
        val posts = AtomicInteger()
        val charges = AtomicInteger()
        val gets = AtomicInteger()
        override fun post(uri: URI, authorization: String, requestId: String, body: String): PoyntHttpResponse {
            posts.incrementAndGet()
            if (uri.path.endsWith("/cards/tokenize")) {
                return PoyntHttpResponse(200, tokenizationBody)
            }
            charges.incrementAndGet()
            entered?.countDown()
            release?.await(5, TimeUnit.SECONDS)
            if (timeout) throw IOException("raw-provider-response")
            return PoyntHttpResponse(200, this.body)
        }
        override fun get(uri: URI, authorization: String, modifiedSince: String?): PoyntHttpResponse {
            gets.incrementAndGet()
            return PoyntHttpResponse(200, lookupBody ?: error("Unexpected GET"))
        }
        override fun productUri(businessId: String, productId: String) = error("Unexpected URI")
        override fun productsUri(businessId: String, offset: Int) = error("Unexpected URI")
        override fun orderUri(businessId: String, orderId: String) = error("Unexpected URI")
        override fun ordersUri(businessId: String) = error("Unexpected URI")
        override fun transactionsByOriginalRequestIdUri(businessId: String, originalRequestId: String) =
            URI.create("https://services-ote.poynt.net/businesses/$businessId/transactions?original-request-id=$originalRequestId")
    }

    companion object {
        private const val TOKENIZED = """{"status":"ACTIVE","paymentToken":"payment-token"}"""
        private const val SUCCESS = """{"id":"TX-1","originalRequestId":"PAY-1","action":"SALE","status":"AUTHORIZED","context":{"businessId":"BUS-1","storeId":"STORE-1"},"amounts":{"transactionAmount":8999,"orderAmount":8999,"currency":"CAD"},"processorResponse":{"approvedAmount":8999,"status":"Successful","statusCode":"AA"}}"""
    }
}
