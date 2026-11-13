package com.mynikatech.memgine.component.commerce

import com.mynikatech.memgine.component.commerce.provider.poynt.PoyntCredential
import com.mynikatech.memgine.component.commerce.provider.poynt.PoyntCredentialResolver
import com.mynikatech.memgine.component.commerce.provider.poynt.PoyntHttpBinaryResponse
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
import kotlin.test.assertFailsWith

class PlatformPoyntApplePayAdministrationTest {
    @Test
    fun `PROD configuration is accessible when diagnostics are disabled`() {
        val service = fixture(environment = "prod", diagnosticsEnabled = false)

        val configuration = service.service.applePayConfiguration("integration-1", "platform-user")

        assertEquals("integration-1", configuration.integrationConfigurationId)
        assertEquals("NOT_REGISTERED", configuration.readiness.status)
    }

    @Test
    fun `PROD readiness is accessible and returns computed state when diagnostics are disabled`() {
        val fixture = fixture(environment = "prod", diagnosticsEnabled = false)

        val readiness = fixture.service.applePayReadiness("integration-1", "platform-user")

        assertEquals("NOT_REGISTERED", readiness.status)
        assertEquals(false, readiness.configuredDomainRegistered)
    }

    @Test
    fun `DEV configuration and readiness remain available`() {
        val fixture = fixture(environment = "dev", diagnosticsEnabled = false)

        assertEquals("NOT_REGISTERED", fixture.service.applePayConfiguration("integration-1", "platform-user").readiness.status)
        assertEquals("NOT_REGISTERED", fixture.service.applePayReadiness("integration-1", "platform-user").status)
    }

    @Test
    fun `PROD diagnostic remains blocked even when diagnostics flag is enabled`() {
        val fixture = fixture(environment = "prod", diagnosticsEnabled = true)

        assertFailsWith<BadRequestException> {
            fixture.service.applePayRegistrationDiagnostic("integration-1", "platform-user")
        }
        assertEquals(0, fixture.transport.getCalls)
    }

    @Test
    fun `registration flag rejects before calling Poynt`() {
        val fixture = fixture(applePayRegistrationEnabled = false)

        assertFailsWith<BadRequestException> {
            fixture.service.registerApplePayDomain("integration-1", true, "platform-user")
        }
        assertEquals(0, fixture.transport.postCalls)
    }

    @Test
    fun `registration requires explicit confirmation before calling Poynt`() {
        val fixture = fixture(applePayRegistrationEnabled = true)

        assertFailsWith<BadRequestException> {
            fixture.service.registerApplePayDomain("integration-1", false, "platform-user")
        }
        assertEquals(0, fixture.transport.postCalls)
    }

    @Test
    fun `capability cannot be enabled until readiness is READY`() {
        val fixture = fixture()

        assertFailsWith<BadRequestException> {
            fixture.service.setApplePayCapability("integration-1", true, "platform-user")
        }
        assertEquals(0, fixture.sql.capabilityWrites)
    }

    @Test
    fun `unauthorized Platform Admin operation cannot reach Poynt`() {
        val fixture = fixture(authorized = false)

        assertFailsWith<BadRequestException> {
            fixture.service.applePayConfiguration("integration-1", "customer-user")
        }
        assertEquals(0, fixture.transport.getCalls)
    }

    private fun fixture(
        environment: String = "dev",
        diagnosticsEnabled: Boolean = false,
        applePayRegistrationEnabled: Boolean = false,
        authorized: Boolean = true
    ): Fixture {
        val transport = FakeTransport()
        val sql = FakeSql(authorized)
        val service = PlatformPoyntPaymentService(
            sql = sql.proxy(),
            credentials = PoyntCredentialResolver { PoyntCredential(privateKeyPem) },
            tokens = PoyntTokenService(
                PoyntCredentialResolver { PoyntCredential(privateKeyPem) },
                FakeTokenTransport(),
                "https://poynt.example",
                now = { Instant.ofEpochSecond(1_000) }
            ),
            transport = transport,
            environment = environment,
            diagnosticsEnabled = diagnosticsEnabled,
            applePayRegistrationEnabled = applePayRegistrationEnabled,
            checkoutUrl = "https://checkout.example",
            associationInstallPath = "/not-used-by-test",
            associationVerifier = object : ApplePayAssociationVerifier {
                override fun verify(checkoutUrl: String, installedArtifactPath: String) =
                    ApplePayAssociationEvidence("ASSOCIATION_PUBLIC_VERIFIED", hash(transport.associationBytes), hash(transport.associationBytes))
            },
            providerEnvironment = "ote"
        )
        return Fixture(service, transport, sql)
    }

