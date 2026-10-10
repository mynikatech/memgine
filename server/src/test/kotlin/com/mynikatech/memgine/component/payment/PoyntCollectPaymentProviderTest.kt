package com.mynikatech.memgine.component.payment

import com.mynikatech.memgine.component.commerce.provider.poynt.PoyntAccessToken
import com.mynikatech.memgine.component.commerce.provider.poynt.PoyntCatalogConfiguration
import com.mynikatech.memgine.component.commerce.provider.poynt.PoyntHttpResponse
import com.mynikatech.memgine.component.commerce.provider.poynt.PoyntHttpTransport
import com.mynikatech.memgine.exception.ConflictException
import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.net.dto.PaymentIntentDto
import java.net.URI
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class PoyntCollectPaymentProviderTest {
    private val config = PoyntCatalogConfiguration("INT-1", "ORG-1", "APP-1", "BUS-1", "STORE-1", "secret-ref", "CAD", null)
    private val payment = PaymentIntentDto("PAY-1", "POYNT_COLLECT", "PENDING", 89.99, "CAD",
        membershipPlanId = "PLAN-1", createdAt = "2026-10-04T00:00:00Z")

    @Test fun `SALE maps nonce and authoritative amount and currency`() {
        val transport = FakeTransport(tokenized(), success())
        val provider = provider(transport)
        val paymentToken = provider.tokenize(config, "nonce-secret", token())
        val result = provider.charge(payment, config, paymentToken, token(), 8999)
        assertTrue(result.approved)
        assertEquals("TX-1", result.transactionId)
        assertEquals(2, transport.posts.size)
        assertEquals(
            URI.create("https://services-ote.poynt.net/businesses/BUS-1/cards/tokenize"),
            transport.posts[0].uri
        )
        assertEquals("nonce-secret", Json.parseToJsonElement(transport.posts[0].body).jsonObject["nonce"]?.jsonPrimitive?.content)
        assertEquals(URI.create("https://services-ote.poynt.net/businesses/BUS-1/cards/tokenize/charge"), transport.uri)
        assertEquals("PAY-1", transport.requestId)
        val body = Json.parseToJsonElement(transport.body!!).jsonObject
        assertEquals("SALE", body["action"]?.jsonPrimitive?.content)
        assertEquals("BUS-1", body["context"]?.jsonObject?.get("businessId")?.jsonPrimitive?.content)
        assertEquals("STORE-1", body["context"]?.jsonObject?.get("storeId")?.jsonPrimitive?.content)
        assertEquals("8999", body["amounts"]?.jsonObject?.get("transactionAmount")?.jsonPrimitive?.content)
        assertEquals("8999", body["amounts"]?.jsonObject?.get("orderAmount")?.jsonPrimitive?.content)
        assertEquals("CAD", body["amounts"]?.jsonObject?.get("currency")?.jsonPrimitive?.content)
        assertEquals("payment-token", body["fundingSource"]?.jsonObject?.get("cardToken")?.jsonPrimitive?.content)
        assertEquals(null, body["fundingSource"]?.jsonObject?.get("nonce"))
    }

    @Test fun `declined sale is not approved`() {
        val provider = provider(FakeTransport(tokenized(), """{"id":"TX-2","action":"SALE","status":"DECLINED","context":{"businessId":"BUS-1","storeId":"STORE-1"}}"""))
        val result = provider.charge(payment, config, provider.tokenize(config, "nonce", token()), token(), 8999)
        assertFalse(result.approved)
    }

    @Test fun `malformed or inconsistent success remains unconfirmed`() {
        val provider = provider(FakeTransport(tokenized(), "not-json"))
        assertFailsWith<ConflictException> {
            provider.charge(payment, config, provider.tokenize(config, "nonce", token()), token(), 8999)
        }
        assertFalse(provider.parseResult(success(approvedAmount = 8998), 8999, "CAD").approved)
        assertFalse(provider.parseResult(success(currency = "USD"), 8999, "CAD").approved)
        assertFalse(provider.parseResult(success(status = "AUTHORIZED", processorStatus = "Declined"), 8999, "CAD").approved)
    }

    @Test fun `credential failure occurs before charge transport`() {
        val transport = FakeTransport(tokenized(), success())
        val provider = PoyntCollectPaymentProvider("https://services-ote.poynt.net", transport) { error("credential unavailable") }
        assertFailsWith<BadRequestException> { provider.token(config) }
        assertEquals(null, transport.body)
    }

    @Test fun `invalid tokenization stops before the charge`() {
        val transport = FakeTransport("""{"status":"INVALID"}""", success())
        assertFailsWith<BadRequestException> {
            provider(transport).tokenize(config, "nonce", token())
        }
        assertEquals(1, transport.posts.size)
        assertEquals(null, transport.uri)
    }

    @Test fun `ambiguous charge result requires reconciliation after tokenization`() {
        val transport = FakeTransport(tokenized(), "{}", chargeStatus = 503)
        val provider = provider(transport)
        assertFailsWith<ConflictException> {
            provider.charge(payment, config, provider.tokenize(config, "nonce", token()), token(), 8999)
        }
        assertEquals(2, transport.posts.size)
    }

    @Test fun `reconciliation uses the stable payment intent request ID and proves one approved sale`() {
        val transport = FakeTransport(tokenized(), success()).apply {
            lookupResponse = """{"transactions":[${success()}]}"""
        }
        val result = provider(transport).reconcile(payment, config, token(), 8999)
        assertTrue(result?.approved == true)
        assertEquals(
            URI.create("https://services-ote.poynt.net/businesses/BUS-1/transactions?original-request-id=PAY-1"),
            transport.lookupUri
        )
    }

    @Test fun `reconciliation leaves missing or ambiguous provider results unresolved`() {
        val transport = FakeTransport(tokenized(), success()).apply {
            lookupResponse = """{"transactions":[]}"""
        }
        assertEquals(null, provider(transport).reconcile(payment, config, token(), 8999))
        transport.lookupResponse = """{"transactions":[${success()},${success()}]}"""
        assertEquals(null, provider(transport).reconcile(payment, config, token(), 8999))
    }

    @Test fun `reconciliation rejects a transaction from another business or store`() {
        val transport = FakeTransport(tokenized(), success(businessId = "OTHER-BUS")).apply {
            lookupResponse = """{"transactions":[${success(businessId = "OTHER-BUS")}]}"""
        }
        assertEquals(null, provider(transport).reconcile(payment, config, token(), 8999))
    }

    private fun provider(transport: FakeTransport) = PoyntCollectPaymentProvider("https://services-ote.poynt.net", transport) { token() }
    private fun token() = PoyntAccessToken("access-secret", "Bearer", 9999999999)
    private fun tokenized() = """{"status":"ACTIVE","paymentToken":"payment-token"}"""
    private fun success(
        approvedAmount: Long = 8999,
        currency: String = "CAD",
        status: String = "AUTHORIZED",
        processorStatus: String = "Successful",
        businessId: String = "BUS-1",
        storeId: String = "STORE-1"
    ) =
        """{"id":"TX-1","originalRequestId":"PAY-1","action":"SALE","status":"$status","context":{"businessId":"$businessId","storeId":"$storeId"},"amounts":{"transactionAmount":8999,"orderAmount":8999,"currency":"$currency"},"processorResponse":{"approvedAmount":$approvedAmount,"status":"$processorStatus","statusCode":"AA"}}"""

    private class FakeTransport(
        private val tokenizationBody: String,
        private val chargeBody: String,
        private val chargeStatus: Int = 200
    ) : PoyntHttpTransport {
        data class Post(val uri: URI, val body: String)
        val posts = mutableListOf<Post>()
        var uri: URI? = null
        var requestId: String? = null
        var body: String? = null
        var lookupUri: URI? = null
        var lookupResponse: String? = null
        override fun post(uri: URI, authorization: String, requestId: String, body: String): PoyntHttpResponse {
            posts += Post(uri, body)
            if (uri.path.endsWith("/cards/tokenize")) return PoyntHttpResponse(200, tokenizationBody)
            this.uri = uri; this.requestId = requestId; this.body = body
            return PoyntHttpResponse(chargeStatus, chargeBody)
        }
        override fun get(uri: URI, authorization: String, modifiedSince: String?): PoyntHttpResponse {
            lookupUri = uri
            return PoyntHttpResponse(200, lookupResponse ?: error("Unexpected GET"))
        }
        override fun productUri(businessId: String, productId: String) = error("Unexpected product URI")
        override fun productsUri(businessId: String, offset: Int) = error("Unexpected products URI")
        override fun orderUri(businessId: String, orderId: String) = error("Unexpected order URI")
        override fun ordersUri(businessId: String) = error("Unexpected orders URI")
        override fun transactionsByOriginalRequestIdUri(businessId: String, originalRequestId: String) =
            URI.create("https://services-ote.poynt.net/businesses/$businessId/transactions?original-request-id=$originalRequestId")
    }
}
