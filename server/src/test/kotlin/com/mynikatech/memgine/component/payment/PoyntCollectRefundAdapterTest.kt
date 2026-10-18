package com.mynikatech.memgine.component.payment

import com.mynikatech.memgine.component.commerce.provider.poynt.PoyntAccessToken
import com.mynikatech.memgine.component.commerce.provider.poynt.PoyntCatalogConfiguration
import com.mynikatech.memgine.component.commerce.provider.poynt.PoyntHttpResponse
import com.mynikatech.memgine.component.commerce.provider.poynt.PoyntHttpTransport
import java.net.URI
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

class PoyntCollectRefundAdapterTest {
    private val configuration = PoyntCatalogConfiguration(
        "INT-1", "ORG-1", "APP-1", "BUS-1", "STORE-1", "secret", "CAD", null
    )
    private fun request(amount: Long = 2_500) = PoyntCollectRefundRequest(
        "PRA-1", "CAPTURE-1", amount, "CAD", configuration
    )

    @Test
    fun `full and partial refund requests use the capture as parent and stable attempt id`() {
        val transport = FakeTransport(refund(2_500))
        val adapter = adapter(transport)
        val result = adapter.execute(request())

        val body = Json.parseToJsonElement(transport.postBody!!).jsonObject
        assertEquals("REFUND", body["action"]?.jsonPrimitive?.content)
        assertEquals("CAPTURE-1", body["parentId"]?.jsonPrimitive?.content)
        assertEquals("CREDIT_DEBIT", body["fundingSource"]?.jsonObject?.get("type")?.jsonPrimitive?.content)
        assertEquals("2500", body["amounts"]?.jsonObject?.get("transactionAmount")?.jsonPrimitive?.content)
        assertEquals("2500", body["amounts"]?.jsonObject?.get("orderAmount")?.jsonPrimitive?.content)
        assertEquals("PRA-1", transport.requestId)
        assertEquals(PaymentRefundProviderOutcome.SUCCEEDED, result.outcome)
        assertEquals("REFUND-1", result.providerReference)
        assertEquals("PRA-1", result.providerOriginalRequestId)
    }

    @Test
    fun `observed successful refund without approved amount is accepted only with complete evidence`() {
        val observed = refund(
            amount = 20,
            id = "REFUND-OBSERVED",
            approvedAmount = null,
            includeOriginalRequestId = false
        )
        val direct = adapter(FakeTransport(observed)).execute(request(20))
        assertEquals(PaymentRefundProviderOutcome.SUCCEEDED, direct.outcome)
        assertEquals("REFUND-OBSERVED", direct.providerReference)

        val wrapped = adapter(FakeTransport("{\"transactions\":[$observed]}")).execute(request(20))
        assertEquals(PaymentRefundProviderOutcome.SUCCEEDED, wrapped.outcome)

        assertEquals(
            PaymentRefundProviderOutcome.UNKNOWN_REQUIRES_RECONCILIATION,
            adapter(FakeTransport(refund(20, approvedAmount = 19, includeOriginalRequestId = false)))
                .execute(request(20)).outcome
        )
    }

    @Test
    fun `decline timeout and malformed response stay distinct and do not repost`() {
        assertEquals(
            PaymentRefundProviderOutcome.FAILED,
            adapter(FakeTransport(refund(2_500, status = "DECLINED", processorStatus = "Failure", approvedAmount = 0)))
                .execute(request()).outcome
        )
        val timeout = FakeTransport(refund(2_500), throwOnPost = true)
        assertEquals(PaymentRefundProviderOutcome.UNKNOWN_REQUIRES_RECONCILIATION, adapter(timeout).execute(request()).outcome)
        assertEquals(1, timeout.postCalls)
        assertEquals(PaymentRefundProviderOutcome.UNKNOWN_REQUIRES_RECONCILIATION, adapter(FakeTransport("{}"))
            .execute(request()).outcome)

        assertEquals(
            PaymentRefundProviderOutcome.UNKNOWN_REQUIRES_RECONCILIATION,
            adapter(FakeTransport("provider-error", postStatus = 400)).execute(request()).outcome
        )
    }

