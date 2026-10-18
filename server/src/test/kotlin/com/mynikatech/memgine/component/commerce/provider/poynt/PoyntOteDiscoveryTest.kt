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

        // Authenticate using the merchant-created application key.
        // Never print JWT assertions, access tokens, or private keys.
        val token = accessToken()

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

    /**
     * Opt-in read-only shape diagnostic for a known transaction. This only
     * obtains OAuth credentials and sends the transaction lookup GET; it never
     * creates, tokenizes, charges, or changes a Memgine record.
     */
    @Test
    fun inspectTransactionById() {
        if (System.getenv("POYNT_OTE_DISCOVERY") != "true") {
            println("Poynt transaction diagnostic: SKIPPED")
            return
        }

        val transactionId = System.getenv("POYNT_DIAGNOSTIC_TRANSACTION_ID")
            ?.trim()
            ?.takeIf { it.matches(Regex("^[A-Za-z0-9_-]{1,160}$")) }

        if (transactionId == null) {
            println("Poynt transaction diagnostic: SKIPPED (POYNT_DIAGNOSTIC_TRANSACTION_ID is missing or invalid)")
            return
        }

        val token = accessToken()
        val transport = PoyntCloudHttpTransport(poyntBaseUrl, "1.2")
        val response = transport.get(
            transport.transactionByIdUri(businessId, transactionId),
            "${token.tokenType} ${token.value}"
        )

        println("Transaction lookup HTTP ${response.statusCode}")

        val root = runCatching { Json.parseToJsonElement(response.body) }
            .getOrElse {
                println("Transaction JSON root: INVALID")
                return
            }

        val transaction = when (root) {
            is JsonObject -> {
                println("Transaction JSON root: OBJECT")
                val transactions = root["transactions"] as? JsonArray
                if (transactions != null) {
                    println("Transactions returned: ${transactions.size}")
                    transactions.singleOrNull() as? JsonObject
                } else {
                    root
                }
            }
            is JsonArray -> {
                println("Transaction JSON root: ARRAY")
                println("Transactions returned: ${root.size}")
                root.singleOrNull() as? JsonObject
            }
            else -> {
                println("Transaction JSON root: OTHER")
                null
            }
        }

        if (transaction == null) {
            println("Transaction diagnostic: no single transaction object")
            return
        }

        val processor = transaction["processorResponse"] as? JsonObject
        val amounts = transaction["amounts"] as? JsonObject
        val context = transaction["context"] as? JsonObject

        println("Transaction ID: ${safeDiagnosticField(transaction, "id")}")
        println("Transaction action: ${safeDiagnosticField(transaction, "action")}")
        println("Transaction status: ${safeDiagnosticField(transaction, "status")}")
        println("Processor: ${safeDiagnosticField(processor, "processor")}")
        println("Processor status: ${safeDiagnosticField(processor, "status")}")
        println("Processor status code: ${safeDiagnosticField(processor, "statusCode")}")
        processor?.get("statusMessage")?.let {
            println("Processor status message: ${safeDiagnosticValue(it)}")
        }
        println("Processor approved amount: ${safeDiagnosticField(processor, "approvedAmount")}")
        println("Currency: ${safeDiagnosticField(amounts, "currency")}")
        println("Transaction amount: ${safeDiagnosticField(amounts, "transactionAmount")}")
        println("Order amount: ${safeDiagnosticField(amounts, "orderAmount")}")
        println("Business ID matches: ${safeField(context ?: JsonObject(emptyMap()), "businessId") == businessId}")
        println("Store ID matches: ${safeField(context ?: JsonObject(emptyMap()), "storeId") == expectedStoreId}")
    }
    
    
