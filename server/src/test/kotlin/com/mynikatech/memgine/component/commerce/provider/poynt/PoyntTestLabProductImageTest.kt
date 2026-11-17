
package com.mynikatech.memgine.component.commerce.provider.poynt

import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlinx.serialization.json.*

class PoyntTestLabProductImageTest {

    private val baseUrl = "https://services.poynt.net"

    // Fixed Test Lab configuration.
    // No production configuration or environment overrides.

    private val applicationId =
        "urn:aid:fb9d62bd-12ab-4520-bf9e-54617622ed5f"

    private val businessId =
        "08ecfebe-ad09-4afa-9974-81deb66b131e"

    private val storeId =
        "8ecb77f6-9197-4e61-88e9-950ab428f8a7"

    private val secretReference =
        "memgine/dev/poynt-dev/cloud-app"

    private val productId =
        "70ed9f7e-1e09-4008-8d05-29bcfd413a52"

    private val transport =
        PoyntCloudHttpTransport(baseUrl, "1.2")

    private val httpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(10))
        .build()

    private val productUri =
        transport.productUri(businessId, productId)

    private fun authorization(): String {

        val config = PoyntCatalogConfiguration(
            integrationConfigurationId =
                "test-lab-product-image-diagnostic",
            organizationId =
                "test-lab-product-image-diagnostic",
            applicationId = applicationId,
            businessId = businessId,
            providerStoreId = storeId,
            secretReference = secretReference,
            merchantCurrencyCode = "CAD",
            lastIncrementalSyncAt = null
        )

        val token = PoyntTokenService(
            credentials =
                AwsSecretsManagerPoyntCredentialResolver(
                    "ca-central-1"
                ),
            transport =
                PoyntCloudTokenTransport(baseUrl, "1.2"),
            audience = baseUrl
        ).token(config)

        return "${token.tokenType} ${token.value}"
    }

    private fun getProduct(auth: String): JsonObject {

        val response = transport.get(productUri, auth)

        println("Product GET HTTP: ${response.statusCode}")

        assertEquals(
            200,
            response.statusCode,
            "Product GET failed"
        )

        val product =
            Json.parseToJsonElement(response.body).jsonObject

        // Verify the identity before allowing any update.

        assertEquals(
            businessId,
            product["businessId"]?.jsonPrimitive?.content
        )

        assertEquals(
            productId,
            product["id"]?.jsonPrimitive?.content
        )

        assertEquals(
            "Coffee",
            product["name"]?.jsonPrimitive?.content
        )

        return product
    }

    private fun patchImage(
        auth: String,
        operation: String,
        value: JsonElement? = null
    ): Int {

        val payload = buildJsonArray {
            add(buildJsonObject {
                put("op", operation)
                put("path", "/imageUrl")

                if (value != null) {
                    put("value", value)
                }
            })
        }

        val request = HttpRequest.newBuilder(productUri)
            .timeout(Duration.ofSeconds(30))
            .header("Authorization", auth)
            .header("Api-Version", "1.2")
            .header(
                "Poynt-Request-Id",
                UUID.randomUUID().toString()
            )
            .header("Content-Type", "application/json")
            .method(
                "PATCH",
                HttpRequest.BodyPublishers.ofString(
                    payload.toString()
                )
            )
            .build()

        val response = httpClient.send(
            request,
            HttpResponse.BodyHandlers.ofString()
        )

        println("Product PATCH HTTP: ${response.statusCode()}")

        if (response.statusCode() !in 200..299) {

            val error = runCatching {
                Json.parseToJsonElement(
                    response.body()
                ).jsonObject
            }.getOrNull()

            println(
                "Poynt error code: ${error?.get("code")}"
            )
            println(
                "Poynt error message: ${error?.get("message")}"
            )
        }

        return response.statusCode()
    }

    @Test
    fun verifyProductImageSupport() {

        if (
            System.getenv("POYNT_TEST_LAB_IMAGE_WRITE_TEST")
                != "true"
        ) {
            println("Product image diagnostic: SKIPPED")
            return
        }

        val imageUrl =
            System.getenv("POYNT_TEST_PRODUCT_IMAGE_URL")
                ?.trim()
                ?: error("Test image URL is required")

        val imageUri = URI.create(imageUrl)

        require(
            imageUri.scheme == "https" &&
                imageUri.host != null &&
                imageUri.userInfo == null &&
                imageUri.query == null
        ) {
            "Use a public HTTPS image URL without credentials"
        }

        val auth = authorization()

        println("========== BEFORE UPDATE ==========")

        val before = getProduct(auth)

        val originalImage = before["imageUrl"]

        val originalShortCode = before["shortCode"]

        val testImage = buildJsonArray {
            add(JsonPrimitive(imageUrl))
        }

        println("Product: ${before["name"]}")
        println("Original imageUrl: $originalImage")
        println("Original shortCode: $originalShortCode")

        var updateAttempted = false

        try {

            println("========== ASSIGN PRODUCT IMAGE ==========")

            updateAttempted = true

            val status = patchImage(
                auth,
                "add",
                testImage
            )

            assertTrue(
                status in 200..299,
                "Poynt rejected imageUrl update: HTTP $status"
            )

            println("========== VERIFY PRODUCT IMAGE ==========")

            val after = getProduct(auth)

            println("Returned imageUrl: ${after["imageUrl"]}")
            println("Returned shortCode: ${after["shortCode"]}")

            assertEquals(
                testImage,
                after["imageUrl"],
                "Poynt did not persist imageUrl"
            )

            assertEquals(
                originalShortCode,
                after["shortCode"],
                "Existing product icon changed unexpectedly"
            )

            println("PRODUCT IMAGE SUPPORT: VERIFIED")

        } finally {

            if (updateAttempted) {

                println("========== RESTORE ORIGINAL IMAGE ==========")

                val current = getProduct(auth)

                if (current["imageUrl"] == testImage &&
                    originalImage != testImage
                ) {

                    val status = if (originalImage == null) {
                        patchImage(auth, "remove")
                    } else {
                        patchImage(
                            auth,
                            "add",
                            originalImage
                        )
                    }

                    assertTrue(
                        status in 200..299,
                        "Original image restoration failed"
                    )

                } else if (
                    current["imageUrl"] != originalImage
                ) {
                    error(
                        "Unexpected image state. " +
                        "Manual Test Lab review required."
                    )
                }

                val restored = getProduct(auth)

                assertEquals(
                    originalImage,
                    restored["imageUrl"],
                    "Original image state was not restored"
                )

                println("ORIGINAL IMAGE STATE RESTORED")
            }
        }
    }
}
