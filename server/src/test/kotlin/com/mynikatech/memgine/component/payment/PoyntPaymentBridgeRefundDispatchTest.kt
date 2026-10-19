package com.mynikatech.memgine.component.payment

import com.mynikatech.memgine.component.commerce.provider.poynt.*
import com.mynikatech.memgine.exception.BadRequestException
import java.net.URI
import java.security.KeyPairGenerator
import java.time.Instant
import java.util.Base64
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

/** All I/O is captured in memory; these tests never contact Poynt. */
class PoyntPaymentBridgeRefundDispatchTest {
    private class RecordingTransport : PoyntHttpTransport {
        var posts = 0
        var lastBody = ""
        var lastRequestId = ""
        var nextStatus = 200
        var timeout = false

        override fun post(uri: URI, authorization: String, requestId: String, body: String): PoyntHttpResponse {
            assertEquals("/cloudMessages", uri.path)
            posts++
            lastBody = body
            lastRequestId = requestId
            if (timeout) throw BadRequestException("Simulated transport timeout")
            return PoyntHttpResponse(nextStatus, "{}")
        }
        override fun get(uri: URI, authorization: String, modifiedSince: String?): PoyntHttpResponse =
            error("No provider GET expected")
        override fun productUri(businessId: String, productId: String): URI = error("Unexpected URI")
        override fun productsUri(businessId: String, offset: Int): URI = error("Unexpected URI")
        override fun orderUri(businessId: String, orderId: String): URI = error("Unexpected URI")
        override fun ordersUri(businessId: String): URI = error("Unexpected URI")
    }

    private val configuration = PoyntCatalogConfiguration(
        integrationConfigurationId = "integration-1",
        organizationId = "organization-1",
        applicationId = "app-1",
        businessId = "business-1",
        providerStoreId = "store-1",
        secretReference = "unused-local-test-key",
        merchantCurrencyCode = "CAD",
        lastIncrementalSyncAt = null
    )

    private fun request(reference: String = "PRA_test_1") = PoyntBridgeRefundDispatchRequest(
        originalTransactionId = "original-capture-1",
        referenceId = reference,
        amountMinor = 20,
        currencyCode = "CAD",
        businessId = "business-1",
        storeId = "store-1",
        deviceId = "device-1",
        callbackUrl = "https://example.invalid/api/v1/commerce/providers/poynt/payment-bridge/refund-callback",
        callbackHeaderName = "X-Test-Callback",
        callbackHeaderValue = "test-secret",
        ttlSeconds = 45
    )

    private fun client(transport: RecordingTransport): PoyntPaymentBridgeClient {
        val key = KeyPairGenerator.getInstance("RSA").apply { initialize(2048) }.generateKeyPair()
        val pem = "-----BEGIN PRIVATE KEY-----\n" +
            Base64.getMimeEncoder(64, "\n".toByteArray()).encodeToString(key.private.encoded) +
            "\n-----END PRIVATE KEY-----"
        val tokens = PoyntTokenService(
            credentials = PoyntCredentialResolver { PoyntCredential(pem) },
            transport = object : PoyntTokenTransport {
                override fun requestToken(assertion: String): PoyntTokenResponse {
                    assertTrue(assertion.isNotBlank())
                    return PoyntTokenResponse("fake-access-token", "Bearer", 3600)
                }
            },
            audience = "unit-test",
            now = { Instant.parse("2026-10-19T00:00:00Z") }
        )
        return PoyntPaymentBridgeClient(transport, tokens)
    }

    @Test
    fun `partial refund sends one referenced cloud message with exact fields`() {
        val transport = RecordingTransport()
        client(transport).dispatchRefund(configuration, request())
        assertEquals(1, transport.posts)
        assertEquals("PRA_test_1", transport.lastRequestId)
        val message = Json.parseToJsonElement(transport.lastBody).jsonObject
        assertEquals("business-1", message.getValue("businessId").jsonPrimitive.content)
        assertEquals("store-1", message.getValue("storeId").jsonPrimitive.content)
        assertEquals("device-1", message.getValue("deviceId").jsonPrimitive.content)
        assertEquals("45", message.getValue("ttl").jsonPrimitive.content)
        val refund = Json.parseToJsonElement(message.getValue("data").jsonPrimitive.content).jsonObject
        assertEquals("refund", refund.getValue("action").jsonPrimitive.content)
        assertEquals("original-capture-1", refund.getValue("transactionId").jsonPrimitive.content)
        assertEquals("20", refund.getValue("purchaseAmount").jsonPrimitive.content)
        assertEquals("CAD", refund.getValue("currency").jsonPrimitive.content)
        assertEquals("PRA_test_1", refund.getValue("referenceId").jsonPrimitive.content)
        assertEquals("true", refund.getValue("enableStatusUpdates").jsonPrimitive.content)
        assertEquals("X-Test-Callback: test-secret", refund.getValue("custom-http-header").jsonPrimitive.content)
        assertEquals(request().callbackUrl, refund.getValue("callbackUrl").jsonPrimitive.content)
        assertTrue("payment" !in message)
    }

    @Test
    fun `HTTP acknowledgement only completes dispatch not financial refund`() {
        val transport = RecordingTransport()
        client(transport).dispatchRefund(configuration, request())
        assertEquals(1, transport.posts)
        // The client returns Unit; there is no SUCCEEDED financial result to infer from HTTP 200.
    }

    @Test
    fun `transport timeout does not cause an automatic second POST`() {
        val transport = RecordingTransport().apply { timeout = true }
        assertFailsWith<BadRequestException> { client(transport).dispatchRefund(configuration, request()) }
        assertEquals(1, transport.posts)
    }

    @Test
    fun `non-2xx acknowledgement does not cause an automatic second POST`() {
        val transport = RecordingTransport().apply { nextStatus = 503 }
        assertFailsWith<BadRequestException> { client(transport).dispatchRefund(configuration, request()) }
        assertEquals(1, transport.posts)
    }

    @Test
    fun `merchant mismatch is rejected before POST`() {
        val transport = RecordingTransport()
        assertFailsWith<BadRequestException> {
            client(transport).dispatchRefund(configuration, request().copy(storeId = "different-store"))
        }
        assertEquals(0, transport.posts)
    }
}
