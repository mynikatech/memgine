package com.mynikatech.memgine.component.payment

import com.mynikatech.memgine.config.PaymentConfig
import com.mynikatech.memgine.net.dto.PaymentIntentDto
import com.mynikatech.memgine.net.dto.PaymentStartRequestDto
import org.jdbi.v3.core.Jdbi
import java.lang.reflect.Proxy
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class CounterMembershipPaymentStartTest {
    @Test
    fun `Counter start uses the correlated Commerce payment function and returns its transaction`() {
        val sql = recordingSql(providerCode = "TEST")
        val payment = service("TEST", sql).startCounterMembershipPayment(
            "org", request(), "store", "staff", "customer", "plan", "actor"
        )

        assertEquals("CTX-1", payment.commerceTransactionId)
        assertEquals(listOf("startCounterMembership"), sql.calls)
        assertEquals("challenge:provider", sql.counterIdempotencyKey)
    }

    @Test
    fun `Counter start cannot reach a provider when Commerce payment start fails`() {
        val sql = recordingSql(providerCode = "TEST", returnNullFromCounterStart = true)

        assertFailsWith<com.mynikatech.memgine.exception.ConflictException> {
            service("TEST", sql).startCounterMembershipPayment(
                "org", request(), "store", "staff", "customer", "plan", "actor"
            )
        }
        assertEquals(listOf("startCounterMembership"), sql.calls)
    }

    @Test
    fun `existing provider branches remain reachable without Poynt dispatch`() {
        val testSql = recordingSql(providerCode = "TEST")
        assertEquals("TEST", service("TEST", testSql).startCounterMembershipPayment(
            "org", request(), "store", "staff", "customer", "plan", "actor"
        ).providerCode)

        val monerisSql = recordingSql(providerCode = "MONERIS")
        assertEquals("MONERIS", service("MONERIS", monerisSql).startCounterMembershipPayment(
            "org", request(), "store", "staff", "customer", "plan", "actor"
        ).providerCode)

        val poyntSql = recordingSql(providerCode = "POYNT")
        assertEquals("POYNT", service("TEST", poyntSql).startCounterMembershipPayment(
            "org", request(), "store", "staff", "customer", "plan", "actor"
        ).providerCode)
        assertEquals(listOf("startCounterMembership"), poyntSql.calls)

        val cashSql = recordingSql(providerCode = "CASH")
        assertEquals("CASH", service("TEST", cashSql).startCounterCashPayment("org", request(), "actor").providerCode)
        assertTrue(cashSql.calls.contains("start"))
        assertTrue(cashSql.calls.none { it.contains("Poynt", ignoreCase = true) })
    }

    private fun request() = PaymentStartRequestDto("challenge", "challenge:provider")

    private fun service(providerCode: String, sql: RecordingPaymentSql) = PaymentService(
        Jdbi.create("jdbc:postgresql://unused/memgine"),
        "dev",
        PaymentConfig(
            providerCode = providerCode,
            stripeSecretKey = "sk_test",
            stripeWebhookSecret = "whsec_test",
            webBaseUrl = "https://memgine.test",
            monerisClientId = "client",
            monerisClientSecret = "secret",
            monerisMerchantId = "merchant",
            monerisBaseUrl = "https://api.sb.moneris.io",
            monerisApiVersion = "2026-08-14",
            monerisHostedTokenizationProfileId = "profile",
            monerisHostedTokenizationUrl = "https://esqa.moneris.com/HPPtoken/index.php"
        ),
        sql.proxy
    )

    private class RecordingPaymentSql(
        val providerCode: String,
        private val counterResult: PaymentIntentDto?,
        private val providerReferenceId: String?
    ) {
        val calls = mutableListOf<String>()
        var counterIdempotencyKey: String? = null

        val proxy: PaymentSql = Proxy.newProxyInstance(
            PaymentSql::class.java.classLoader,
            arrayOf(PaymentSql::class.java)
        ) { _, method, arguments ->
            calls += method.name
            when (method.name) {
                "startCounterMembership" -> {
                    counterIdempotencyKey = arguments?.get(9) as String
                    counterResult
                }
                "start" -> payment("CASH")
                else -> null
            }
        } as PaymentSql

        private fun payment(code: String = providerCode) = PaymentIntentDto(
            paymentIntentId = "PAY-1",
            providerCode = code,
            status = "PENDING",
            amount = 10.0,
            currencyCode = "CAD",
            providerReferenceId = providerReferenceId,
            membershipPlanId = "plan",
            customerUserId = "customer",
            createdAt = "2026-10-01T00:00:00Z",
            commerceTransactionId = "CTX-1"
        )
    }

    private fun recordingSql(
        providerCode: String,
        counterResult: PaymentIntentDto? = null,
        returnNullFromCounterStart: Boolean = false,
        providerReferenceId: String? = null
    ): RecordingPaymentSql {
        val result = counterResult ?: PaymentIntentDto(
            paymentIntentId = "PAY-1",
            providerCode = providerCode,
            status = "PENDING",
            amount = 10.0,
            currencyCode = "CAD",
            providerReferenceId = providerReferenceId,
            membershipPlanId = "plan",
            customerUserId = "customer",
            createdAt = "2026-10-01T00:00:00Z",
            commerceTransactionId = "CTX-1"
        )
        return RecordingPaymentSql(
            providerCode,
            if (returnNullFromCounterStart) null else (counterResult ?: result),
            providerReferenceId
        )
    }
}
