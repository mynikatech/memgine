package com.mynikatech.memgine.component.commerce.provider.poynt

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject

/**
 * Explicit, read-only verification of the known Coffee redemption order in
 * Poynt's production-hosted Test Lab. It is intentionally skipped unless
 * POYNT_OTE_ORDER_LOOKUP=true is supplied to this exact test invocation.
 */
class PoyntOteOrderLookupTest {
    private val baseUrl = "https://services.poynt.net"
    private val businessId = "08ecfebe-ad09-4afa-9974-81deb66b131e"
    private val orderId = "ecae9ef3-584b-4ef2-b715-01d31e7634ba"
    private val productId = "70ed9f7e-1e09-4008-8d05-29bcfd413a52"

    @Test
    fun lookupCoffeeRedemptionOrder() {
        if (System.getenv("POYNT_OTE_ORDER_LOOKUP") != "true") {
            println("Poynt OTE order lookup: SKIPPED")
            return
        }

        val token = accessToken()
        val transport = PoyntCloudHttpTransport(baseUrl, "1.2")
        val response = transport.get(
            transport.orderUri(businessId, orderId),
            "${token.tokenType} ${token.value}"
        )

        println("Poynt order lookup HTTP ${response.statusCode}")
        if (response.statusCode == 404) {
            println("Poynt order lookup: NOT_FOUND")
            throw AssertionError("Poynt order was not found")
        }
        if (response.statusCode != 200) {
            println("Poynt order lookup error code: ${safeErrorCode(response.body)}")
            throw AssertionError("Poynt order lookup failed with HTTP ${response.statusCode}")
        }

        val order = runCatching { Json.parseToJsonElement(response.body).jsonObject }
            .getOrElse { throw AssertionError("Poynt order response was not valid JSON") }
        assertEquals(orderId, field(order, "id"), "Poynt order ID mismatch")
        // Inspect Poynt order status, context and payment information
        println("Order statuses: ${order["statuses"]}")
        println("Order context: ${order["context"]}")
        println("Order amounts: ${order["amounts"]}")
        println("Order transaction count: ${(order["transactions"] as? JsonArray)?.size ?: 0}")

        val items = order["items"] as? JsonArray
        println("Order items returned: ${items?.size ?: 0}")
        val coffee = items.orEmpty().mapNotNull { it as? JsonObject }.firstOrNull {
            field(it, "productId") == productId
        }
        assertTrue(coffee != null, "Expected Coffee product ID was not returned")

        println("Order ID: $orderId")
        println("Coffee product ID: ${field(coffee, "productId")}")
        println("Coffee name: ${safeText(field(coffee, "name"))}")
        val quantity = field(coffee, "quantity")
        if (quantity != "NOT_EXPOSED") {
            assertEquals(1.0, quantity.toDouble(), 0.000001, "Coffee quantity mismatch")
        }
        verifyIfPresent(coffee, "unitPrice", "199")

        val amounts = order["amounts"] as? JsonObject
        println("Currency: ${field(amounts, "currency")}")
        println("Original line price: ${field(coffee, "unitPrice")}")
        println("Amount payable: ${firstPresent(amounts, "netTotal", "amount", "orderAmount")}")
        verifyIfPresent(amounts, "currency", "CAD")
        verifyIfPresent(amounts, "netTotal", "0")
    }

    private fun accessToken(): PoyntAccessToken {
        val configuration = PoyntCatalogConfiguration(
            "test-lab-order-lookup", "test-lab-order-lookup",
            "urn:aid:fb9d62bd-12ab-4520-bf9e-54617622ed5f", "", null,
            "memgine/dev/poynt-dev/cloud-app", "CAD", null
        )
        return PoyntTokenService(
            credentials = AwsSecretsManagerPoyntCredentialResolver("ca-central-1"),
            transport = PoyntCloudTokenTransport(baseUrl, "1.2"),
            audience = baseUrl
        ).token(configuration)
    }

    private fun verifyIfPresent(objectValue: JsonObject?, key: String, expected: String) {
        val actual = field(objectValue, key)
        println("$key: $actual")
        if (actual != "NOT_EXPOSED") assertEquals(expected, actual, "$key mismatch")
    }

    private fun firstPresent(objectValue: JsonObject?, vararg keys: String): String =
        keys.asSequence().map { field(objectValue, it) }.firstOrNull { it != "NOT_EXPOSED" } ?: "NOT_EXPOSED"

    private fun field(objectValue: JsonObject?, key: String): String =
        (objectValue?.get(key) as? JsonPrimitive)?.content?.let(::safeText) ?: "NOT_EXPOSED"

    private fun safeText(value: String): String = value.replace(Regex("[\\r\\n\\t]"), " ").take(160)

    private fun safeErrorCode(body: String): String = runCatching {
        val objectValue = Json.parseToJsonElement(body).jsonObject
        field(objectValue, "code").takeIf { it != "NOT_EXPOSED" }
            ?: field(objectValue, "error")
    }.getOrDefault("NON_JSON_RESPONSE")
}
