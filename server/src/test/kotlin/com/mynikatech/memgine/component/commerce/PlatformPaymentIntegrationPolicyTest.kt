package com.mynikatech.memgine.component.commerce

import com.mynikatech.memgine.exception.BadRequestException
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class PlatformPaymentIntegrationPolicyTest {
    @Test
    fun `supported providers are normalized for POS`() {
        val policy = PlatformPaymentIntegrationPolicy()

        assertEquals("POYNT", policy.requireSupported("integration-type-pos", "poynt"))
    }

    @Test
    fun `TEST is built in and cannot be created as an integration shell`() {
        assertFailsWith<BadRequestException> {
            PlatformPaymentIntegrationPolicy()
                .requireSupported("integration-type-pos", "TEST")
        }
    }

    @Test
    fun `unsupported provider or integration type is rejected`() {
        val policy = PlatformPaymentIntegrationPolicy()

        assertFailsWith<BadRequestException> {
            policy.requireSupported("integration-type-api", "POYNT")
        }
        assertFailsWith<BadRequestException> {
            policy.requireSupported("integration-type-pos", "STRIPE")
        }
    }
}
