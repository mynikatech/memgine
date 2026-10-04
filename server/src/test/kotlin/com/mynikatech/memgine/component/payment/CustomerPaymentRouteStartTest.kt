package com.mynikatech.memgine.component.payment

import com.mynikatech.memgine.config.PaymentConfig
import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.net.dto.PaymentIntentDto
import java.lang.reflect.Proxy
import org.jdbi.v3.core.Jdbi
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class CustomerPaymentRouteStartTest {
    @Test fun `CUSTOMER Poynt route uses Collect even when global provider is TEST`() {
        val fixture = Fixture("POYNT_COLLECT")
        val result = fixture.service.startAuthenticatedMembershipPayment("ORG-1", "PLAN-1", "USER-1", "KEY-1")
        assertEquals("POYNT_COLLECT", result.providerCode)
        assertEquals(listOf("startCustomerCommerce"), fixture.calls)
        assertEquals(8, fixture.argumentCount)
        assertEquals("ORG-1", fixture.organizationId)
        assertEquals("USER-1", fixture.actorUserId)
    }

    @Test fun `CUSTOMER TEST route remains available in DEV`() {
        val fixture = Fixture("TEST")
        assertEquals("TEST", fixture.service.startAuthenticatedMembershipPayment(
            "ORG-1", "PLAN-1", "USER-1", "KEY-1"
        ).providerCode)
    }

    @Test fun `missing route rejects customer start`() {
        val fixture = Fixture(null)
        assertFailsWith<BadRequestException> {
            fixture.service.startAuthenticatedMembershipPayment("ORG-1", "PLAN-1", "USER-1", "KEY-1")
        }
    }

    @Test fun `ambiguous route rejects customer start`() {
        val fixture = Fixture("AMBIGUOUS")
        assertFailsWith<BadRequestException> {
            fixture.service.startAuthenticatedMembershipPayment("ORG-1", "PLAN-1", "USER-1", "KEY-1")
        }
    }

    @Test fun `another organization cannot use this organization's route`() {
        val fixture = Fixture("POYNT_COLLECT")
        assertFailsWith<BadRequestException> {
            fixture.service.startAuthenticatedMembershipPayment("ORG-2", "PLAN-1", "USER-1", "KEY-1")
        }
        assertEquals("ORG-2", fixture.organizationId)
    }

    private class Fixture(private val resultProvider: String?) {
        val calls = mutableListOf<String>()
        var argumentCount = 0
        var organizationId: String? = null
        var actorUserId: String? = null
        private val sql = Proxy.newProxyInstance(
            PaymentSql::class.java.classLoader, arrayOf(PaymentSql::class.java)
        ) { _, method, args ->
            calls += method.name
            if (method.name != "startCustomerCommerce") error("Unexpected SQL call: ${method.name}")
            argumentCount = args?.size ?: 0
            organizationId = args?.get(2) as String
            actorUserId = args[7] as String
            if (organizationId != "ORG-1" || resultProvider == null || resultProvider == "AMBIGUOUS") {
                throw BadRequestException("Exactly one organization-scoped Customer payment route is required")
            }
            PaymentIntentDto("PAY-1", resultProvider, "PENDING", 89.99, "CAD",
                membershipPlanId = "PLAN-1", customerUserId = "USER-1",
                createdAt = "2026-10-04T00:00:00Z", commerceTransactionId = "CTX-1")
        } as PaymentSql
        private val collect = PoyntCollectPaymentProvider("https://services-ote.poynt.net",
            object : com.mynikatech.memgine.component.commerce.provider.poynt.PoyntHttpTransport {
                override fun get(uri: java.net.URI, authorization: String, modifiedSince: String?) = error("No provider GET")
                override fun post(uri: java.net.URI, authorization: String, requestId: String, body: String) = error("No provider POST")
                override fun productUri(businessId: String, productId: String) = error("No product URI")
                override fun productsUri(businessId: String, offset: Int) = error("No products URI")
                override fun orderUri(businessId: String, orderId: String) = error("No order URI")
                override fun ordersUri(businessId: String) = error("No orders URI")
            }) { error("No OAuth lookup") }
        val service = PaymentService(Jdbi.create("jdbc:postgresql://unused/memgine"), "dev",
            PaymentConfig("TEST", "", "", "", "", "", "", "https://api.sb.moneris.io", "2026-08-14", "", ""),
            sql, collect)
    }
}
