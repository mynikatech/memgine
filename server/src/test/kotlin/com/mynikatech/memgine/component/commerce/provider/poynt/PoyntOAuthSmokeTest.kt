
package com.mynikatech.memgine.component.commerce.provider.poynt

import kotlin.test.Test
import kotlin.test.assertTrue

class PoyntOAuthSmokeTest {

    @Test
    fun verifyProductionOAuth() {
        fun required(name: String): String =
            System.getenv(name)?.takeIf { it.isNotBlank() }
                ?: error("Missing environment variable: $name")

        val configuration = PoyntCatalogConfiguration(
            required("POYNT_TEST_INTEGRATION_ID"),
            required("POYNT_TEST_ORGANIZATION_ID"),
            required("POYNT_TEST_APPLICATION_ID"),
            required("POYNT_TEST_BUSINESS_ID"),
            null,
            required("POYNT_TEST_SECRET_REFERENCE"),
            "CAD",
            null
        )

        val service = PoyntTokenService(
            credentials = AwsSecretsManagerPoyntCredentialResolver(
                required("POYNT_TEST_AWS_REGION")
            ),
            transport = PoyntCloudTokenTransport(
                baseUrl = "https://services.poynt.net",
                apiVersion = "1.2"
            ),
            audience = "https://services.poynt.net"
        )

        val token = service.token(configuration)

        assertTrue(token.value.isNotBlank())

        println("POYNT OAUTH SMOKE TEST: SUCCESS")
        println("Production OAuth access token obtained")
        println("No payment or card operation performed")
    }
}