@Test
fun inspectPendingCounterTerminalPayment() {
    if (System.getenv("POYNT_OTE_DISCOVERY") != "true") {
        println("Poynt terminal diagnostic: SKIPPED")
        return
    }

    val orderId = "50c47b68-e88d-40bb-8020-01c38841da45"
    val referenceId = "MRP-c4ef4988-43e2-48e6-84ab-112e341b1937"

    val token = accessToken()
    val transport = PoyntCloudHttpTransport(poyntBaseUrl, "1.2")
    val authorization = "${token.tokenType} ${token.value}"

    fun inspect(label: String, uri: URI) {
        val response = transport.get(uri, authorization)
        println("\n=== $label ===")
        println("HTTP status: ${response.statusCode}")
        if (response.statusCode !in 200..299) {
            val error = runCatching {
                Json.parseToJsonElement(response.body).jsonObject
            }.getOrNull()

            println("Poynt error code: ${safeDiagnosticField(error, "code")}")
            println("Poynt error message: ${safeDiagnosticField(error, "message")}")
            println("Poynt developer message: ${safeDiagnosticField(error, "developerMessage")}")
            return
        }

        val root = runCatching {
            Json.parseToJsonElement(response.body)
        }.getOrNull()

        if (root == null) {
            println("Response: Non-JSON or empty")
            return
        }

        fun field(obj: JsonObject?, key: String): String =
            (obj?.get(key) as? JsonPrimitive)
                ?.content ?: "NOT_EXPOSED"

        fun printRecord(record: JsonObject) {
            val amounts = record["amounts"] as? JsonObject
            val context = record["context"] as? JsonObject
            println("ID: ${field(record, "id")}")
            println("Status: ${field(record, "status")}")
            println("Action: ${field(record, "action")}")
            println("Original request ID: ${field(record, "originalRequestId")}")
            println("Order ID: ${field(record, "orderId")}")
            println("Reference ID: ${field(record, "referenceId")}")
            println("Amount: ${field(amounts, "transactionAmount")}")
            println("Currency: ${field(amounts, "currency")}")
            println("Context store matches: ${field(context, "storeId") == expectedStoreId}")
            println("Context business matches: ${field(context, "businessId") == businessId}")
        }

        when (root) {
            is JsonObject -> {
                println("Response fields: ${root.keys.sorted()}")

                val records = (
                    root["transactions"] as? JsonArray
                        ?: root["items"] as? JsonArray
                    )

                if (records != null) {
                    println("Returned records: ${records.size}")
                    records
                        .mapNotNull { it as? JsonObject }
                        .filter { record ->
                            val serialized = record.toString()
                            serialized.contains(orderId) ||
                                serialized.contains(referenceId) ||
                                serialized.contains(
                                    "\"transactionAmount\":42"
                                )
                        }
                        .take(10)
                        .forEach(::printRecord)
                } else {
                    printRecord(root)
                }
            }

            is JsonArray -> {
                println("Returned records: ${root.size}")
                root.mapNotNull { it as? JsonObject }
                    .filter { record ->
                        val serialized = record.toString()
                        serialized.contains(orderId) ||
                            serialized.contains(referenceId) ||
                            serialized.contains(
                                "\"transactionAmount\":42"
                            )
                    }
                    .take(10)
                    .forEach(::printRecord)
            }

            else -> println("Unexpected JSON response shape")
        }
    }

val orderResponse = transport.get(
    URI.create("$poyntBaseUrl/businesses/$businessId/orders/$orderId"),
    authorization
)

println("\n=== POYNT ORDER DETAILS ===")
println("HTTP status: ${orderResponse.statusCode}")

val order = runCatching {
    Json.parseToJsonElement(orderResponse.body).jsonObject
}.getOrNull()

if (order != null) {
    println("Order ID: ${safeDiagnosticField(order, "id")}")
    println("Accepted: ${safeDiagnosticField(order, "accepted")}")
    println("Valid: ${safeDiagnosticField(order, "valid")}")

    val amounts = order["amounts"] as? JsonObject
    println("Order amounts: ${amounts?.keys?.sorted()}")

    val statuses = order["statuses"] as? JsonObject
    println("Order statuses: ${statuses?.keys?.sorted()}")
    println("Order status: ${safeDiagnosticField(statuses, "status")}")
    println("Transaction summary: ${safeDiagnosticField(statuses, "transactionStatusSummary")}")
    println("Fulfillment status: ${safeDiagnosticField(statuses, "fulfillmentStatus")}")

    val histories = order["orderHistories"] as? JsonArray
    println("Order history count: ${histories?.size ?: 0}")

    histories?.forEachIndexed { index, history ->
        val entry = history as? JsonObject ?: return@forEachIndexed
        println(
            "History ${index + 1}: " +
                "status=${safeDiagnosticField(entry, "status")}, " +
                "createdAt=${safeDiagnosticField(entry, "createdAt")}"
        )
    }
}

    inspect(
        "POYNT TRANSACTIONS",
        URI.create(
            "$poyntBaseUrl/businesses/$businessId/transactions" +
                "?startAt=2026-10-14T18%3A40%3A00Z" +
                "&endAt=2026-10-14T19%3A00%3A00Z"
        )
    )

    println("\nDiagnostic complete. No payment was initiated.")
}


