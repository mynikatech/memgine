package com.mynikatech.memgine.component.payment

import com.mynikatech.memgine.component.commerce.provider.poynt.PoyntAccessToken
import com.mynikatech.memgine.component.commerce.provider.poynt.PoyntCatalogConfiguration
import com.mynikatech.memgine.component.commerce.provider.poynt.PoyntHttpResponse
import com.mynikatech.memgine.component.commerce.provider.poynt.PoyntHttpTransport
import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.exception.ConflictException
import com.mynikatech.memgine.net.dto.PaymentIntentDto
import java.net.URI
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class PoyntCollectPaymentProviderTest {
    private val config = PoyntCatalogConfiguration(
        "INT-1", "ORG-1", "APP-1", "BUS-1", "STORE-1", "secret-ref", "CAD", null
    )
    private val payment = PaymentIntentDto(
        "PAY-1", "POYNT_COLLECT", "PENDING", 89.99, "CAD",
        membershipPlanId = "PLAN-1", createdAt = "2026-10-04T00:00:00Z"
    )

    @Test
    fun `card SALE sends authoritative amount and returns captured result`() {
        val transport = FakeTransport(tokenized(), sale())
        val provider = provider(transport)
        val result = provider.charge(payment, config, provider.tokenize(config, "nonce-secret", token()), token(), 8999)

        assertTrue(result.approved)
        assertEquals("TX-1", result.transactionId)
        assertEquals("BUS-1", result.verifiedBusinessId)
        assertEquals("STORE-1", result.verifiedStoreId)
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
        assertEquals("8999", body["amounts"]?.jsonObject?.get("transactionAmount")?.jsonPrimitive?.content)
        assertEquals("CAD", body["amounts"]?.jsonObject?.get("currency")?.jsonPrimitive?.content)
    }

    @Test
    fun `wallet and card use the same generic captured SALE classifier`() {
        assertTrue(provider(FakeTransport(tokenized(), sale()))
            .charge(payment, config, "payment-token", token(), 8999).approved)
        assertTrue(provider(FakeTransport(tokenized(), sale()))
            .chargeWalletNonce(payment, config, "wallet-nonce", token(), 8999).approved)
    }

    @Test
    fun `captured successful SALE accepts all processor status codes including omitted`() {
        for (statusCode in listOf("1", "AA", "200", "OTHER", null)) {
            assertTrue(classify(sale(statusCode = statusCode)).approved, "statusCode=$statusCode")
        }
        assertTrue(classify(sale(flags = mapOf(
            "partiallyApproved" to "false",
            "voided" to "false",
            "authOnly" to "false"
        ))).approved)
    }

    @Test
    fun `captured SALE without merchant context remains payable but has no refund merchant evidence`() {
        val response = sale().replace(
            "\"context\":{\"businessId\":\"BUS-1\",\"storeId\":\"STORE-1\"},",
            ""
        )

        val result = classify(response)

        assertTrue(result.approved)
        assertNull(result.verifiedBusinessId)
        assertNull(result.verifiedStoreId)
    }

    @Test
    fun `documented noncaptured statuses remain unresolved`() {
        for (status in listOf(
            "CREATED", "SAVED", "STEP_UP", "AUTHORIZED", "PARTIALLY_CAPTURED", "VOIDED",
            "PARTIALLY_REFUNDED", "REFUNDED", "PARTIALLY_CAPTURED_AND_PARTIALLY_REFUNDED",
            "FUTURE_STATE", "", null
        )) {
            val result = classify(sale(status = status))
            assertFalse(result.approved, "status=$status")
            assertFalse(result.definiteDecline, "status=$status")
        }
    }

    @Test
    fun `only strict declined SALE is a definitive decline`() {
        assertTrue(classify(sale(status = "DECLINED", processorStatus = "Failure", approvedAmount = "0")).definiteDecline)
        assertTrue(classify(sale(status = "DECLINED", processorStatus = "Failure", approvedAmount = null)).definiteDecline)

        for (response in listOf(
            sale(status = "DECLINED", processorStatus = "Successful", approvedAmount = "0"),
            sale(status = "DECLINED", processorStatus = "Failure", approvedAmount = "1"),
            sale(status = "DECLINED", processorStatus = "Failure", flags = mapOf("partiallyApproved" to "true")),
            sale(status = "DECLINED", processorStatus = "Failure", businessId = "OTHER"),
            sale(status = "DECLINED", processorStatus = "Failure", transactionAmount = "8998")
        )) {
            val result = classify(response)
            assertFalse(result.approved)
            assertFalse(result.definiteDecline)
        }
    }

    @Test
    fun `captured SALE rejects partial reversed malformed and mismatched confirmation`() {
        for (response in listOf(
            sale(processorStatus = "Failure"),
            sale(approvedAmount = "8998"), sale(approvedAmount = "9000"), sale(approvedAmount = "0"),
            sale(approvedAmount = null), sale(approvedAmount = "89.99"),
            sale(flags = mapOf("partiallyApproved" to "true")),
            sale(flags = mapOf("voided" to "true")), sale(flags = mapOf("authOnly" to "true")),
            sale(flags = mapOf("refunded" to "true")), sale(flags = mapOf("reversed" to "true")),
            sale(flags = mapOf("reversal" to "true")), sale(flags = mapOf("partiallyCaptured" to "true")),
            sale(action = "REFUND"), sale(flags = mapOf("partiallyApproved" to "yes")),
            sale(businessId = "OTHER"), sale(storeId = "OTHER"), sale(currency = "USD"),
            sale(transactionAmount = "8998"), sale(orderAmount = "8998"),
            sale(transactionAmount = "89.99"), sale(orderAmount = "\"8999\"")
        )) {
            val result = classify(response)
            assertFalse(result.approved)
            assertFalse(result.definiteDecline)
        }
    }

    @Test
    fun `malformed and ambiguous initial outcomes require reconciliation`() {
        assertFailsWith<ConflictException> {
            provider(FakeTransport(tokenized(), "not-json")).charge(payment, config, "payment-token", token(), 8999)
        }
        assertFailsWith<ConflictException> {
            provider(FakeTransport(tokenized(), "{}", chargeStatus = 503)).charge(payment, config, "payment-token", token(), 8999)
        }
        assertFailsWith<ConflictException> {
            provider(FakeTransport(tokenized(), "{}", chargeStatus = 500)).charge(payment, config, "payment-token", token(), 8999)
        }
        val timeout = FakeTransport(tokenized(), sale(), throwOnCharge = true)
        assertFailsWith<ConflictException> {
            provider(timeout).charge(payment, config, "payment-token", token(), 8999)
        }
        assertEquals(1, timeout.posts.size)
    }

    @Test
    fun `wallet timeout never reposts nonce and reconciliation is GET only`() {
        val transport = FakeTransport(tokenized(), sale(), throwOnCharge = true)
        val provider = provider(transport)
        assertFailsWith<ConflictException> {
            provider.chargeWalletNonce(payment, config, "wallet-nonce", token(), 8999)
        }
        assertEquals(1, transport.posts.size)

        transport.throwOnCharge = false
        transport.lookupResponse = sale()
        val recovered = provider.reconcile(
            payment.copy(providerReferenceId = "TX-1"), config, token(), 8999
        )
        assertTrue(recovered?.approved == true)
        assertEquals(1, transport.posts.size)
        assertEquals(
            URI.create("https://services-ote.poynt.net/businesses/BUS-1/transactions?transactionIds=TX-1"),
            transport.lookupUri
        )
    }

    @Test
    fun `missing or invalid transaction identity is rejected`() {
        assertFailsWith<ConflictException> {
            classify("""{"action":"SALE"}""")
        }
        assertFailsWith<ConflictException> {
            classify(sale(id = ""))
        }
    }

    @Test
    fun `tokenization and credential errors prevent charge`() {
        val invalidTokenization = FakeTransport("""{"status":"INVALID"}""", sale())
        assertFailsWith<BadRequestException> { provider(invalidTokenization).tokenize(config, "nonce", token()) }
        assertEquals(1, invalidTokenization.posts.size)
        assertEquals(null, invalidTokenization.uri)

        val credentialTransport = FakeTransport(tokenized(), sale())
        val credentialFailure = PoyntCollectPaymentProvider("https://services-ote.poynt.net", credentialTransport) {
            error("credential unavailable")
        }
        assertFailsWith<BadRequestException> { credentialFailure.token(config) }
        assertEquals(null, credentialTransport.body)
    }

    @Test
    fun `malformed inactive missing and rejected card tokenization never charge`() {
        for ((body, status) in listOf(
            "not-json" to 200,
            "{}" to 200,
            """{"status":"ACTIVE"}""" to 200,
            """{"status":"INACTIVE","paymentToken":"payment-token"}""" to 200,
            """{"status":"ACTIVE","paymentToken":"payment-token"}""" to 500
        )) {
            val transport = FakeTransport(body, sale(), tokenizationStatus = status)
            assertFailsWith<BadRequestException> {
                provider(transport).tokenize(config, "nonce", token())
            }
            assertEquals(1, transport.posts.size)
            assertNull(transport.uri)
        }
    }

    @Test
    fun `reconciliation accepts supported single transaction shapes without posting`() {
        val current = payment.copy(providerReferenceId = "TX-1")
        val transport = FakeTransport(tokenized(), sale())
        val provider = provider(transport)

        for (response in listOf(sale(), "[${sale()}]", """{"transactions":[${sale()}]}""")) {
            transport.lookupResponse = response
            assertTrue(provider.reconcile(current, config, token(), 8999)?.approved == true)
        }
        assertEquals(URI.create("https://services-ote.poynt.net/businesses/BUS-1/transactions?transactionIds=TX-1"), transport.lookupUri)
        assertEquals(0, transport.posts.size)
    }

    @Test
    fun `reconciliation keeps correlation and transport uncertainty unresolved`() {
        val current = payment.copy(providerReferenceId = "TX-1")
        val transport = FakeTransport(tokenized(), sale())
        val provider = provider(transport)
        for (response in listOf(
            """{"transactions":[]}""", """{"transactions":[${sale()},${sale()}]}""",
            sale(id = "TX-OTHER"), sale(originalRequestId = "PAY-OTHER"), "not-json"
        )) {
            transport.lookupResponse = response
            transport.lookupStatus = 200
            assertNull(provider.reconcile(current, config, token(), 8999))
        }
        for (status in listOf(401, 403, 404, 409, 429, 500, 503)) {
            transport.lookupStatus = status
            assertNull(provider.reconcile(current, config, token(), 8999))
        }
        transport.throwOnLookup = true
        assertNull(provider.reconcile(current, config, token(), 8999))
        assertEquals(0, transport.posts.size)
    }

    @Test
    fun `reconciliation never approves mismatched context or money and only performs GET`() {
        val current = payment.copy(providerReferenceId = "TX-1")
        val transport = FakeTransport(tokenized(), sale())
        val provider = provider(transport)

        for (response in listOf(
            sale(businessId = "BUS-OTHER"), sale(storeId = "STORE-OTHER"),
            sale(currency = "USD"), sale(transactionAmount = "8998"),
            sale(orderAmount = "8998"), sale(approvedAmount = "8998")
        )) {
            transport.lookupResponse = response
            val result = provider.reconcile(current, config, token(), 8999)
            assertFalse(result?.approved == true)
            assertFalse(result?.definiteDecline == true)
        }
        assertEquals(0, transport.posts.size)
        assertEquals(
            URI.create("https://services-ote.poynt.net/businesses/BUS-1/transactions?transactionIds=TX-1"),
            transport.lookupUri
        )
    }

    private fun classify(response: String): PoyntCollectResult =
        provider(FakeTransport(tokenized(), response)).parseResult(response, 8999, "CAD", config)

    private fun provider(transport: FakeTransport) =
        PoyntCollectPaymentProvider("https://services-ote.poynt.net", transport) { token() }

    private fun token() = PoyntAccessToken("access-secret", "Bearer", 9999999999)
    private fun tokenized() = """{"status":"ACTIVE","paymentToken":"payment-token"}"""

    private fun sale(
        id: String = "TX-1", originalRequestId: String? = "PAY-1", action: String = "SALE",
        status: String? = "CAPTURED", processorStatus: String? = "Successful", statusCode: String? = "AA",
        approvedAmount: String? = "8999", businessId: String = "BUS-1", storeId: String = "STORE-1",
        transactionAmount: String = "8999", orderAmount: String = "8999", currency: String? = "CAD",
        flags: Map<String, String> = emptyMap()
    ): String {
        val fields = mutableListOf("\"id\":\"$id\"", "\"action\":\"$action\"")
        originalRequestId?.let { fields += "\"originalRequestId\":\"$it\"" }
        status?.let { fields += "\"status\":\"$it\"" }
        fields += "\"context\":{\"businessId\":\"$businessId\",\"storeId\":\"$storeId\"}"
        val amountFields = mutableListOf("\"transactionAmount\":$transactionAmount", "\"orderAmount\":$orderAmount")
        currency?.let { amountFields += "\"currency\":\"$it\"" }
        fields += "\"amounts\":{${amountFields.joinToString(",")}}"
        val processorFields = mutableListOf<String>()
        processorStatus?.let { processorFields += "\"status\":\"$it\"" }
        statusCode?.let { processorFields += "\"statusCode\":\"$it\"" }
        approvedAmount?.let { processorFields += "\"approvedAmount\":$it" }
        fields += "\"processorResponse\":{${processorFields.joinToString(",")}}"
        flags.forEach { (key, value) -> fields += "\"$key\":$value" }
        return "{${fields.joinToString(",")}}"
    }

    private class FakeTransport(
        private val tokenizationBody: String,
        private val chargeBody: String,
        private val chargeStatus: Int = 200,
        private val tokenizationStatus: Int = 200,
        var throwOnCharge: Boolean = false
    ) : PoyntHttpTransport {
        data class Post(val uri: URI, val body: String)
        val posts = mutableListOf<Post>()
        var uri: URI? = null
        var requestId: String? = null
        var body: String? = null
        var lookupUri: URI? = null
        var lookupResponse: String? = null
        var lookupStatus: Int = 200
        var throwOnLookup = false

        override fun post(uri: URI, authorization: String, requestId: String, body: String): PoyntHttpResponse {
            posts += Post(uri, body)
            if (uri.path.endsWith("/cards/tokenize")) {
                return PoyntHttpResponse(tokenizationStatus, tokenizationBody)
            }
            this.uri = uri
            this.requestId = requestId
            this.body = body
            if (throwOnCharge) error("charge timeout")
            return PoyntHttpResponse(chargeStatus, chargeBody)
        }
        override fun get(uri: URI, authorization: String, modifiedSince: String?): PoyntHttpResponse {
            if (throwOnLookup) error("lookup timeout")
            lookupUri = uri
            return PoyntHttpResponse(lookupStatus, lookupResponse ?: error("Unexpected GET"))
        }
        override fun productUri(businessId: String, productId: String) = error("Unexpected product URI")
        override fun productsUri(businessId: String, offset: Int) = error("Unexpected products URI")
        override fun orderUri(businessId: String, orderId: String) = error("Unexpected order URI")
        override fun ordersUri(businessId: String) = error("Unexpected orders URI")
        override fun transactionsByOriginalRequestIdUri(businessId: String, originalRequestId: String) =
            URI.create("https://services-ote.poynt.net/businesses/$businessId/transactions?original-request-id=$originalRequestId")
        override fun transactionByIdUri(businessId: String, transactionId: String) =
            URI.create("https://services-ote.poynt.net/businesses/$businessId/transactions?transactionIds=$transactionId")
    }
}
