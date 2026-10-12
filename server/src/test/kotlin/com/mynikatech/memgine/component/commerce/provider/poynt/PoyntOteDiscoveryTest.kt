package com.mynikatech.memgine.component.commerce.provider.poynt

import java.net.URI
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

class PoyntOteDiscoveryTest {

    // Poynt production-hosted Test Lab, not the separate OTE environment.
    private val poyntBaseUrl = "https://services.poynt.net"

    private val applicationId =
        "urn:aid:fb9d62bd-12ab-4520-bf9e-54617622ed5f"

    private val businessId =
        "08ecfebe-ad09-4afa-9974-81deb66b131e"

    private val expectedStoreId =
        "8ecb77f6-9197-4e61-88e9-950ab428f8a7"

    // Separate test credential. Do not use the working Poynt secret.
    private val secretReference =
        "memgine/dev/poynt-dev/cloud-app"

    @Test
    fun discoverOteBusiness() {
        // Prevent execution during normal test runs and CI.
        if (System.getenv("POYNT_OTE_DISCOVERY") != "true") {
            println("Poynt Test Lab verification: SKIPPED")
            return
        }

        val config = PoyntCatalogConfiguration(
            "test-lab-verification",
            "test-lab-verification",
            applicationId,
            "",
            null,
            secretReference,
            "CAD",
            null
        )

        val credentialResolver =
            AwsSecretsManagerPoyntCredentialResolver("ca-central-1")

        val tokens = PoyntTokenService(
            credentials = credentialResolver,
            transport = PoyntCloudTokenTransport(
                poyntBaseUrl,
                "1.2"
            ),
            audience = poyntBaseUrl
        )

        // Authenticate using the merchant-created application key.
        // Never print JWT assertions, access tokens, or private keys.
        val token = tokens.token(config)

        assertTrue(
            token.value.isNotBlank(),
            "Poynt OAuth access token is empty"
        )

        println("Poynt Test Lab OAuth: SUCCESS")

        val transport = PoyntCloudHttpTransport(
            poyntBaseUrl,
            "1.2"
        )

        val authorization = "${token.tokenType} ${token.value}"

        // Step 1: Verify the known merchant Business ID.
        // Request deactivated devices where supported by the endpoint.
        val businessResponse = transport.get(
            URI.create(
                "$poyntBaseUrl/businesses/$businessId?ignoreDeactivatedDevices=false"
            ),
            authorization
        )

        println("Poynt test business HTTP ${businessResponse.statusCode}")

        if (businessResponse.statusCode != 200) {
            printSafeErrorCode(
                "Business verification",
                businessResponse.body
            )
        }

        assertEquals(
            200,
            businessResponse.statusCode,
            "Unable to access Memgine Dev Cafe business"
        )

        val business = Json.parseToJsonElement(
            businessResponse.body
        ).jsonObject

        assertEquals(
            businessId,
            business["id"]?.jsonPrimitive?.content,
            "Business ID mismatch"
        )

        println("Verified Business ID: $businessId")
        println("Business type: ${safeField(business, "type")}")
        println("Business status: ${safeField(business, "status")}")
        println("Mock processor: ${safeField(business, "mockProcessor")}")
        printDeviceInformation("Business", business)

        val embeddedStores = business["stores"] as? JsonArray
        if (embeddedStores == null) {
            println("Business.stores: NOT_EXPOSED_AS_ARRAY")
        } else {
            println("Business.stores count: ${embeddedStores.size}")
            val matchingStore = embeddedStores
                .mapNotNull { it as? JsonObject }
                .firstOrNull { safeField(it, "id") == expectedStoreId }

            if (matchingStore == null) {
                println("Expected store in Business.stores: NOT_FOUND_IN_RESPONSE")
            } else {
                println("Embedded store status: ${safeField(matchingStore, "status")}")
                printDeviceInformation("Business embedded store", matchingStore)
            }
        }

        // Step 2: Verify that the Store ID belongs to the Business ID.
        val storeResponse = transport.get(
            transport.storeUri(businessId, expectedStoreId),
            authorization
        )

        println("Poynt test store HTTP ${storeResponse.statusCode}")

        if (storeResponse.statusCode != 200) {
            printSafeErrorCode(
                "Store verification",
                storeResponse.body
            )
        }

        assertEquals(
            200,
            storeResponse.statusCode,
            "Unable to access Memgine Dev Cafe store"
        )

        val store = Json.parseToJsonElement(
            storeResponse.body
        ).jsonObject

        assertEquals(
            expectedStoreId,
            store["id"]?.jsonPrimitive?.content,
            "Store ID mismatch"
        )

        println("Verified Store ID: $expectedStoreId")
        println("Store status: ${safeField(store, "status")}")
        printDeviceInformation("Store", store)

        println("Memgine Dev Cafe authentication and verification: SUCCESS")
        println("Note: NOT_EXPOSED does not mean no devices exist.")
    }

    private fun safeField(obj: JsonObject, field: String): String =
        (obj[field] as? JsonPrimitive)?.content ?: "NOT_EXPOSED"

    private fun printDeviceInformation(label: String, obj: JsonObject) {
        for (field in listOf("storeDevices", "devices")) {
            val value = obj[field]

            if (value == null) {
                println("$label.$field: NOT_EXPOSED")
                continue
            }

            val devices = value as? JsonArray
            if (devices == null) {
                println("$label.$field: NOT_AN_ARRAY")
                continue
            }

            println("$label.$field count: ${devices.size}")

            devices.forEachIndexed { index, item ->
                val device = item as? JsonObject
                if (device == null) {
                    println("  Device ${index + 1}: UNRECOGNIZED_FORMAT")
                    return@forEachIndexed
                }

                println("  Device ${index + 1}:")
                println("    ID: ${safeField(device, "id")}")
                println("    Device ID: ${safeField(device, "deviceId")}")
                println("    Status: ${safeField(device, "status")}")
                println("    Type: ${safeField(device, "type")}")
                println("    Store ID: ${safeField(device, "storeId")}")
            }
        }
    }

    private fun printSafeErrorCode(
        operation: String,
        responseBody: String
    ) {
        val errorCode = runCatching {
            val body = Json.parseToJsonElement(responseBody).jsonObject
            body["code"]?.jsonPrimitive?.content
                ?: body["error"]?.jsonPrimitive?.content
                ?: "NO_ERROR_CODE"
        }.getOrDefault("NON_JSON_RESPONSE")

        // Only print a recognized diagnostic error code.
        // Never print a response body, access token, or JWT.
        val safeCode = if (
            errorCode.matches(Regex("[A-Za-z0-9_\\-]{1,80}"))
        ) {
            errorCode
        } else {
            "UNRECOGNIZED_ERROR_CODE"
        }

        println("$operation error code: $safeCode")
    }
}
