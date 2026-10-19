package com.mynikatech.memgine.component.payment

import com.mynikatech.memgine.exception.BadRequestException
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertFailsWith

class PoyntPaymentBridgeRefundCallbackTest {
    private val valid = """{"referenceId":"PRA_test","status":"PROCESSED","transactions":[{"id":"refund-1","action":"REFUND","status":"REFUNDED","authOnly":false,"amounts":{"transactionAmount":20,"currency":"CAD"},"context":{"businessId":"business-1","storeId":"store-1"},"ignored":{"card":"must-not-retain"}}]}"""

    @Test fun `parses only whitelisted refund callback evidence`() {
        val value = PoyntPaymentBridgeRefundCallbackParser.parse(valid)
        assertEquals("PRA_test", value.referenceId)
        assertEquals("PROCESSED", value.status)
        assertEquals("REFUND", value.usableRefundTransaction()?.action)
        assertEquals("REFUNDED", value.usableRefundTransaction()?.status)
        assertEquals(20L, value.usableRefundTransaction()?.amountMinor)
    }

    @Test fun `does not treat empty or sale transactions as refunds`() {
        assertNull(PoyntPaymentBridgeRefundCallbackParser.parse("""{"referenceId":"PRA_test","status":"PROCESSED","transactions":[]}""").usableRefundTransaction())
        assertNull(PoyntPaymentBridgeRefundCallbackParser.parse(valid.replace("REFUND", "SALE")).usableRefundTransaction())
    }

    @Test fun `rejects malformed payload and ambiguous transaction list`() {
        assertFailsWith<BadRequestException> { PoyntPaymentBridgeRefundCallbackParser.parse("{") }
        assertFailsWith<BadRequestException> { PoyntPaymentBridgeRefundCallbackParser.parse(valid.replace("\"referenceId\":\"PRA_test\"", "\"referenceId\":\"\"")) }
    }
}
