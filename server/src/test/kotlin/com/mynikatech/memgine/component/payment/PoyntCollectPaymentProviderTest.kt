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
        val transport = FakeTransport(success())
        val provider = provider(transport)
        val result = provider.charge(payment, config, "nonce-secret", token(), 8999)
        assertTrue(result.approved)
        assertEquals("TX-1", result.transactionId)
        assertEquals(URI.create("https://services-ote.poynt.net/businesses/BUS-1/cards/tokenize/charge"), transport.uri)
        assertEquals("PAY-1", transport.requestId)
        val body = Json.parseToJsonElement(transport.body!!).jsonObject
        assertEquals("SALE", body["action"]?.jsonPrimitive?.content)
        assertEquals("BUS-1", body["context"]?.jsonObject?.get("businessId")?.jsonPrimitive?.content)
        assertEquals("STORE-1", body["context"]?.jsonObject?.get("storeId")?.jsonPrimitive?.content)
        assertEquals("8999", body["amounts"]?.jsonObject?.get("transactionAmount")?.jsonPrimitive?.content)
        assertEquals("8999", body["amounts"]?.jsonObject?.get("orderAmount")?.jsonPrimitive?.content)
        assertEquals("CAD", body["amounts"]?.jsonObject?.get("currency")?.jsonPrimitive?.content)
        assertEquals("nonce-secret", body["fundingSource"]?.jsonObject?.get("nonce")?.jsonPrimitive?.content)
    }

    @Test fun `declined sale is not approved`() {
        val result = provider(FakeTransport("""{"id":"TX-2","action":"SALE","status":"DECLINED"}"""))
            .charge(payment, config, "nonce", token(), 8999)
        assertFalse(result.approved)
    }

    @Test fun `malformed or inconsistent success remains unconfirmed`() {
        val provider = provider(FakeTransport("not-json"))
        assertFailsWith<ConflictException> { provider.charge(payment, config, "nonce", token(), 8999) }
        assertFalse(provider.parseResult(success(approvedAmount = 8998), 8999, "CAD").approved)
        assertFalse(provider.parseResult(success(currency = "USD"), 8999, "CAD").approved)
        assertFalse(provider.parseResult(success(status = "AUTHORIZED", processorStatus = "Declined"), 8999, "CAD").approved)
    }

    @Test fun `credential failure occurs before charge transport`() {
        val transport = FakeTransport(success())
        val provider = PoyntCollectPaymentProvider("https://services-ote.poynt.net", transport) { error("credential unavailable") }
        assertFailsWith<BadRequestException> { provider.token(config) }
        assertEquals(null, transport.body)
    }

    private fun provider(transport: FakeTransport) = PoyntCollectPaymentProvider("https://services-ote.poynt.net", transport) { token() }
    private fun token() = PoyntAccessToken("access-secret", "Bearer", 9999999999)
    private fun success(approvedAmount: Long = 8999, currency: String = "CAD", status: String = "AUTHORIZED", processorStatus: String = "Successful") =
        """{"id":"TX-1","action":"SALE","status":"$status","amounts":{"transactionAmount":8999,"orderAmount":8999,"currency":"$currency"},"processorResponse":{"approvedAmount":$approvedAmount,"status":"$processorStatus","statusCode":"AA"}}"""

    private class FakeTransport(private val responseBody: String) : PoyntHttpTransport {
        var uri: URI? = null
        var requestId: String? = null
        var body: String? = null
        override fun post(uri: URI, authorization: String, requestId: String, body: String): PoyntHttpResponse {
            this.uri = uri; this.requestId = requestId; this.body = body
            return PoyntHttpResponse(200, responseBody)
        }
        override fun get(uri: URI, authorization: String, modifiedSince: String?) = error("Unexpected GET")
        override fun productUri(businessId: String, productId: String) = error("Unexpected product URI")
        override fun productsUri(businessId: String, offset: Int) = error("Unexpected products URI")
        override fun orderUri(businessId: String, orderId: String) = error("Unexpected order URI")
        override fun ordersUri(businessId: String) = error("Unexpected orders URI")
    }
}
