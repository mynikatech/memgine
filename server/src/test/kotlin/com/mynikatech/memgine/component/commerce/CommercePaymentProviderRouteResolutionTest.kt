package com.mynikatech.memgine.component.commerce

import java.lang.reflect.Proxy
import kotlin.test.Test
import kotlin.test.assertEquals

class CommercePaymentProviderRouteResolutionTest {
    @Test
    fun `resolution returns the configured provider route without a UI provider choice`() {
        val sql = Proxy.newProxyInstance(
            CommerceSql::class.java.classLoader,
            arrayOf(CommerceSql::class.java)
        ) { _, method, args ->
            when (method.name) {
                "resolvePaymentProviderRoute" -> {
                    assertEquals("org", args!![0])
                    assertEquals("store", args[1])
                    assertEquals("COUNTER", args[2])
                    CommercePaymentProviderRouteRow(
                        routeId = "route",
                        providerCode = "POYNT",
                        integrationConfigurationId = "integration"
                    )
                }
                else -> throw UnsupportedOperationException(method.name)
            }
        } as CommerceSql

        val route = CommerceService(
            sql,
            paymentProviderPolicy = CommercePaymentProviderPolicy("dev")
        ).resolvePaymentProviderRoute("org", "store", "counter", "actor")

        assertEquals("route", route.routeId)
        assertEquals("POYNT", route.providerCode)
        assertEquals("integration", route.integrationConfigurationId)
    }
}
