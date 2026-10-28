package com.mynikatech.memgine.component.commerce

import com.mynikatech.memgine.component.commerce.provider.poynt.PoyntCredential
import com.mynikatech.memgine.component.commerce.provider.poynt.PoyntCredentialResolver
import com.mynikatech.memgine.component.commerce.provider.poynt.PoyntHttpResponse
import com.mynikatech.memgine.component.commerce.provider.poynt.PoyntHttpTransport
import com.mynikatech.memgine.component.commerce.provider.poynt.PoyntTokenResponse
import com.mynikatech.memgine.component.commerce.provider.poynt.PoyntTokenService
import com.mynikatech.memgine.component.commerce.provider.poynt.PoyntTokenTransport
import com.mynikatech.memgine.exception.BadRequestException
import java.lang.reflect.Proxy
import java.net.URI
import java.security.KeyPairGenerator
import java.time.Instant
import java.util.Base64
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertFailsWith

class PlatformPoyntApplePayRegistrationDiagnosticTest {
    private val privateKeyPem = KeyPairGenerator.getInstance("RSA").apply {
        initialize(2048)
    }.generateKeyPair().private.encoded.let {
        "-----BEGIN PRIVATE KEY-----\n" +
            Base64.getMimeEncoder(64, "\n".toByteArray()).encodeToString(it) +
            "\n-----END PRIVATE KEY-----"
    }

    @Test
    fun `200 returns only recognized registration and domain fields`() {
        val transport = FakeTransport(
            PoyntHttpResponse(
                200,
                """{"registered":true,"registeredDomains":["memgine-dev.mynikatech.in","example.test"],"token":"ignored"}"""
            )
        )

        val result = service(transport).applePayRegistrationDiagnostic("integration-1", "platform-user")

        assertEquals(200, result.httpStatus)
        assertEquals(true, result.registered)
        assertEquals(listOf("memgine-dev.mynikatech.in", "example.test"), result.registeredDomains)
        assertEquals(true, result.memgineDevDomainRegistered)
        assertEquals(
            "https://configured-poynt.example/businesses/business-1/apple-pay/registration",
            transport.uri.toString()
        )
        assertEquals(0, transport.posts)
    }

    @Test
    fun `401 invalidates token and retries the read-only request once`() {
        val transport = FakeTransport(
            PoyntHttpResponse(401, "{}"),
            PoyntHttpResponse(200, """{"registrationStatus":"REGISTERED"}""")
        )
        val tokenTransport = FakeTokenTransport()

        val result = service(transport, tokenTransport).applePayRegistrationDiagnostic(
            "integration-1",
            "platform-user"
        )

        assertEquals(200, result.httpStatus)
        assertEquals(true, result.registered)
        assertEquals(2, transport.gets)
        assertEquals(2, tokenTransport.calls)
        assertEquals(0, transport.posts)
    }

    @Test
    fun `403 is reported without provider response details`() {
        val result = service(FakeTransport(PoyntHttpResponse(403, """{"error":"credential detail"}""")))
            .applePayRegistrationDiagnostic("integration-1", "platform-user")

        assertEquals(403, result.httpStatus)
        assertNull(result.registered)
        assertNull(result.registeredDomains)
        assertNull(result.memgineDevDomainRegistered)
    }

    @Test
    fun `404 is inconclusive unless the provider explicitly reports unregistered`() {
        val inconclusive = service(FakeTransport(PoyntHttpResponse(404, "{}")))
            .applePayRegistrationDiagnostic("integration-1", "platform-user")
        assertEquals(404, inconclusive.httpStatus)
        assertNull(inconclusive.registered)
        assertNull(inconclusive.memgineDevDomainRegistered)

        val explicit = service(FakeTransport(PoyntHttpResponse(404, """{"registered":false}""")))
            .applePayRegistrationDiagnostic("integration-1", "platform-user")
        assertEquals(404, explicit.httpStatus)
        assertEquals(false, explicit.registered)
    }

    @Test
    fun `unexpected response formats are inconclusive`() {
        val result = service(FakeTransport(PoyntHttpResponse(200, """{"state":"ready","host":"memgine-dev.mynikatech.in"}""")))
            .applePayRegistrationDiagnostic("integration-1", "platform-user")

        assertEquals(200, result.httpStatus)
        assertNull(result.registered)
        assertNull(result.registeredDomains)
        assertNull(result.memgineDevDomainRegistered)
    }

    @Test
    fun `5xx failure is reported without assuming a registration state`() {
        val result = service(FakeTransport(PoyntHttpResponse(503, """{"registered":true}""")))
            .applePayRegistrationDiagnostic("integration-1", "platform-user")

        assertEquals(503, result.httpStatus)
        assertNull(result.registered)
        assertNull(result.registeredDomains)
        assertNull(result.memgineDevDomainRegistered)
    }

