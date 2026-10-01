package com.mynikatech.memgine.component.commerce

import com.mynikatech.memgine.exception.BadRequestException
import kotlin.test.Test
import kotlin.test.assertFailsWith

class CommercePaymentProviderPolicyTest {
    @Test
    fun `TEST route is usable only in permitted non-production environments`() {
        listOf("local", "dev", "development").forEach { environment ->
            CommercePaymentProviderPolicy(environment).requireUsable(
                CommercePaymentProviderRouteRow(routeId = "route", providerCode = "TEST")
            )
        }

        assertFailsWith<BadRequestException> {
            CommercePaymentProviderPolicy("prod").requireUsable(
                CommercePaymentProviderRouteRow(routeId = "route", providerCode = "TEST")
            )
        }
    }

    @Test
    fun `external provider route requires a configured integration`() {
        assertFailsWith<BadRequestException> {
            CommercePaymentProviderPolicy("dev").requireUsable(
                CommercePaymentProviderRouteRow(routeId = "route", providerCode = "POYNT")
            )
        }

        CommercePaymentProviderPolicy("prod").requireUsable(
            CommercePaymentProviderRouteRow(routeId = "route", providerCode = "POYNT", integrationConfigurationId = "integration")
        )
    }
}