@Test
fun inspectExistingCollectRefund() {
    if (System.getenv("POYNT_REFUND_DIAGNOSTIC") != "true") {
        println("Poynt refund diagnostic: SKIPPED")
        return
    }

    val refundId = "7346ba72-f803-4359-afaa-3920c5b066b6"
    val attemptId = "PRA_301533e3-b234-489c-9035-3b659e9f2750"

    val token = accessToken()
    val transport = PoyntCloudHttpTransport(poyntBaseUrl, "1.2")
    val authorization = "${token.tokenType} ${token.value}"

    fun field(obj: JsonObject?, key: String): String =
        (obj?.get(key) as? JsonPrimitive)
            ?.content
            ?.replace(Regex("[\\r\\n\\t]"), " ")
            ?.take(100)
            ?: "NOT_EXPOSED"

    fun inspect(label: String, uri: URI) {
        val response = transport.get(uri, authorization)

        println("\n=== $label ===")
        println("HTTP status: ${response.statusCode}")
        
         if (response.statusCode !in 200..299) {
        val error = runCatching {
            Json.parseToJsonElement(response.body).jsonObject
        }.getOrNull()

        println("Poynt error code: ${safeDiagnosticField(error, "code")}")
        println("Poynt error message: ${safeDiagnosticField(error, "message")}")
        println("Poynt developer message: ${safeDiagnosticField(error, "developerMessage")}")
        return
    }

        val root = runCatching {
            Json.parseToJsonElement(response.body)
        }.getOrNull()

        if (root == null) {
            println("Response: EMPTY_OR_NON_JSON")
            return
        }

        println("Root type: ${root::class.simpleName}")

        val records = when (root) {
            is JsonArray ->
                root.mapNotNull { it as? JsonObject }

            is JsonObject -> {
                println("Root keys: ${root.keys.sorted()}")
                val array = root["transactions"] as? JsonArray
                if (array != null) {
                    array.mapNotNull { it as? JsonObject }
                } else {
                    listOf(root)
                }
            }

            else -> emptyList()
        }

        println("Returned records: ${records.size}")

        records.take(5).forEachIndexed { index, txn ->
            val processor = txn["processorResponse"] as? JsonObject
            val amounts = txn["amounts"] as? JsonObject
            val context = txn["context"] as? JsonObject

            println("\nRecord ${index + 1}")
            println("Transaction keys: ${txn.keys.sorted()}")
            println("ID: ${field(txn, "id")}")
            println("Action: ${field(txn, "action")}")
            println("Status: ${field(txn, "status")}")
            println("Parent ID: ${field(txn, "parentId")}")
            println("Original request ID: ${field(txn, "originalRequestId")}")

            println("Amounts keys: ${amounts?.keys?.sorted()}")
            println("Currency: ${field(amounts, "currency")}")
            println("Transaction amount: ${field(amounts, "transactionAmount")}")
            println("Order amount: ${field(amounts, "orderAmount")}")

            println("Processor keys: ${processor?.keys?.sorted()}")
            println("Processor status: ${field(processor, "status")}")
            println("Processor approved amount: ${field(processor, "approvedAmount")}")

            println("Business matches: ${field(context, "businessId") == businessId}")
            println("Store matches: ${field(context, "storeId") == expectedStoreId}")

            println("Matches known refund ID: ${field(txn, "id") == refundId}")
            println("Matches attempt ID: ${field(txn, "originalRequestId") == attemptId}")
        }
    }

    inspect(
        "REFUND BY TRANSACTION ID",
        transport.transactionByIdUri(businessId, refundId)
    )

    inspect(
        "REFUND BY ORIGINAL REQUEST ID",
        transport.transactionsByOriginalRequestIdUri(businessId, attemptId)
    )

    // Direct transaction lookup - GET only
    inspect(
        "DIRECT REFUND TRANSACTION LOOKUP",
        URI.create(
            "$poyntBaseUrl/businesses/$businessId/transactions/$refundId"
        )
    )
    inspect(
        "TRANSACTIONS IN DATE WINDOW",
        URI.create(
            "$poyntBaseUrl/businesses/$businessId/transactions" +
                "?startAt=2026-10-18T00%3A00%3A00Z" +
                "&endAt=2026-10-20T00%3A00%3A00Z"
        )
    )

    println("\nRead-only refund diagnostic complete.")
}



    private fun accessToken(): PoyntAccessToken {
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
            transport = PoyntCloudTokenTransport(poyntBaseUrl, "1.2"),
            audience = poyntBaseUrl
        )
        return tokens.token(config)
    }

    private fun safeField(obj: JsonObject, field: String): String =
        (obj[field] as? JsonPrimitive)?.content ?: "NOT_EXPOSED"

    private fun safeDiagnosticField(obj: JsonObject?, field: String): String =
        obj?.get(field)?.let(::safeDiagnosticValue) ?: "NOT_EXPOSED"

    private fun safeDiagnosticValue(value: kotlinx.serialization.json.JsonElement): String {
        val content = (value as? JsonPrimitive)?.content ?: return "NOT_EXPOSED"
        return content
            .replace(Regex("[\\r\\n\\t]"), " ")
            .take(256)
    }

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