    @Test
    fun `domain association file returns the exact successful provider body`() {
        val transport = FakeTransport(PoyntHttpResponse(200, "association-file-content\n"))

        val result = service(transport).applePayDomainAssociationFile("integration-1", "platform-user")

        assertEquals("association-file-content\n", result)
        assertEquals(
            "https://configured-poynt.example/businesses/business-1/apple-pay/domain-association-file",
            transport.uri.toString()
        )
        assertEquals(0, transport.posts)
    }

    @Test
    fun `domain association file retries once after 401`() {
        val transport = FakeTransport(PoyntHttpResponse(401, "ignored"), PoyntHttpResponse(200, "file"))
        val tokenTransport = FakeTokenTransport()

        assertEquals("file", service(transport, tokenTransport).applePayDomainAssociationFile("integration-1", "platform-user"))
        assertEquals(2, transport.gets)
        assertEquals(2, tokenTransport.calls)
    }

    @Test
    fun `domain association file provider errors are sanitized`() {
        listOf(403, 404, 500).forEach { status ->
            val error = assertFailsWith<BadRequestException> {
                service(FakeTransport(PoyntHttpResponse(status, "provider-sensitive-body")))
                    .applePayDomainAssociationFile("integration-1", "platform-user")
            }
            assertEquals("Poynt Apple Pay domain association request failed (HTTP $status)", error.message)
        }
    }

    @Test
    fun `domain association diagnostic is disabled unless explicitly enabled`() {
        assertFailsWith<BadRequestException> {
            service(FakeTransport(PoyntHttpResponse(200, "file")), diagnosticsEnabled = false)
                .applePayDomainAssociationFile("integration-1", "platform-user")
        }
    }

    @Test
    fun `unauthorized integration cannot reach the provider`() {
        val transport = FakeTransport(PoyntHttpResponse(200, "file"))
        assertFailsWith<BadRequestException> {
            service(transport, authorized = false)
                .applePayDomainAssociationFile("integration-1", "non-platform-user")
        }
        assertEquals(0, transport.gets)
    }

    private fun service(
        transport: FakeTransport,
        tokenTransport: FakeTokenTransport = FakeTokenTransport(),
        diagnosticsEnabled: Boolean = true,
        authorized: Boolean = true
    ): PlatformPoyntPaymentService = PlatformPoyntPaymentService(
        sql = sql(authorized),
        credentials = PoyntCredentialResolver { PoyntCredential(privateKeyPem) },
        tokens = PoyntTokenService(
            PoyntCredentialResolver { PoyntCredential(privateKeyPem) },
            tokenTransport,
            "https://configured-poynt.example",
            now = { Instant.ofEpochSecond(1_000) }
        ),
        transport = transport,
        environment = "dev",
        diagnosticsEnabled = diagnosticsEnabled,
        checkoutUrl = "https://memgine-dev.mynikatech.in"
    )

    @Suppress("UNCHECKED_CAST")
    private fun sql(authorized: Boolean): PlatformPoyntPaymentSql = Proxy.newProxyInstance(
        javaClass.classLoader,
        arrayOf(PlatformPoyntPaymentSql::class.java)
    ) { _, method, _ ->
        when (method.name) {
            "get" -> if (authorized) PlatformPoyntPaymentRow(
                organizationId = "organization-1",
                integrationConfigurationId = "integration-1",
                applicationId = "application-1",
                providerBusinessId = "business-1",
                merchantCurrencyCode = "CAD"
            ) else null
            "credentialReference" -> "credential-reference"
            else -> error("Unexpected SQL call: ${method.name}")
        }
    } as PlatformPoyntPaymentSql

    private class FakeTokenTransport : PoyntTokenTransport {
        var calls = 0

        override fun requestToken(assertion: String): PoyntTokenResponse =
            PoyntTokenResponse("token-${++calls}", "Bearer", 3600)
    }

    private class FakeTransport(vararg responses: PoyntHttpResponse) : PoyntHttpTransport {
        private val responses = responses.iterator()
        var gets = 0
        var posts = 0
        var uri: URI = URI.create("https://configured-poynt.example/unset")

        override fun get(uri: URI, authorization: String, modifiedSince: String?): PoyntHttpResponse {
            this.uri = uri
            gets += 1
            return responses.next()
        }

        override fun post(uri: URI, authorization: String, requestId: String, body: String): PoyntHttpResponse {
            posts += 1
            error("Apple Pay registration diagnostic must not POST")
        }

        override fun productUri(businessId: String, productId: String): URI = error("Unexpected product URI")
        override fun productsUri(businessId: String, offset: Int): URI = error("Unexpected products URI")
        override fun orderUri(businessId: String, orderId: String): URI = error("Unexpected order URI")
        override fun ordersUri(businessId: String): URI = error("Unexpected orders URI")
        override fun applePayRegistrationUri(businessId: String): URI =
            URI.create("https://configured-poynt.example/businesses/$businessId/apple-pay/registration")
        override fun applePayDomainAssociationFileUri(businessId: String): URI =
            URI.create("https://configured-poynt.example/businesses/$businessId/apple-pay/domain-association-file")
    }
}
