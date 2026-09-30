package com.mynikatech.memgine.component.commerce

import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.exception.ForbiddenException
import java.io.ByteArrayOutputStream
import java.util.zip.GZIPOutputStream
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse

class PoyntPaymentBridgeCallbackTest {
    private val captured = """{"referenceId":"ref-1","status":"PROCESSED","ignored":{"fundingSource":"never-retained"},"transactions":[{"id":"txn-1","status":"CAPTURED","authOnly":false,"amounts":{"transactionAmount":600,"orderAmount":600,"currency":"CAD","tipAmount":0},"context":{"businessId":"business","storeId":"store"},"references":[{"type":"CUSTOM","id":"ref-1","customType":"referenceId"}]}]}"""

    @Test fun `missing and wrong callback authentication are rejected`() {
        assertFailsWith<ForbiddenException> { PoyntPaymentBridgeCallbackSecurity.authenticate(null, "secret") }
        assertFailsWith<ForbiddenException> { PoyntPaymentBridgeCallbackSecurity.authenticate("wrong", "secret") }
    }
    @Test fun `correct callback authentication is accepted`() = PoyntPaymentBridgeCallbackSecurity.authenticate("secret", "secret")
    @Test fun `uncompressed and gzip callback bodies are accepted`() {
        assertEquals(captured, PoyntPaymentBridgeCallbackSecurity.decode(captured.encodeToByteArray(), null))
        val compressed = ByteArrayOutputStream().also { out -> GZIPOutputStream(out).use { it.write(captured.encodeToByteArray()) } }.toByteArray()
        assertEquals(captured, PoyntPaymentBridgeCallbackSecurity.decode(compressed, "gzip"))
    }
    @Test fun `unsupported and oversized callback encodings are rejected`() {
        assertFailsWith<BadRequestException> { PoyntPaymentBridgeCallbackSecurity.decode(byteArrayOf(), "br") }
        assertFailsWith<BadRequestException> { PoyntPaymentBridgeCallbackSecurity.decode(ByteArray(MAX_POYNT_CALLBACK_BYTES + 1), null) }
    }
    @Test fun `unknown JSON is ignored and captured sale is parsed`() {
        val callback = PoyntPaymentBridgeCallbackParser.parse(captured)
        assertEquals("ref-1", callback.referenceId)
        assertEquals("PROCESSED", callback.status)
        assertEquals("CAPTURED", callback.usableTransaction()!!.status)
        assertEquals(600, callback.usableTransaction()!!.amountMinor)
        assertEquals("CAD", callback.usableTransaction()!!.currencyCode)
    }
    @Test fun `malformed or contradictory callback is rejected`() {
        assertFailsWith<BadRequestException> { PoyntPaymentBridgeCallbackParser.parse("{") }
        assertFailsWith<BadRequestException> { PoyntPaymentBridgeCallbackParser.parse(captured.replace("\"ref-1\",\"customType\"", "\"other\",\"customType\"")) }
    }
    @Test fun `processed alone and authorized are not successful sales`() {
        val noTransactions = PoyntPaymentBridgeCallbackParser.parse("""{"referenceId":"ref-1","status":"PROCESSED","transactions":[]}""")
        assertEquals(null, noTransactions.usableTransaction())
        val authorized = PoyntPaymentBridgeCallbackParser.parse(captured.replace("CAPTURED", "AUTHORIZED"))
        assertFalse(authorized.usableTransaction()!!.status == "CAPTURED")
    }
    @Test fun `zero or multiple usable transactions are not accepted`() {
        val zero = PoyntPaymentBridgeCallbackParser.parse("""{"referenceId":"ref-1","status":"PROCESSED","transactions":[{"status":"CAPTURED"}]}""")
        assertEquals(null, zero.usableTransaction())
       val multiple = PoyntPaymentBridgeCallbackParser.parse(
            """
            {
            "referenceId": "ref-1",
            "status": "PROCESSED",
            "transactions": [
                {
                "id": "txn-1",
                "status": "CAPTURED",
                "authOnly": false,
                "amounts": {
                    "transactionAmount": 600,
                    "currency": "CAD"
                },
                "context": {
                    "businessId": "business",
                    "storeId": "store"
                },
                "references": [
                    {
                    "type": "CUSTOM",
                    "id": "ref-1",
                    "customType": "referenceId"
                    }
                ]
                },
                {
                "id": "txn-2",
                "status": "CAPTURED",
                "authOnly": false,
                "amounts": {
                    "transactionAmount": 600,
                    "currency": "CAD"
                },
                "context": {
                    "businessId": "business",
                    "storeId": "store"
                },
                "references": [
                    {
                    "type": "CUSTOM",
                    "id": "ref-1",
                    "customType": "referenceId"
                    }
                ]
                }
            ]
            }
            """.trimIndent()
        )

        assertEquals(null, multiple.usableTransaction())
    }
    @Test fun `auth only transaction remains distinguishable for lifecycle rejection`() {
        assertEquals(true, PoyntPaymentBridgeCallbackParser.parse(captured.replace("\"authOnly\":false", "\"authOnly\":true")).usableTransaction()!!.authOnly)
    }
}