    @Test
    fun `automatic reconciliation is exact reference GET only and refuses mismatched evidence`() {
        val transport = FakeTransport(refund(2_500), lookup = refund(2_500))
        val adapter = adapter(transport)
        assertEquals(PaymentRefundProviderOutcome.UNKNOWN_REQUIRES_RECONCILIATION, adapter.reconcile(request(), null).outcome)
        assertEquals(0, transport.getCalls)
        assertEquals(PaymentRefundProviderOutcome.SUCCEEDED, adapter.reconcile(request(), "REFUND-1").outcome)
        assertEquals(PaymentRefundProviderOutcome.SUCCEEDED, adapter.reconcile(request(), "REFUND-1").outcome)
        assertEquals(0, transport.postCalls)
        assertTrue(transport.lookupUri!!.query!!.contains("transactionIds=REFUND-1"))

        transport.lookup = refund(2_500, parent = "OTHER")
        assertEquals(PaymentRefundProviderOutcome.UNKNOWN_REQUIRES_RECONCILIATION, adapter.reconcile(request(), "REFUND-1").outcome)
        transport.lookup = refund(2_500, currency = "USD")
        assertEquals(PaymentRefundProviderOutcome.UNKNOWN_REQUIRES_RECONCILIATION, adapter.reconcile(request(), "REFUND-1").outcome)
        transport.lookup = refund(2_500, businessId = "BUS-OTHER")
        assertEquals(PaymentRefundProviderOutcome.UNKNOWN_REQUIRES_RECONCILIATION, adapter.reconcile(request(), "REFUND-1").outcome)
        transport.lookup = refund(2_500, storeId = "STORE-OTHER")
        assertEquals(PaymentRefundProviderOutcome.UNKNOWN_REQUIRES_RECONCILIATION, adapter.reconcile(request(), "REFUND-1").outcome)
    }

    @Test
    fun `reconciliation keeps unknown when evidence is ambiguous contradictory or incomplete`() {
        val transport = FakeTransport(refund(2_500))
        val adapter = adapter(transport)
        transport.lookup = """{"transactions":[${refund(2_500)},${refund(2_500)}] }"""
        assertEquals(PaymentRefundProviderOutcome.UNKNOWN_REQUIRES_RECONCILIATION, adapter.reconcile(request(), "REFUND-1").outcome)

        transport.lookup = refund(2_500).replace("\"approvedAmount\":2500", "\"approvedAmount\":\"2500\"")
        assertEquals(PaymentRefundProviderOutcome.UNKNOWN_REQUIRES_RECONCILIATION, adapter.reconcile(request(), "REFUND-1").outcome)
        transport.lookup = refund(2_500).dropLast(1) + ",\"voided\":true}"
        assertEquals(PaymentRefundProviderOutcome.UNKNOWN_REQUIRES_RECONCILIATION, adapter.reconcile(request(), "REFUND-1").outcome)
        assertEquals(0, transport.postCalls)
    }

    private fun adapter(transport: FakeTransport) = PoyntCollectRefundAdapter("https://services-ote.poynt.net", transport) {
        PoyntAccessToken("token", "Bearer", Long.MAX_VALUE)
    }

    private fun refund(
        amount: Long,
        id: String = "REFUND-1",
        parent: String = "CAPTURE-1",
        status: String = "REFUNDED",
        processorStatus: String = "Successful",
        approvedAmount: Long? = amount,
        currency: String = "CAD",
        businessId: String = "BUS-1",
        storeId: String = "STORE-1",
        includeOriginalRequestId: Boolean = true
    ): String {
        val originalRequestId = if (includeOriginalRequestId) "\"originalRequestId\":\"PRA-1\"," else ""
        val approved = approvedAmount?.let { ",\"approvedAmount\":$it" } ?: ""
        return """{"id":"$id",$originalRequestId"action":"REFUND","parentId":"$parent","status":"$status","context":{"businessId":"$businessId","storeId":"$storeId"},"amounts":{"transactionAmount":$amount,"orderAmount":$amount,"currency":"$currency"},"processorResponse":{"status":"$processorStatus"$approved}}"""
    }

    private class FakeTransport(
        private val postResponse: String,
        var lookup: String = postResponse,
        private val throwOnPost: Boolean = false,
        private val postStatus: Int = 200
    ) : PoyntHttpTransport {
        var postCalls = 0
        var requestId: String? = null
        var postBody: String? = null
        var lookupUri: URI? = null
        var getCalls = 0
        override fun post(uri: URI, authorization: String, requestId: String, body: String): PoyntHttpResponse {
            postCalls += 1
            this.requestId = requestId
            postBody = body
            if (throwOnPost) error("timeout")
            return PoyntHttpResponse(postStatus, postResponse)
        }
        override fun get(uri: URI, authorization: String, modifiedSince: String?): PoyntHttpResponse {
            getCalls += 1
            lookupUri = uri
            return PoyntHttpResponse(200, lookup)
        }
        override fun productUri(businessId: String, productId: String): URI = error("unused")
        override fun productsUri(businessId: String, offset: Int): URI = error("unused")
        override fun orderUri(businessId: String, orderId: String): URI = error("unused")
        override fun ordersUri(businessId: String): URI = error("unused")
        override fun transactionsByOriginalRequestIdUri(businessId: String, originalRequestId: String): URI =
            URI.create("https://services-ote.poynt.net/businesses/$businessId/transactions?original-request-id=$originalRequestId")
        override fun transactionByIdUri(businessId: String, transactionId: String): URI =
            URI.create("https://services-ote.poynt.net/businesses/$businessId/transactions?transactionIds=$transactionId")
    }
}
