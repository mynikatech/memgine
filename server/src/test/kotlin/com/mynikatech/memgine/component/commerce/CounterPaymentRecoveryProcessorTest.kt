package com.mynikatech.memgine.component.commerce

import java.lang.reflect.Proxy
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * Focused no-provider test: overdue detection calls one SQL scanner only.  The
 * scanner itself has no provider client and therefore cannot post, capture,
 * refund, cancel, or start another terminal payment.
 */
class CounterPaymentRecoveryProcessorTest {
    @Test
    fun `overdue scan is bounded and delegates only to the persisted scanner`() {
        var calls = 0
        var receivedLimit = 0
        var receivedGrace = 0
        val sql = Proxy.newProxyInstance(
            CommerceFinancialExceptionSql::class.java.classLoader,
            arrayOf(CommerceFinancialExceptionSql::class.java)
        ) { _, method, args ->
            when (method.name) {
                "scanOverdueRemoteTerminalAttempts" -> {
                    calls++
                    receivedLimit = args!![0] as Int
                    receivedGrace = args[1] as Int
                    1
                }
                else -> throw UnsupportedOperationException(method.name)
            }
        } as CommerceFinancialExceptionSql

        assertEquals(1, CounterPaymentRecoveryProcessor(sql).runOnce(limit = 500, graceSeconds = 1))
        assertEquals(1, calls)
        assertEquals(100, receivedLimit)
        assertEquals(60, receivedGrace)
    }
}