    private class Fixture(
        val service: PlatformPoyntPaymentService,
        val transport: FakeTransport,
        val sql: FakeSql
    )

    private class FakeSql(private val authorized: Boolean) {
        var capabilityWrites = 0

        @Suppress("UNCHECKED_CAST")
        fun proxy(): PlatformPoyntPaymentSql = Proxy.newProxyInstance(
            javaClass.classLoader,
            arrayOf(PlatformPoyntPaymentSql::class.java)
        ) { _, method, _ ->
            val row = PlatformPoyntPaymentRow(
                organizationId = "organization-1",
                organizationName = "Example Merchant",
                integrationConfigurationId = "integration-1",
                applicationId = "application-1",
                providerBusinessId = "business-1",
                merchantCurrencyCode = "CAD"
            )
            when (method.name) {
                "get" -> if (authorized) row else null
                "list" -> if (authorized) listOf(row) else emptyList<PlatformPoyntPaymentRow>()
                "credentialReference" -> "credential-reference"
                "findApplePayArtifact", "getApplePayArtifact", "applePayRegistrationState" -> null
                "applePayCapabilityEnabled" -> false
                "setApplePayCapability" -> { capabilityWrites += 1; true }
                "recordApplePayRegistration", "recordApplePayHosting", "approveApplePayArtifact" -> true
                else -> error("Unexpected SQL call: ${method.name}")
            }
        } as PlatformPoyntPaymentSql
    }

    private class FakeTokenTransport : PoyntTokenTransport {
        override fun requestToken(assertion: String) = PoyntTokenResponse("token", "Bearer", 3600)
    }

    private class FakeTransport : PoyntHttpTransport {
        var getCalls = 0
        var postCalls = 0
        val associationBytes = "association-file".toByteArray()

        override fun get(uri: URI, authorization: String, modifiedSince: String?) =
            PoyntHttpResponse(200, "{\"registeredDomains\":[]}").also { getCalls += 1 }

        override fun getBytes(uri: URI, authorization: String) =
            PoyntHttpBinaryResponse(200, associationBytes).also { getCalls += 1 }

        override fun post(uri: URI, authorization: String, requestId: String, body: String): PoyntHttpResponse {
            postCalls += 1
            return PoyntHttpResponse(200, "{}")
        }

        override fun productUri(businessId: String, productId: String): URI = error("Unexpected")
        override fun productsUri(businessId: String, offset: Int): URI = error("Unexpected")
        override fun orderUri(businessId: String, orderId: String): URI = error("Unexpected")
        override fun ordersUri(businessId: String): URI = error("Unexpected")
        override fun applePayRegistrationUri(businessId: String): URI = URI.create("https://poynt.example/registration")
        override fun applePayDomainAssociationFileUri(businessId: String): URI = URI.create("https://poynt.example/association")
    }

    private val privateKeyPem: String = KeyPairGenerator.getInstance("RSA").apply { initialize(2048) }
        .generateKeyPair().private.encoded.let {
            "-----BEGIN PRIVATE KEY-----\n" + Base64.getMimeEncoder(64, "\n".toByteArray()).encodeToString(it) + "\n-----END PRIVATE KEY-----"
        }

    private fun hash(bytes: ByteArray): String = java.security.MessageDigest.getInstance("SHA-256")
        .digest(bytes).joinToString("") { "%02x".format(it) }
}
