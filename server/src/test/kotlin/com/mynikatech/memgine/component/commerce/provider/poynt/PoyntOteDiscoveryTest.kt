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

    val orderId = "b875b9bd-be0d-423d-b2f1-9cfc36bf2746"
    val referenceId = "RDP-91bb098d-17c7-4266-9362-f3f292f34837"

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
                                    "\"transactionAmount\":367"
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
               "?startAt=2026-10-25T23%3A25%3A00Z" +
                "&endAt=2026-10-25T23%3A45%3A00Z"
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



    /** W222: read-only comparison of the two Poynt Test Lab catalogs. */
    @Test
    fun inspectW222CatalogSeparation() {
        if (System.getenv("POYNT_W222_CATALOG_DISCOVERY") != "true") {
            println("W222 catalog diagnostic: SKIPPED")
            return
        }

        val token = accessToken()
        val transport = PoyntCloudHttpTransport(poyntBaseUrl, "1.2")
        val authorization = "${token.tokenType} ${token.value}"

        // Discover the actual catalog IDs instead of requiring them from the Poynt GUI.
        val listing = transport.get(URI.create("$poyntBaseUrl/businesses/$businessId/catalogs"), authorization)
        println("W222 catalog listing HTTP ${listing.statusCode}")
        if (listing.statusCode != 200) printSafeErrorCode("W222 catalog listing", listing.body)
        assertEquals(200, listing.statusCode, "Poynt catalog listing unavailable; IDs cannot be verified")
        val listingRoot = Json.parseToJsonElement(listing.body)
        val catalogEntries = when (listingRoot) {
            is JsonArray -> listingRoot
            is JsonObject -> {
                println("W222 listing root fields: ${listingRoot.keys.sorted()}")
                (listingRoot["catalogs"] as? JsonArray)
                    ?: (listingRoot["items"] as? JsonArray)
                    ?: error("Poynt catalog listing response has no recognized catalog array")
            }
            else -> error("Unexpected Poynt catalog listing response")
        }
        val catalogObjects = catalogEntries.mapNotNull { it as? JsonObject }
        println("W222 catalogs returned: ${catalogObjects.size}")
        catalogObjects.forEach { catalog ->
            val name = (catalog["name"] as? JsonPrimitive)?.content ?: "NOT_EXPOSED"
            println("W222 discovered catalog name: ${name.replace(Regex("[\\r\\n\\t]"), " ").take(100)}")
        }
        fun catalogIdFor(name: String): String {
            val matches = catalogObjects.filter {
                (it["name"] as? JsonPrimitive)?.content?.trim()?.equals(name, ignoreCase = true) == true
            }
            check(matches.size == 1) { "Expected one catalog named '$name', found ${matches.size}" }
            val id = (matches.single()["id"] as? JsonPrimitive)?.content?.trim()
            check(id != null && id.matches(Regex("^[A-Za-z0-9_-]{1,160}$"))) {
                "Catalog '$name' does not expose a valid ID"
            }
            return id
        }
        val originalId = catalogIdFor("Memgine Dev Cafe")
        val ajaxId = catalogIdFor("Memgine Dev Cafe Ajax")
        check(originalId != ajaxId) { "Catalog IDs unexpectedly match" }
        println("W222 two distinct catalog identities discovered")

        fun inspect(label: String, catalogId: String): Set<String> {
            val response = transport.get(transport.catalogFullUri(businessId, catalogId), authorization)
            println("W222 $label catalog GET HTTP ${response.statusCode}")
            if (response.statusCode != 200) printSafeErrorCode("W222 $label", response.body)
            assertEquals(200, response.statusCode, "W222 $label catalog GET failed")
            val root = Json.parseToJsonElement(response.body) as? JsonObject
                ?: error("W222 $label catalog response is not a JSON object")
            val returnedId = (root["id"] as? JsonPrimitive)?.content
            assertEquals(catalogId, returnedId, "W222 $label catalog identity mismatch")
            println("W222 $label catalog name: ${(root["name"] as? JsonPrimitive)?.content ?: "NOT_EXPOSED"}")
            println("W222 $label root fields: ${root.keys.sorted()}")

            val productIds = linkedSetOf<String>()
            var inspectedEntries = 0
            var printedSamples = 0
            var missingIdentity = 0
            var missingPrice = 0
            fun safeValue(obj: JsonObject?, key: String): String =
                (obj?.get(key) as? JsonPrimitive)?.content
                    ?.replace(Regex("[\r\n\t]"), " ")?.take(100) ?: "NOT_EXPOSED"

            fun productArray(path: String, array: JsonArray) {
                println("W222 $label $path entries: ${array.size}")
                array.forEachIndexed { index, value ->
                    inspectedEntries++
                    val wrapper = value as? JsonObject
                    val product = (wrapper?.get("product") as? JsonObject)
                        ?: wrapper?.takeIf { it["id"] is JsonPrimitive }
                    if (product == null) {
                        missingIdentity++
                        if (printedSamples < 5) {
                            println("W222 $label $path[$index]: PRODUCT_OBJECT_NOT_EXPOSED; wrapper fields=${wrapper?.keys?.sorted() ?: emptyList<String>()}")
                            printedSamples++
                        }
                        return@forEachIndexed
                    }
                    val id = safeValue(product, "id")
                    if (id == "NOT_EXPOSED" || id.isBlank()) missingIdentity++ else productIds.add(id)
                    val price = product["price"] as? JsonObject
                    if (price == null || price["amount"] !is JsonPrimitive) missingPrice++
                    if (printedSamples < 5) {
                        println("W222 $label $path[$index] nested product fields: ${product.keys.sorted()}")
                        println("W222 $label sample[$index]: id=$id, name=${safeValue(product, "name")}, sku=${safeValue(product, "sku")}, amount=${safeValue(price, "amount")}, currency=${safeValue(price, "currency")}")
                        printedSamples++
                    }
                }
            }

            listOf("products", "items").forEach { key ->
                (root[key] as? JsonArray)?.let { productArray("root.$key", it) }
            }
            (root["categories"] as? JsonArray)?.let { categories ->
                println("W222 $label categories: ${categories.size}")
                categories.forEachIndexed { index, entry ->
                    val category = entry as? JsonObject ?: return@forEachIndexed
                    listOf("products", "items").forEach { key ->
                        (category[key] as? JsonArray)?.let { productArray("categories[$index].$key", it) }
                    }
                }
            }
            println("W222 $label total wrapped entries: $inspectedEntries")
            println("W222 $label unique product IDs: ${productIds.size}")
            println("W222 $label missing product identity entries: $missingIdentity")
            println("W222 $label entries without direct price.amount: $missingPrice")
            check(missingIdentity == 0) { "W222 $label catalog contains product entries without usable identities" }
            check(productIds.isNotEmpty()) { "W222 $label catalog contains no identifiable products" }
            return productIds
        }

        val original = inspect("original", originalId)
        val ajax = inspect("ajax", ajaxId)
        println("W222 candidate product ID overlap: ${(original intersect ajax).size}")
        println("W222 Ajax-only product IDs: ${(ajax - original).size}")
        println("W222 Original-only product IDs: ${(original - ajax).size}")
        println("W222 UI reference counts: original=126, ajax=1; API response may count category links differently")
        println("W222 catalog diagnostic complete: GET requests only; no payment or data changes")
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
