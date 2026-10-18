package com.mynikatech.memgine.security

import com.mynikatech.memgine.exception.ForbiddenException
import com.mynikatech.memgine.exception.UnauthorizedException
import io.ktor.http.HttpMethod
import java.lang.reflect.InvocationTargetException
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class AuthenticationGatePaymentRouteTest {
    private val customer = AuthenticatedPrincipal(
        userId = "customer-1",
        displayName = "Customer",
        expiresAt = "2026-12-31T00:00:00Z",
        access = emptyList()
    )

    @Test
    fun `authenticated customer may reach exact Collect configuration route`() {
        protectOrganizationPath(
            customer,
            "/api/v1/organizations/organization-1/payments/payment-1/poynt-collect/config",
            HttpMethod.Get
        )
    }

    @Test
    fun `unauthenticated Collect configuration request is rejected`() {
        val failure = assertFailsWith<InvocationTargetException> {
            protectOrganizationPath(
                null,
                "/api/v1/organizations/organization-1/payments/payment-1/poynt-collect/config",
                HttpMethod.Get
            )
        }
        assertEquals(UnauthorizedException::class, failure.targetException::class)
    }

    @Test
    fun `other and malformed payment routes remain organization-admin protected`() {
        listOf(
            "/api/v1/organizations/organization-1/payments/payment-1/poynt-collect/config/extra",
            "/api/v1/organizations/organization-1/payments/payment-1/poynt-collect/other",
            "/api/v1/organizations/organization-1/payments/payment-1/refund"
        ).forEach { path ->
            val failure = assertFailsWith<InvocationTargetException> {
                protectOrganizationPath(customer, path, HttpMethod.Get)
            }
            assertEquals(ForbiddenException::class, failure.targetException::class)
        }
    }

    @Test
    fun `existing customer-owned payment reads remain admitted`() {
        listOf(
            "/api/v1/organizations/organization-1/payments/payment-1",
            "/api/v1/organizations/organization-1/payments/payment-1/financial-exception"
        ).forEach { path -> protectOrganizationPath(customer, path, HttpMethod.Get) }
    }

    private fun protectOrganizationPath(
        principal: AuthenticatedPrincipal?,
        path: String,
        method: HttpMethod
    ) {
        val methodReference = Class.forName(
            "com.mynikatech.memgine.security.AuthenticationGateKt"
        ).getDeclaredMethod(
            "protectOrganizationPath",
            AuthenticatedPrincipal::class.java,
            String::class.java,
            HttpMethod::class.java
        )
        methodReference.isAccessible = true
        methodReference.invoke(null, principal, path, method)
    }
}
