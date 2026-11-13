package com.mynikatech.memgine.component.commerce.provider.poynt

import java.net.URI
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.longOrNull

/**
 * Explicit, read-only production diagnostic for the POS integration. The test
 * is inert unless POYNT_PROD_CATALOG_DISCOVERY=true is supplied to this exact
 * invocation. It only uses OAuth and Poynt GET requests.
 */
class PoyntProductionCatalogDiscoveryTest {
    /**
     * Explicit Test Lab diagnostic for the catalog used by the existing Poynt
     * OTE/Test Lab test configuration. The Poynt Test Lab is production-hosted,
     * so this still uses services.poynt.net; it never targets a live merchant.
     */
    @Test
    fun inspectTestLabBlueberryCheesecakeCurrency() {
        if (System.getenv("POYNT_OTE_CATALOG_CURRENCY_DIAGNOSTIC") != "true") {
            println("Poynt Test Lab catalog currency diagnostic: SKIPPED")
            return
        }

        val config = testLabCurrencyConfiguration()
        val transport = PoyntCloudHttpTransport(config.baseUrl, API_VERSION)
        val token = PoyntTokenService(
            credentials = AwsSecretsManagerPoyntCredentialResolver(config.awsRegion),
            transport = PoyntCloudTokenTransport(config.baseUrl, API_VERSION),
            audience = config.baseUrl,
        ).token(
            PoyntCatalogConfiguration(
                integrationConfigurationId = "test-lab-catalog-currency-diagnostic",
                organizationId = "test-lab-catalog-currency-diagnostic",
                applicationId = config.applicationId,
                businessId = config.businessId,
                providerStoreId = config.storeId,
                secretReference = config.secretReference,
                merchantCurrencyCode = "CAD",
                lastIncrementalSyncAt = null,
            ),
        )
        val authorization = "${token.tokenType} ${token.value}"
        val businessResponse = transport.get(
            URI.create("${config.baseUrl}/businesses/${config.businessId}?ignoreDeactivatedDevices=false"),
            authorization,
        )
        println("Test Lab business GET HTTP ${businessResponse.statusCode}")
        if (businessResponse.statusCode != 200) {
            println("Test Lab business result: ${classify(businessResponse.statusCode)}")
            println("Test Lab business error code: ${safeErrorCode(businessResponse.body)}")
            return
        }
        val business = parseObject(businessResponse.body, "Test Lab business") ?: return
        assertEquals(config.businessId, primitive(business, "id"), "Configured Test Lab business did not match Poynt")

        val storeResponse = transport.get(transport.storeUri(config.businessId, config.storeId), authorization)
        println("Test Lab store GET HTTP ${storeResponse.statusCode}")
        val store = if (storeResponse.statusCode == 200) {
            parseObject(storeResponse.body, "Test Lab store")
        } else {
            println("Test Lab store result: ${classify(storeResponse.statusCode)}")
            println("Test Lab store error code: ${safeErrorCode(storeResponse.body)}")
            null
        }
        if (store == null || primitive(store, "id") != config.storeId) {
            println("Blueberry Cheesecake catalog entry: UNKNOWN (Test Lab store was not verified)")
            return
        }

        val devices = (devicesIn(business) + devicesIn(store)).distinctBy(::deviceIdentity)
        val inspections = devices.map { device ->
            inspectDevice(
                deviceName(device).ifBlank { "Test Lab device" },
                device,
                config,
                transport,
                authorization,
            )
        }
        inspectBlueberryCheesecakeCurrency(inspections, business, listOf(store))
        inspectTestLabCurrencyComparison(inspections, business, store, config, transport, authorization)
        inspectCadProductComparison(inspections, config, transport, authorization)
        inspectEntireTestLabCatalogCurrency(
            inspections,
            config,
            transport,
            authorization
        )
        inspectPaginatedProductCurrency(config, transport, authorization)
        inspectTestLabOrderCurrency(config, store, transport, authorization)
        println("Poynt Test Lab catalog currency diagnostic complete. GET requests only.")
    }
    
    
    @Test
    fun inspectTestLabLemonadeVsBlueberryCompleteProducts() {
        if (System.getenv("POYNT_TEST_LAB_PRODUCT_DETAIL_DIAGNOSTIC") != "true") {
            println("Poynt Test Lab product detail diagnostic: SKIPPED")
            return
        }

        val config = testLabCurrencyConfiguration()

        val transport = PoyntCloudHttpTransport(
            config.baseUrl,
            API_VERSION
        )

        val token = PoyntTokenService(
            credentials = AwsSecretsManagerPoyntCredentialResolver(
                config.awsRegion
            ),
            transport = PoyntCloudTokenTransport(
                config.baseUrl,
                API_VERSION
            ),
            audience = config.baseUrl
        ).token(
            PoyntCatalogConfiguration(
                integrationConfigurationId = "test-lab-product-detail-diagnostic",
                organizationId = "test-lab-product-detail-diagnostic",
                applicationId = config.applicationId,
                businessId = config.businessId,
                providerStoreId = config.storeId,
                secretReference = config.secretReference,
                merchantCurrencyCode = "CAD",
                lastIncrementalSyncAt = null
            )
        )

        val authorization = "${token.tokenType} ${token.value}"

        val products = listOf(
            "Lemonade" to "8b86d8bb-49f5-489b-9cc0-4200381dcda5",
            "Blueberry Cheesecake" to BLUEBERRY_CHEESECAKE_PRODUCT_ID
        )

        val prettyJson = Json {
            prettyPrint = true
            prettyPrintIndent = "  "
        }

        val responses = linkedMapOf<String, JsonObject>()

        products.forEach { (name, productId) ->
            println()
            println("========== $name ==========")

            val response = transport.get(
                transport.productUri(config.businessId, productId),
                authorization
            )

            println("HTTP Status: ${response.statusCode}")

            assertEquals(
                200,
                response.statusCode,
                "$name product GET failed"
            )

            val product = parseObject(
                response.body,
                "$name full product"
            ) ?: error("$name returned invalid product JSON")

            assertEquals(
                productId,
                primitive(product, "id"),
                "$name product ID mismatch"
            )

            responses[name] = product

            println("PRODUCT NAME: ${primitive(product, "name")}")
            println("PRODUCT ID: ${primitive(product, "id")}")
            println("SKU: ${primitive(product, "sku")}")

            val price = product["price"]

            println("PRICE AMOUNT: ${priceAmount(price)}")
            println(
                "PRICE CURRENCY: " +
                    observedCurrency(price, "\$.price").value
            )

            println()
            println("FULL RAW PRODUCT JSON:")
            println(
                prettyJson.encodeToString(
                    kotlinx.serialization.json.JsonElement.serializer(),
                    product
                )
            )
        }

        println()
        println("========== FIELD-BY-FIELD COMPARISON ==========")

        val lemonade = responses.getValue("Lemonade")
        val blueberry = responses.getValue("Blueberry Cheesecake")

        fun compare(
            path: String,
            left: JsonElement?,
            right: JsonElement?
        ) {
            if (left is JsonObject && right is JsonObject) {
                (left.keys + right.keys).toSortedSet().forEach { key ->
                    compare(
                        if (path.isEmpty()) key else "$path.$key",
                        left[key],
                        right[key]
                    )
                }
                return
            }

            if (left is JsonArray && right is JsonArray) {
                (0 until maxOf(left.size, right.size)).forEach { index ->
                    compare(
                        "$path[$index]",
                        left.getOrNull(index),
                        right.getOrNull(index)
                    )
                }
                return
            }

            if (left != right) {
                println("FIELD: $path")
                println("  Lemonade: ${left ?: "<ABSENT>"}")
                println("  Blueberry: ${right ?: "<ABSENT>"}")
            }
        }

        compare("", lemonade, blueberry)

        println()
        println("========== CURRENCY COMPARISON ==========")

        val lemonadeCurrency =
            observedCurrency(lemonade["price"], "\$.price").value

        val blueberryCurrency =
            observedCurrency(blueberry["price"], "\$.price").value

        println("Lemonade currency: $lemonadeCurrency")
        println("Blueberry currency: $blueberryCurrency")

        println(
            "Currencies identical: " +
                lemonadeCurrency.equals(
                    blueberryCurrency,
                    ignoreCase = true
                )
        )

        println("Diagnostic complete. Two product GET requests only.")
    }
    
    
    @Test
    fun inspectAllTenTestLabCadProductDetails() {
        if (System.getenv("POYNT_TEST_LAB_CAD_PRODUCTS_DIAGNOSTIC") != "true") {
            println("Test Lab CAD product diagnostic: SKIPPED")
            return
        }

        val config = testLabCurrencyConfiguration()
        val transport = PoyntCloudHttpTransport(
            config.baseUrl,
            API_VERSION
        )

        val token = PoyntTokenService(
            credentials = AwsSecretsManagerPoyntCredentialResolver(
                config.awsRegion
            ),
            transport = PoyntCloudTokenTransport(
                config.baseUrl,
                API_VERSION
            ),
            audience = config.baseUrl
        ).token(
            PoyntCatalogConfiguration(
                integrationConfigurationId = "test-lab-cad-products-diagnostic",
                organizationId = "test-lab-cad-products-diagnostic",
                applicationId = config.applicationId,
                businessId = config.businessId,
                providerStoreId = config.storeId,
                secretReference = config.secretReference,
                merchantCurrencyCode = "CAD",
                lastIncrementalSyncAt = null
            )
        )

        val authorization = "${token.tokenType} ${token.value}"

        // Ten distinct CAD product IDs verified in the previous audit.
        val products = linkedMapOf(
            "Lemonade" to
                "8b86d8bb-49f5-489b-9cc0-4200381dcda5",
            "4 Scones" to
                "be18caf2-e4dc-4b40-ac83-df38783326a4",
            "Greek Yogurt" to
                "d6c38010-cf35-4f8d-b57d-63dcb58bd181",
            "Chia Seeds" to
                "62d7b83c-621c-4ca5-ae2f-2db9e15609c0",
            "Extra Fruits" to
                "c2fb2121-94d9-4458-ab10-e02e8b943d62",
            "Oat Milk" to
                "61674fe6-31a9-4f7d-b584-6f5af07327a3",
            "Orange Cookie" to
                "3b65eff6-51f1-4512-832f-a1559416ae5c",
            "Coffee" to
                "70ed9f7e-1e09-4008-8d05-29bcfd413a52",
            "OSC Only Coffee" to
                "95a1d481-9589-4930-898e-2eb713a2d375",
            "Ajax Exclusive Coffee" to
                "9ffb1123-05c1-4753-883c-99350d15a274"
        )

        val prettyJson = Json {
            prettyPrint = true
            prettyPrintIndent = "  "
        }

        val results = linkedMapOf<String, JsonObject>()

        println("========== ALL TEN CAD PRODUCTS ==========")

        products.forEach { (label, productId) ->
            val response = transport.get(
                transport.productUri(config.businessId, productId),
                authorization
            )

            println("PRODUCT: $label | HTTP ${response.statusCode}")

            assertEquals(
                200,
                response.statusCode,
                "Unable to retrieve $label"
            )

            val product = parseObject(
                response.body,
                "$label complete product"
            ) ?: error("Invalid product JSON: $label")

            assertEquals(
                productId,
                primitive(product, "id"),
                "Product identity mismatch: $label"
            )

            results[label] = product

            println("FULL PRODUCT JSON: $label")
            println(
                prettyJson.encodeToString(
                    JsonElement.serializer(),
                    product
                )
            )
        }

        println()
        println("========== COMPARISON SUMMARY ==========")

        val fields = listOf(
            "createdAt",
            "updatedAt",
            "source",
            "externalId",
            "isCustomPrice",
            "isTrackInventory",
            "isTrackInventoryExternal",
            "type",
            "status",
            "businessId",
            "storeId"
        )

        results.forEach { (name, product) ->
            val price = product["price"]
            val currency = observedCurrency(price, "\$.price").value

            println()
            println("PRODUCT: $name")
            println("CURRENCY: ${currency ?: "ABSENT"}")
            println("AMOUNT: ${priceAmount(price) ?: "ABSENT"}")

            fields.forEach { field ->
                val value = product[field]

                println(
                    "$field = " +
                        if (value == null) "ABSENT" else value.toString()
                )
            }

            println(
                "ROOT FIELDS = " +
                    product.keys.sorted().joinToString(", ")
            )
        }

        println()
        println("========== COMPARISON AGAINST LEMONADE ==========")

        val lemonade = results.getValue("Lemonade")

        results.forEach { (name, product) ->
            if (name == "Lemonade") return@forEach

            val lemonadeKeys = lemonade.keys
            val productKeys = product.keys

            val additionalFields =
                (productKeys - lemonadeKeys).sorted()

            val missingFields =
                (lemonadeKeys - productKeys).sorted()

            println()
            println("PRODUCT: $name")
            println("Same root field set: ${lemonadeKeys == productKeys}")
            println("Fields additional to Lemonade: $additionalFields")
            println("Fields missing versus Lemonade: $missingFields")
        }

        println()
        println("========== CAD PRODUCT FIELD STATISTICS ==========")

        fun countPresent(field: String): Int =
            results.values.count {
                it.containsKey(field) && it[field] != JsonNull
            }

        fun countTrue(field: String): Int =
            results.values.count {
                (it[field] as? JsonPrimitive)?.contentOrNull == "true"
            }

        println("Total products: ${results.size}")
        println("externalId PRESENT: ${countPresent("externalId")}")
        println("externalId ABSENT: ${results.size - countPresent("externalId")}")
        println(
            "isTrackInventoryExternal TRUE: " +
                countTrue("isTrackInventoryExternal")
        )
        println(
            "isTrackInventory PRESENT: " +
                countPresent("isTrackInventory")
        )
        println(
            "isCustomPrice PRESENT: " +
                countPresent("isCustomPrice")
        )

        val currencies = results.values.groupingBy {
            observedCurrency(it["price"], "\$.price").value ?: "ABSENT"
        }.eachCount()

        println("Currency distribution: $currencies")

        println()
        println("========== CONCLUSION DATA ==========")

        results.forEach { (name, product) ->
            val currency = observedCurrency(
                product["price"],
                "\$.price"
            ).value

            println(
                "$name | currency=$currency" +
                    " | externalId=${if (product.containsKey("externalId")) "PRESENT" else "ABSENT"}" +
                    " | externalInventory=${product["isTrackInventoryExternal"] ?: "ABSENT"}" +
                    " | createdAt=${primitive(product, "createdAt") ?: "ABSENT"}" +
                    " | source=${primitive(product, "source") ?: "ABSENT"}"
            )
        }

        println("Diagnostic complete. Ten product GET requests only.")
    }


    
    
    private fun inspectEntireTestLabCatalogCurrency(
        catalogs: List<CatalogInspection>,
        config: ProductionConfig,
        transport: PoyntCloudHttpTransport,
        authorization: String
    ) {
        println("=== FULL TEST LAB CATALOG CURRENCY AUDIT ===")

        val assignedCatalogs = catalogs.filter {
            it.storeId == config.storeId && it.status == "FOUND"
        }

        val paginatedProducts = mutableMapOf<String, JsonObject>()
        var offset = 0
        var completed = false

        // Read the business-wide product listing.
        repeat(50) {
            if (completed) return@repeat

            val response = transport.get(
                transport.productsUri(config.businessId, offset),
                authorization
            )

            if (response.statusCode != 200) {
                println("Products API failed: HTTP ${response.statusCode}")
                return
            }

            val root = parseObject(response.body, "Products page") ?: return
            val items = (root["products"] ?: root["items"]) as? JsonArray
                ?: return

            items.filterIsInstance<JsonObject>().forEach { product ->
                primitive(product, "id")?.let { id ->
                    paginatedProducts[id] = product
                }
            }

            offset += items.size
            if (items.size < 100) completed = true
        }

        println("Business products retrieved: ${paginatedProducts.size}")
        if (!completed) {
            println("WARNING: Products pagination incomplete; comparison is partial")
        }

        val allEntries = assignedCatalogs.flatMap { catalog ->
            catalog.products.map { product -> catalog to product }
        }

        println("Catalog entries inspected: ${allEntries.size}")
        println("Distinct product IDs: ${allEntries.map { it.second.id }.distinct().size}")

        assignedCatalogs.forEach { catalog ->
            println("=== CATALOG: ${safe(catalog.catalogName)} ===")

            val products = catalog.products.sortedWith(
                compareBy<CatalogProduct> { it.name.orEmpty().lowercase() }
                    .thenBy { it.sku }
                    .thenBy { it.id }
            )

            val counts = products.groupingBy {
                it.currency?.uppercase() ?: "MISSING"
            }.eachCount()

            println("Total entries: ${products.size}")
            println("Currency distribution: $counts")

            products.forEach { item ->
                val direct = paginatedProducts[item.id]
                val variant = if (item.variantId != null) {
                    (direct?.get("variants") as? JsonArray)
                        ?.filterIsInstance<JsonObject>()
                        ?.firstOrNull {
                            primitive(it, "id") == item.variantId
                        }
                } else null

                val priceNode = when {
                    direct == null -> null
                    item.variantId == null -> direct["price"]
                    variant != null -> variant["price"] ?: direct["price"]
                    else -> null
                }

                val apiAmount = priceAmount(priceNode)
                val apiCurrency = if (priceNode != null) {
                    observedCurrency(priceNode, "\$.price").value
                } else null

                val result = when {
                    direct == null -> "NOT_FOUND_IN_BUSINESS_PRODUCTS"
                    item.variantId != null && variant == null ->
                        "VARIANT_NOT_VERIFIED"
                    item.currency == null || apiCurrency == null ->
                        "CURRENCY_NOT_EXPOSED"
                    !item.currency.equals(apiCurrency, ignoreCase = true) ->
                        "CURRENCY_MISMATCH"
                    item.priceMinor != apiAmount ->
                        "PRICE_MISMATCH"
                    else -> "MATCH"
                }

                println(
                    "PRODUCT | ${safe(item.name)}" +
                        " | SKU=${safe(item.sku)}" +
                        " | ID=${item.id}" +
                        " | VARIANT=${safe(item.variantId)}" +
                        " | CATALOG=${item.priceMinor ?: "NA"} ${safe(item.currency)}" +
                        " | API=${apiAmount ?: "NA"} ${safe(apiCurrency)}" +
                        " | RESULT=$result"
                )
            }
        }

        val unique = allEntries.distinctBy {
            it.second.id to it.second.variantId
        }

        println("=== OVERALL CURRENCY SUMMARY ===")

        unique.groupBy {
            it.second.currency?.uppercase() ?: "MISSING"
        }.toSortedMap().forEach { (currency, products) ->
            println("$currency: ${products.size} distinct product/variant entries")
        }

        val conflictingIds = allEntries.groupBy { it.second.id }
            .filterValues { entries ->
                entries.mapNotNull {
                    it.second.currency?.uppercase()
                }.distinct().size > 1
            }

        println("Cross-catalog currency conflicts: ${conflictingIds.size}")

        conflictingIds.forEach { (id, entries) ->
            println(
                "CONFLICT | ID=$id | " +
                    entries.joinToString(" | ") {
                        "${safe(it.first.catalogName)}:" +
                            "${safe(it.second.currency)}"
                    }
            )
        }

        println("=== END FULL CATALOG CURRENCY AUDIT ===")
    }

    
    private fun inspectCadProductComparison(
        catalogs: List<CatalogInspection>,
        config: ProductionConfig,
        transport: PoyntCloudHttpTransport,
        authorization: String
    ) {
        println("=== Poynt USD versus CAD product comparison (GET only) ===")

        val blueberryCatalogs = catalogs.filter { catalog ->
            catalog.storeId == config.storeId &&
                catalog.status == "FOUND" &&
                catalog.products.any {
                    it.id == BLUEBERRY_CHEESECAKE_PRODUCT_ID
                }
        }

        if (blueberryCatalogs.isEmpty()) {
            println("No verified Blueberry Cheesecake catalog found")
            return
        }

        val candidates = blueberryCatalogs.flatMap { catalog ->
            catalog.products
                .filter { product ->
                    product.id != BLUEBERRY_CHEESECAKE_PRODUCT_ID &&
                        product.variantId == null &&
                        product.currency.equals("CAD", ignoreCase = true) &&
                        product.priceMinor != null
                }
                .map { catalog to it }
        }.distinctBy { (_, product) -> product.id }

        println("CAD product candidates found: ${candidates.size}")

        if (candidates.isEmpty()) {
            println("No explicit CAD-priced product found in the same catalogs")
            println("Cannot establish a CAD product comparison from these catalogs")
            return
        }

        candidates.take(10).forEach { (catalog, product) ->
            println(
                "CAD candidate: name=${safe(product.name)}, " +
                    "SKU=${safe(product.sku)}, " +
                    "catalog=${safe(catalog.catalogName)}, " +
                    "amount=${product.priceMinor}, " +
                    "currency=${product.currency}"
            )
        }

        // Verify up to five CAD candidates against the individual Product API.
        candidates.take(5).forEach { (catalog, product) ->
            if (!product.id.matches(Regex("[A-Za-z0-9_-]{1,150}"))) {
                println("CAD candidate skipped: invalid product ID format")
                return@forEach
            }

            val response = transport.get(
                transport.productUri(config.businessId, product.id),
                authorization
            )

            println(
                "Product ${safe(product.name)} direct GET HTTP ${response.statusCode}"
            )

            if (response.statusCode != 200) return@forEach

            val direct = parseObject(response.body, "CAD candidate product")
                ?: return@forEach

            if (primitive(direct, "id") != product.id) {
                println("Direct product identity mismatch")
                return@forEach
            }

            val directPrice = direct["price"]
            val directCurrency = observedCurrency(directPrice, "\$.price")

            println("Product: ${safe(product.name)}")
            println("Catalog: ${safe(catalog.catalogName)}")
            println("Catalog price: ${product.priceMinor} ${safe(product.currency)}")
            println(
                "Direct API price: ${priceAmount(directPrice) ?: "NOT_EXPOSED"} " +
                    safe(directCurrency.value)
            )

            val result = when {
                !directCurrency.value.equals("CAD", ignoreCase = true) ->
                    "CURRENCY_MISMATCH"
                priceAmount(directPrice) != product.priceMinor ->
                    "AMOUNT_MISMATCH"
                else -> "CAD_CONFIRMED_IN_BOTH_ENDPOINTS"
            }

            println("Comparison result: $result")
            println("Creation method: NOT_VERIFIED_FROM_API")
        }
    }

    @Test
    fun discoverProductionDeviceCatalogs() {
        if (System.getenv("POYNT_PROD_CATALOG_DISCOVERY") != "true") {
            println("Poynt production catalog discovery: SKIPPED")
            return
        }

        val config = configuration()
        val transport = PoyntCloudHttpTransport(config.baseUrl, API_VERSION)
        // Configuration checks run before AWS credential retrieval or any Poynt request.
        val token = PoyntTokenService(
            credentials = AwsSecretsManagerPoyntCredentialResolver(config.awsRegion),
            transport = PoyntCloudTokenTransport(config.baseUrl, API_VERSION),
            audience = config.baseUrl,
        ).token(
            PoyntCatalogConfiguration(
                integrationConfigurationId = "production-pos-catalog-discovery",
                organizationId = "production-pos-catalog-discovery",
                applicationId = config.applicationId,
                businessId = config.businessId,
                providerStoreId = null,
                secretReference = config.secretReference,
                merchantCurrencyCode = "CAD",
                lastIncrementalSyncAt = null,
            ),
        )
        val authorization = "${token.tokenType} ${token.value}"

        val businessResponse = transport.get(
            URI.create("${config.baseUrl}/businesses/${config.businessId}?ignoreDeactivatedDevices=false"),
            authorization,
        )
        println("Business GET HTTP ${businessResponse.statusCode}")
        if (businessResponse.statusCode != 200) {
            println("Business result: ${classify(businessResponse.statusCode)}")
            println("Business error code: ${safeErrorCode(businessResponse.body)}")
            return
        }

        val business = parseObject(businessResponse.body, "Business") ?: return
        val returnedBusinessId = primitive(business, "id")
        assertEquals(config.businessId, returnedBusinessId, "Configured production business did not match Poynt")

        // Always inspect the independently configured production store, even if
        // the Business response omits embedded stores or device/store links.
        val stores = linkedMapOf<String, StoreDocument>()
        val candidateStoreIds = linkedSetOf(config.storeId).apply { addAll(storeIds(business)) }
        println("Business device array counts: ${deviceArraySummary(business)}")
        println("Store IDs to inspect: ${candidateStoreIds.size} (configured production store included)")
        candidateStoreIds.forEach { storeId ->
            val response = transport.get(transport.storeUri(config.businessId, storeId), authorization)
            println("Store ${mask(storeId)} GET HTTP ${response.statusCode}")
            val store = if (response.statusCode == 200) {
                parseObject(response.body, "Store ${mask(storeId)}")
            } else {
                println("Store ${mask(storeId)} result: ${classify(response.statusCode)}")
                null
            }
            if (store != null && primitive(store, "id") == storeId) {
                stores[storeId] = StoreDocument(storeId, store, response.statusCode)
                println("Store ${mask(storeId)} device array counts: ${deviceArraySummary(store)}")
            } else if (store != null) {
                println("Store ${mask(storeId)} identity: MISMATCH")
            }
        }
        check(config.storeId in stores) {
            "Configured production store could not be verified by read-only Store GET"
        }

        val devices = (devicesIn(business) + stores.values.flatMap { devicesIn(it.document) })
            .distinctBy(::deviceIdentity)
        println("Recognized device records: ${devices.size}")
        devices.take(20).forEachIndexed { index, device ->
            printDeviceDiagnostic(index + 1, device)
        }
        if (devices.size > 20) println("Further device records omitted from diagnostics")

        val ajax = devices.firstOrNull { deviceName(it).equals("AJAX", ignoreCase = true) }
        val osc = devices.firstOrNull { deviceName(it).equals("OSC", ignoreCase = true) }

        println("Device-specific catalog endpoint: NOT_EXPOSED_BY_CONFIGURED_TRANSPORT")
        val ajaxCatalog = inspectDevice("AJAX", ajax, config, transport, authorization)
        val oscCatalog = inspectDevice("OSC", osc, config, transport, authorization)
        inspectBlueberryCheesecakeCurrency(
            listOf(ajaxCatalog, oscCatalog),
            business,
            stores.values.map(StoreDocument::document),
        )
        inspectSharedSku(config.sharedSku, ajaxCatalog, oscCatalog)
        val complete = ajaxCatalog.status == "FOUND" && oscCatalog.status == "FOUND"
        println("Catalog assignment outcome: ${if (complete) "BOTH_CATALOGS_RETRIEVED" else "DISCOVERY_INCOMPLETE"}")
        println("Product membership and authoritative per-terminal prices: NOT_YET_VERIFIED")
        println("Poynt production catalog discovery complete. GET requests only.")
    }

    private fun inspectDevice(
        label: String,
        device: JsonObject?,
        config: ProductionConfig,
        transport: PoyntCloudHttpTransport,
        authorization: String,
    ): CatalogInspection {
        if (device == null) {
            println("$label device: NOT_FOUND")
            return CatalogInspection(label, null, null, null, null, "NOT_FOUND", "NOT_EXPOSED", emptyList())
        }

        val deviceId = firstPrimitive(device, "deviceId", "id")
        val storeId = firstPrimitive(device, "storeId", "merchantStoreId")
        val assignment = catalogAssignment(device)
        println("$label device ID: ${mask(deviceId)}")
        println("$label Poynt Store ID: ${mask(storeId)}")

        val catalogId = assignment.catalogId
        if (catalogId == null) {
            println("$label assigned catalog ID: ${assignment.status}")
            return CatalogInspection(label, deviceId, storeId, null, null, assignment.status, "NOT_EXPOSED", emptyList())
        }

        val response = transport.get(transport.catalogFullUri(config.businessId, catalogId), authorization)
        println("$label catalog ${mask(catalogId)} GET HTTP ${response.statusCode}")
        if (response.statusCode != 200) {
            println("$label catalog result: ${classify(response.statusCode)}")
            println("$label catalog error code: ${safeErrorCode(response.body)}")
            return CatalogInspection(label, deviceId, storeId, catalogId, null, classify(response.statusCode), "UNKNOWN", emptyList())
        }

        val catalog = parseObject(response.body, "$label catalog")
            ?: return CatalogInspection(label, deviceId, storeId, catalogId, null, "UNKNOWN", "UNKNOWN", emptyList())
        val catalogName = firstPrimitive(catalog, "name", "catalogName")
        val products = catalogProducts(catalog, label)
        val matcha = products.values.filter { it.sku.equals(MATCHA_COOKIE_SKU, ignoreCase = true) }
        // Compare only unambiguous catalog IDs to the business-product endpoint.
        // These are read-only GET requests and do not establish price authority.
        listOf(MATCHA_COOKIE_SKU, config.sharedSku).filterNotNull().distinct().forEach { sku ->
            val matches = products.values.filter { it.sku.equals(sku, ignoreCase = true) }
            if (matches.size == 1) compareBusinessProduct(label, sku, matches.single(), config, transport, authorization)
            else println("$label business price comparison $sku: UNKNOWN (catalog SKU match count=${matches.size})")
        }
        println("$label assigned catalog ID: ${mask(catalogId)}")
        println("$label catalog name: ${safe(catalogName)}")
        printSkuResult(label, "Matcha Cookie", MATCHA_COOKIE_SKU, products.status, matcha)
        return CatalogInspection(label, deviceId, storeId, catalogId, catalogName, "FOUND", products.status, products.values)
    }

    private fun inspectSharedSku(
        sku: String?,
        ajax: CatalogInspection,
        osc: CatalogInspection,
    ) {
        if (sku == null) {
            println("Shared SKU comparison: UNKNOWN (POYNT_PROD_SHARED_SKU is not set)")
            return
        }
        println("Shared SKU comparison: ${safe(sku)}")
        printSkuResult("AJAX", "Shared SKU", sku, ajax.productListStatus, ajax.products.filter { it.sku.equals(sku, ignoreCase = true) })
        printSkuResult("OSC", "Shared SKU", sku, osc.productListStatus, osc.products.filter { it.sku.equals(sku, ignoreCase = true) })
    }

    /**
     * Reports only allowlisted price and currency fields from the catalog GETs
     * already performed above. It never applies a Memgine currency fallback:
     * a missing Poynt currency remains NOT_EXPOSED.
     */
    private fun inspectBlueberryCheesecakeCurrency(
        catalogs: List<CatalogInspection>,
        business: JsonObject,
        stores: List<JsonObject>,
    ) {
        val matches = catalogs.flatMap { catalog ->
            catalog.products.filter { product ->
                product.id == BLUEBERRY_CHEESECAKE_PRODUCT_ID &&
                    product.sku.equals(BLUEBERRY_CHEESECAKE_SKU, ignoreCase = true)
            }.map { catalog to it }
        }
        when {
            matches.isEmpty() -> {
                println("Blueberry Cheesecake catalog entry: NOT_FOUND_IN_PARSED_CATALOG_ENTRIES")
                println("Memgine currency fallback: NOT_USED")
            }
            matches.size > 1 -> {
                println("Blueberry Cheesecake catalog entry: UNKNOWN (multiple matching entries)")
                matches.forEach { (catalog, product) -> printTargetCurrency(catalog, product) }
                println("Memgine currency fallback: NOT_USED")
            }
            else -> {
                val (catalog, product) = matches.single()
                printTargetCurrency(catalog, product)
                if (product.currency == null) {
                    println("Poynt product currency: NOT_EXPOSED")
                    printConfiguredCurrency("business", business)
                    stores.forEachIndexed { index, store ->
                        printConfiguredCurrency("store[$index]", store)
                    }
                }
                println("Memgine currency fallback: NOT_USED")
            }
        }
    }

    private fun printTargetCurrency(catalog: CatalogInspection, product: CatalogProduct) {
        println("Blueberry Cheesecake catalog: ${safe(catalog.label)}")
        println("Blueberry Cheesecake external product ID: ${safe(product.id)}")
        println("Blueberry Cheesecake SKU: ${safe(product.sku)}")
        println("Blueberry Cheesecake name: ${safe(product.name)}")
        println(
            "Poynt product price: ${product.priceMinor?.toString() ?: "NOT_EXPOSED"} " +
                "(JSON path: ${product.pricePath ?: "NOT_EXPOSED"})",
        )
        println(
            "Poynt product currency: ${safe(product.currency)} " +
                "(JSON path: ${product.currencyPath ?: "NOT_EXPOSED"})",
        )
        println("Expected Test Merchant UI price: CAD 4.89 (489 minor units); diagnostic only")
    }

    private fun printConfiguredCurrency(scope: String, document: JsonObject) {
        val paths = listOf(
            "\$.currency" to primitive(document, "currency"),
            "\$.currencyCode" to primitive(document, "currencyCode"),
            "\$.merchantCurrency" to primitive(document, "merchantCurrency"),
            "\$.merchantCurrencyCode" to primitive(document, "merchantCurrencyCode"),
            "\$.defaultCurrency" to primitive(document, "defaultCurrency"),
            "\$.defaultCurrencyCode" to primitive(document, "defaultCurrencyCode"),
        ).filter { (_, value) -> !value.isNullOrBlank() }
        if (paths.isEmpty()) {
            println("Poynt $scope currency configuration: NOT_EXPOSED")
        } else {
            paths.forEach { (path, value) ->
                println("Poynt $scope currency configuration: ${safe(value)} (JSON path: $path)")
            }
        }
    }

    /** Three independent GET response sources; never infer missing currency from configuration. */
    private fun inspectTestLabCurrencyComparison(
        catalogs: List<CatalogInspection>,
        business: JsonObject,
        store: JsonObject,
        config: ProductionConfig,
        transport: PoyntCloudHttpTransport,
        authorization: String,
    ) {
        val matches = catalogs.flatMap { it.products }
            .filter { it.id == BLUEBERRY_CHEESECAKE_PRODUCT_ID && it.sku.equals(BLUEBERRY_CHEESECAKE_SKU, true) }
        val unique = matches.distinctBy { listOf(it.id, it.sku, it.priceMinor, it.currency, it.currencyFieldState) }
        val catalogCurrency = unique.singleOrNull()?.currency
        println("=== Poynt Test Lab currency comparison (GET only) ===")
        if (unique.size != 1) {
            println("Full catalog product: INCONCLUSIVE (matching entries=${matches.size}, distinct representations=${unique.size})")
        } else {
            val item = unique.single()
            println("Full catalog product price: ${item.priceMinor ?: "NOT_EXPOSED"} (path: ${item.pricePath ?: "NOT_EXPOSED"})")
            println("Full catalog product currency: ${safe(item.currency)} (field: ${item.currencyFieldState}, path: ${item.currencyPath ?: "NOT_EXPOSED"})")
        }

        val response = transport.get(
            transport.productUri(config.businessId, BLUEBERRY_CHEESECAKE_PRODUCT_ID),
            authorization,
        )
        println("Business product GET HTTP ${response.statusCode}")
        var businessProductCurrency: String? = null
        var businessProductVerified = false
        if (response.statusCode == 200) {
            val product = parseObject(response.body, "Blueberry business product")
            if (product != null && primitive(product, "id") == BLUEBERRY_CHEESECAKE_PRODUCT_ID &&
                primitive(product, "sku")?.equals(BLUEBERRY_CHEESECAKE_SKU, true) == true
            ) {
                businessProductVerified = true
                val priceNode = product["price"]
                val observation = observedCurrency(priceNode, "\$.price")
                businessProductCurrency = observation.value
                println("Business product price: ${priceAmount(priceNode) ?: "NOT_EXPOSED"} (path: \$.price.amount)")
                println("Business product currency: ${safe(observation.value)} (field: ${observation.state}, path: ${observation.path})")
            } else {
                println("Business product: INCONCLUSIVE (ID/SKU identity mismatch or unparseable response)")
            }
        } else {
            println("Business product: ${classify(response.statusCode)}")
        }

        val businessCurrencies = printCurrencyFields("Business GET", business)
        val storeCurrencies = printCurrencyFields("Store GET", store)
        val storeCurrency = storeCurrencies.mapNotNull { it.second }.distinct().singleOrNull()
        val businessCurrency = businessCurrencies.mapNotNull { it.second }.distinct().singleOrNull()
        println("Full catalog product currency summary: ${safe(catalogCurrency)}")
        println("Business product currency summary: ${if (businessProductVerified) safe(businessProductCurrency) else "UNKNOWN"}")
        println("Poynt business currency summary: ${safe(businessCurrency)}")
        println("Poynt Store currency summary: ${safe(storeCurrency)}")
        println("Memgine configured currency: CAD (test diagnostic configuration, NOT provider response)")
        val currencies = listOfNotNull(catalogCurrency, businessProductCurrency, businessCurrency, storeCurrency).distinct()
        val complete = unique.size == 1 && businessProductVerified &&
            catalogCurrency != null && businessProductCurrency != null && storeCurrency != null
        println("Currency mismatch detected: ${when {
            currencies.size > 1 -> "YES (explicit provider response values differ)"
            complete -> "NO (all required exposed values agree)"
            else -> "INCONCLUSIVE (one or more sources missing or ambiguous)"
        }}")
        println("Memgine currency fallback: NOT_USED")
    }

    /** Inspect the exact paginated GET used by PoyntCommerceProvider.syncCatalog(), without mapping or writing. */
    private fun inspectPaginatedProductCurrency(
        config: ProductionConfig,
        transport: PoyntCloudHttpTransport,
        authorization: String,
    ) {
        println("=== Poynt syncCatalog paginated product currency (GET only) ===")
        var offset = 0
        val pageSize = 100
        val seenOffsets = mutableSetOf<Int>()
        var pageCount = 0
        while (pageCount < 20 && seenOffsets.add(offset)) {
            // Match PoyntCommerceProvider.syncCatalog() exactly; no fallback or mapping is applied.
            val response = transport.get(transport.productsUri(config.businessId, offset), authorization)
            println("Paginated products GET offset=$offset HTTP ${response.statusCode}")
            if (response.statusCode != 200) {
                println("Paginated products result: ${classify(response.statusCode)}")
                return
            }
            val root = parseObject(response.body, "Paginated products") ?: return
            val array = (root["products"] ?: root["items"]) as? JsonArray
            if (array == null) {
                println("Paginated products: UNKNOWN (products/items array missing)")
                return
            }
            val matches = array.mapNotNull { it as? JsonObject }.filter {
                primitive(it, "id") == BLUEBERRY_CHEESECAKE_PRODUCT_ID &&
                    primitive(it, "sku")?.equals(BLUEBERRY_CHEESECAKE_SKU, ignoreCase = true) == true
            }
            if (matches.size > 1) {
                println("Target product: INCONCLUSIVE (multiple ID/SKU matches on page)")
                return
            }
            if (matches.size == 1) {
                val item = matches.single()
                val price = item["price"]
                val observation = observedCurrency(price, "\$.price")
                val configuredCurrency = "CAD" // Test Lab PoyntCatalogConfiguration.merchantCurrencyCode
                println("Target ID/SKU: VERIFIED")
                println("Raw paginated price.amount: ${priceAmount(price) ?: "NOT_EXPOSED"} (path: \$.price.amount)")
                println("Raw paginated price.currency: ${safe(observation.value)} (field: ${observation.state}, path: ${observation.path})")
                println("Memgine configured currency: $configuredCurrency (configuration, NOT provider response)")
                println("Currency from current mapProduct() logic: ${(observation.value ?: configuredCurrency).trim().uppercase()}" )
                println("Currency fallback applied: ${if (observation.value == null) "YES" else "NO"}")
                return
            }
            pageCount++
            if (array.size < pageSize) {
                println("Target product: NOT_FOUND_IN_PAGINATED_RESULTS")
                return
            }
            offset += array.size
        }
        println("Target product: INCONCLUSIVE (page scan safety limit reached)")
    }

    /** Existing persisted Test Lab order only; strictly one GET, no state mutation. */
    private fun inspectTestLabOrderCurrency(
        config: ProductionConfig,
        store: JsonObject,
        transport: PoyntCloudHttpTransport,
        authorization: String,
    ) {
        val orderId = TEST_LAB_REDEMPTION_ORDER_ID
        println("=== Poynt Test Lab existing order currency (GET only) ===")
        val response = transport.get(
            URI.create("${config.baseUrl}/businesses/${config.businessId}/orders/$orderId"),
            authorization,
        )
        println("Existing Poynt order GET HTTP ${response.statusCode}")
        if (response.statusCode != 200) {
            println("Existing Poynt order: ${classify(response.statusCode)}")
            println("Existing Poynt order error code: ${safeErrorCode(response.body)}")
            return
        }
        val order = parseObject(response.body, "Existing Poynt order") ?: return
        if (primitive(order, "id") != orderId) {
            println("Existing Poynt order: INCONCLUSIVE (returned order ID does not match)")
            return
        }
        val orderBusiness = primitive(order, "businessId")
        if (orderBusiness != null && orderBusiness != config.businessId) {
            println("Existing Poynt order: INCONCLUSIVE (business ID mismatch)")
            return
        }
        val context = order["context"] as? JsonObject
        val contextBusiness = context?.let { primitive(it, "businessId") }
        val contextStore = context?.let { primitive(it, "storeId") }
        if ((contextBusiness != null && contextBusiness != config.businessId) ||
            (contextStore != null && contextStore != config.storeId)) {
            println("Existing Poynt order: INCONCLUSIVE (order context business/store mismatch)")
            return
        }
        println("Existing Poynt order identity: VERIFIED")
        println("Existing Poynt order context Store: ${if (contextStore == null) "NOT_EXPOSED" else "MATCHED"}")
        val amounts = order["amounts"] as? JsonObject
        val amountCurrency = observedCurrency(order["amounts"], "\$.amounts")
        println("Order amounts currency: ${safe(amountCurrency.value)} (field: ${amountCurrency.state}, path: ${amountCurrency.path})")
        for (field in listOf("subTotal", "discountTotal", "taxTotal", "netTotal")) {
            val value = (amounts?.get(field) as? JsonPrimitive)?.let { if (it.isString) null else it.longOrNull }
            println("Order amounts $field: ${value ?: "NOT_EXPOSED"} (path: \$.amounts.$field)")
        }
        val items = order["items"] as? JsonArray
        if (items == null) {
            println("Order line items: NOT_EXPOSED")
        } else {
            println("Order line item count: ${items.size}")
            items.take(20).forEachIndexed { i, node ->
                val item = node as? JsonObject
                val direct = item?.let { observedCurrency(it["price"], "\$.items[$i].price") }
                val itemAmounts = item?.let { observedCurrency(it["amounts"], "\$.items[$i].amounts") }
                val scalar = item?.let { observedScalarCurrency(it, "\$.items[$i]") }
                println("Order item[$i] price currency: ${direct?.let { safe(it.value) + " (" + it.state + ", " + it.path + ")" } ?: "NOT_EXPOSED"}")
                println("Order item[$i] amounts currency: ${itemAmounts?.let { safe(it.value) + " (" + it.state + ", " + it.path + ")" } ?: "NOT_EXPOSED"}")
                println("Order item[$i] direct currency: ${scalar?.let { safe(it.value) + " (" + it.state + ", " + it.path + ")" } ?: "NOT_EXPOSED"}")
            }
            if (items.size > 20) println("Remaining order items omitted from diagnostic")
        }
        val transactions = order["transactions"] as? JsonArray
        println("Order linked transaction count: ${transactions?.size ?: "NOT_EXPOSED"}")
        transactions?.take(10)?.forEachIndexed { i, node ->
            val amountsNode = (node as? JsonObject)?.get("amounts")
            val currency = observedCurrency(amountsNode, "\$.transactions[$i].amounts")
            println("Order linked transaction[$i] amounts currency: ${safe(currency.value)} (field: ${currency.state}, path: ${currency.path})")
        }
        val storeCurrency = primitive(store, "currency")
        println("Poynt Store currency (GET): ${safe(storeCurrency)}")
        println("Order and Store currency mismatch: ${when {
            amountCurrency.value == null || storeCurrency == null -> "INCONCLUSIVE (currency missing)"
            amountCurrency.value == storeCurrency -> "NO (values agree)"
            else -> "YES (order=${safe(amountCurrency.value)}, store=${safe(storeCurrency)})"
        }}")
    }

    private fun observedScalarCurrency(node: JsonObject, path: String): CurrencyObservation {
        val field = node["currency"]
        return CurrencyObservation(
            (field as? JsonPrimitive)?.contentOrNull?.takeIf(String::isNotBlank),
            when (field) { null -> "ABSENT"; JsonNull -> "EXPLICIT_NULL"; is JsonPrimitive -> "PRESENT"; else -> "UNEXPECTED_TYPE" },
            "$path.currency",
        )
    }

    private data class CurrencyObservation(val value: String?, val state: String, val path: String)

    private fun observedCurrency(node: JsonElement?, path: String): CurrencyObservation {
        val obj = node as? JsonObject ?: return CurrencyObservation(null, when (node) {
            null -> "ABSENT"
            JsonNull -> "EXPLICIT_NULL"
            else -> "NOT_OBJECT"
        }, "$path.currency")
        val field = obj["currency"]
        return CurrencyObservation(
            (field as? JsonPrimitive)?.contentOrNull?.takeIf(String::isNotBlank),
            when (field) { null -> "ABSENT"; JsonNull -> "EXPLICIT_NULL"; is JsonPrimitive -> "PRESENT"; else -> "UNEXPECTED_TYPE" },
            "$path.currency",
        )
    }

    /** Print only named currency fields and ISO currency codes, never arbitrary values or raw documents. */
    private fun printCurrencyFields(label: String, root: JsonObject): List<Pair<String, String?>> {
        val found = mutableListOf<Pair<String, String?>>()
        val allowed = setOf("currency", "currencyCode", "merchantCurrency", "merchantCurrencyCode", "defaultCurrency", "defaultCurrencyCode")
        var inspected = 0
        fun walk(node: JsonElement, path: String, depth: Int) {
            if (depth > 5 || ++inspected > 500) return
            when (node) {
                is JsonObject -> node.forEach { (key, value) ->
                    val next = "$path.$key"
                    if (key in allowed) {
                        val valueString = (value as? JsonPrimitive)?.contentOrNull
                        val currency = valueString?.takeIf { it.matches(Regex("[A-Z]{3}")) }
                        found.add(next to currency)
                        println("$label currency field $next: ${currency ?: if (value == JsonNull) "EXPLICIT_NULL" else "PRESENT_NON_ISO_OR_NON_SCALAR"}")
                    }
                    if (value is JsonObject || value is JsonArray) walk(value, next, depth + 1)
                }
                is JsonArray -> node.take(20).forEachIndexed { i, value -> walk(value, "$path[$i]", depth + 1) }
                else -> Unit
            }
        }
        walk(root, "\$", 0)
        if (found.isEmpty()) println("$label currency fields: NOT_EXPOSED")
        return found
    }

    private fun printSkuResult(
        device: String,
        description: String,
        sku: String,
        productListStatus: String,
        matches: List<CatalogProduct>,
    ) {
        when {
            productListStatus == "NOT_EXPOSED" -> println("$device $description $sku: NOT_EXPOSED")
            matches.size > 1 -> println("$device $description $sku: UNKNOWN (multiple entries; may represent variants)")
            matches.size == 1 -> {
                val product = matches.single()
                println("$device $description $sku: PRESENT_IN_PARSED_ENTRIES (completeness=$productListStatus)")
                println("$device external product ID: ${mask(product.id)}; variant ID: ${mask(product.variantId)}; origin: ${product.origin}")
                println("$device raw catalog-entry price amount (minor units, authority unverified): ${product.priceMinor?.toString() ?: "NOT_EXPOSED"} ${safe(product.currency)}")
            }
            else -> println("$device $description $sku: UNKNOWN (not in parsed entries; completeness=$productListStatus)")
        }
    }

    private fun configuration(): ProductionConfig {
        val integrationName = required("POYNT_PROD_POS_INTEGRATION_NAME")
        require(integrationName == "POS") {
            "POYNT_PROD_POS_INTEGRATION_NAME must identify the POS integration"
        }
        val baseUrl = (System.getenv("POYNT_PROD_API_BASE_URL") ?: PRODUCTION_BASE_URL).trim().removeSuffix("/")
        require(baseUrl == PRODUCTION_BASE_URL) {
            "POYNT_PROD_API_BASE_URL must be the Poynt production services host"
        }
        // Independent operator confirmation prevents accidentally targeting TestLab.
        // These environment variables are not fetched from or verified against Memgine DB.
        val businessId = required("POYNT_PROD_POS_BUSINESS_ID")
        val storeId = required("POYNT_PROD_POS_STORE_ID")
        require(storeId.matches(Regex("[A-Za-z0-9_-]{1,100}"))) {
            "Invalid POYNT_PROD_POS_STORE_ID format"
        }
        val confirmedBusinessId = required("POYNT_PROD_EXPECTED_BUSINESS_ID")
        require(businessId == confirmedBusinessId) {
            "Production business ID does not match the independently confirmed business ID"
        }
        val secretReference = required("POYNT_PROD_POS_SECRET_REFERENCE")
        require(secretReference.startsWith("memgine/dev/poynt/") &&
            !secretReference.startsWith("memgine/dev/poynt-dev/")) {
            "Unexpected POS secret reference; verify the original production POS configuration"
        }
        val applicationId = required("POYNT_PROD_POS_APPLICATION_ID")
        require(applicationId.startsWith("urn:aid:")) { "Invalid Poynt application ID format" }
        return ProductionConfig(
            baseUrl = baseUrl,
            applicationId = applicationId,
            businessId = businessId,
            storeId = storeId,
            secretReference = secretReference,
            awsRegion = required("POYNT_PROD_AWS_REGION"),
            sharedSku = System.getenv("POYNT_PROD_SHARED_SKU")?.trim()?.takeIf { it.isNotEmpty() },
        )
    }

    private fun testLabCurrencyConfiguration() = ProductionConfig(
        baseUrl = PRODUCTION_BASE_URL,
        applicationId = "urn:aid:fb9d62bd-12ab-4520-bf9e-54617622ed5f",
        businessId = "08ecfebe-ad09-4afa-9974-81deb66b131e",
        storeId = "8ecb77f6-9197-4e61-88e9-950ab428f8a7",
        secretReference = "memgine/dev/poynt-dev/cloud-app",
        awsRegion = "ca-central-1",
        sharedSku = null,
    )

    private fun required(name: String): String = System.getenv(name)?.trim()?.takeIf { it.isNotEmpty() }
        ?: error("Missing environment variable: $name")

    private fun parseObject(body: String, operation: String): JsonObject? = runCatching {
        Json.parseToJsonElement(body) as? JsonObject
    }.getOrNull().also { objectValue ->
        if (objectValue == null) println("$operation result: UNKNOWN (non-object JSON response)")
    }

    private fun deviceArraySummary(document: JsonObject): String =
        listOf("storeDevices", "devices").joinToString(", ") { field ->
            val value = document[field]
            val count = when (value) {
                null -> "NOT_EXPOSED"
                is JsonArray -> value.size.toString()
                else -> "NOT_AN_ARRAY"
            }
            "$field=$count"
        }

    /** Allowlisted, bounded diagnostics only. Never print entire Poynt JSON objects. */
    private fun printDeviceDiagnostic(index: Int, device: JsonObject) {
        val name = deviceName(device)
        val assignment = catalogAssignment(device)
        val presentFields = listOf(
            "id", "deviceId", "storeId", "merchantStoreId", "deviceName", "name",
            "displayName", "terminalName", "externalTerminalId", "catalogId",
            "productCatalogId", "catalog", "productCatalog", "catalogIds",
        ).filter(device::containsKey)
        println("Device $index recognized fields: ${presentFields.joinToString(", ")}")
        println("Device $index name: ${safe(name)}")
        println("Device $index ID: ${mask(firstPrimitive(device, "deviceId", "id"))}")
        println("Device $index external terminal ID: ${mask(primitive(device, "externalTerminalId"))}")
        println("Device $index store ID: ${mask(firstPrimitive(device, "storeId", "merchantStoreId"))}")
        println("Device $index catalog assignment: ${assignment.status} ${mask(assignment.catalogId)}")
    }

    private fun devicesIn(document: JsonObject): List<JsonObject> = listOf("storeDevices", "devices")
        .flatMap { field -> (document[field] as? JsonArray).orEmpty() }
        .mapNotNull { it as? JsonObject }

    private fun storeIds(document: JsonObject): Set<String> = buildSet {
        devicesIn(document).mapNotNullTo(this) { firstPrimitive(it, "storeId", "merchantStoreId") }
        ((document["stores"] as? JsonArray).orEmpty())
            .mapNotNullTo(this) { (it as? JsonObject)?.let { store -> primitive(store, "id") } }
    }

    private fun deviceIdentity(device: JsonObject): String =
        firstPrimitive(device, "deviceId", "id") ?: "${deviceName(device)}:${firstPrimitive(device, "storeId")}" 

    private fun deviceName(device: JsonObject): String =
        firstPrimitive(device, "deviceName", "name", "displayName", "terminalName") ?: ""

    private fun catalogAssignment(device: JsonObject): CatalogAssignment {
        val ids = linkedSetOf<String>()
        firstPrimitive(device, "catalogId", "productCatalogId")?.let(ids::add)
        listOf("catalog", "productCatalog").forEach { key ->
            (device[key] as? JsonObject)?.let { catalog -> primitive(catalog, "id")?.let(ids::add) }
        }
        listOf("catalogIds", "productCatalogIds", "catalogs", "productCatalogs").forEach { key ->
            when (val value = device[key]) {
                is JsonArray -> value.forEach { item ->
                    when (item) {
                        is JsonPrimitive -> item.contentOrNull?.let(ids::add)
                        is JsonObject -> primitive(item, "id")?.let(ids::add)
                        else -> Unit
                    }
                }
                else -> Unit
            }
        }
        return when (ids.size) {
            0 -> CatalogAssignment(null, "NOT_EXPOSED")
            1 -> CatalogAssignment(ids.single(), "FOUND")
            else -> CatalogAssignment(null, "UNKNOWN (multiple catalog IDs exposed)")
        }
    }

    /** Shape diagnostics for assigned full catalogs. Unknown associations stay UNKNOWN. */
    private fun catalogProducts(catalog: JsonObject, label: String): CatalogProducts {
        val rootKeys = listOf("id", "name", "catalogName", "products", "items", "categories", "next", "nextPage", "nextCursor", "hasMore", "hasNext", "totalCount", "total")
        println("$label catalog recognized root fields: ${rootKeys.filter(catalog::containsKey).joinToString(", ")}")
        val categories = catalog["categories"] as? JsonArray
        println("$label root categories: ${categories?.size?.toString() ?: "NOT_EXPOSED"}")
        val products = mutableListOf<CatalogProduct>()
        var unknown = false
        var inspected = 0
        var nestedCategoryCount = 0
        var itemCount = 0
        val sampleShapes = linkedSetOf<String>()
        val paginationKeys = listOf("next", "nextPage", "nextCursor", "hasMore", "hasNext", "totalCount", "total")
        if (paginationKeys.any(catalog::containsKey)) unknown = true
        fun inspectItem(item: kotlinx.serialization.json.JsonElement) {
            itemCount++
            val obj = item as? JsonObject
            if (obj == null) { unknown = true; return }
            if (sampleShapes.size < 5) {
                val allow = listOf("id", "productId", "product", "sku", "shortCode", "name", "price", "variants", "selectedVariants", "unitPrice")
                sampleShapes.add(allow.filter(obj::containsKey).joinToString(", ").ifEmpty { "UNRECOGNIZED" })
            }
            val embedded = obj["product"] as? JsonObject
            val id = firstPrimitive(obj, "productId") ?: firstPrimitive(embedded ?: obj, "id")
            val source = embedded ?: obj
            val variants = source["variants"] as? JsonArray
            val baseSku = firstPrimitive(source, "sku", "shortCode")
            val candidate = catalogProduct(source, id, baseSku, "CATALOG_ENTRY")
            if (candidate != null) products.add(candidate) else unknown = true
            variants?.forEach { variant ->
                val v = variant as? JsonObject
                if (v == null) { unknown = true; return@forEach }
                val sku = firstPrimitive(v, "sku") ?: baseSku
                val parsed = catalogProduct(v, id, sku, "CATALOG_VARIANT")
                if (parsed != null) products.add(parsed) else unknown = true
            }
            // Product IDs without SKU may require a separate product fetch, so keep outcome unknown.
        }
        fun inspectArray(array: JsonArray?) {
            if (array == null) return
            array.forEach(::inspectItem)
        }
        inspectArray(catalog["products"] as? JsonArray)
        inspectArray(catalog["items"] as? JsonArray)
        if (catalog["products"] != null && catalog["products"] !is JsonArray) unknown = true
        if (catalog["items"] != null && catalog["items"] !is JsonArray) unknown = true
        fun visitCategory(category: JsonObject, depth: Int) {
            if (depth > 15 || ++inspected > 3000) { unknown = true; return }
            nestedCategoryCount++
            if (sampleShapes.size < 5) {
                sampleShapes.add("CATEGORY: " + listOf("id", "name", "products", "items", "categories").filter(category::containsKey).joinToString(", "))
            }
            inspectArray(category["products"] as? JsonArray)
            inspectArray(category["items"] as? JsonArray)
            if (category["products"] != null && category["products"] !is JsonArray) unknown = true
            if (category["items"] != null && category["items"] !is JsonArray) unknown = true
            val children = category["categories"]
            if (children != null && children !is JsonArray) unknown = true
            (children as? JsonArray)?.forEach { child ->
                val obj = child as? JsonObject
                if (obj == null) unknown = true else visitCategory(obj, depth + 1)
            }
        }
        categories?.forEach { c ->
            val obj = c as? JsonObject
            if (obj == null) unknown = true else visitCategory(obj, 0)
        }
        if (catalog["categories"] != null && categories == null) unknown = true
        println("$label nested categories inspected: $nestedCategoryCount")
        println("$label catalog item entries inspected: $itemCount")
        println("$label recognized entry shapes (max 5): ${sampleShapes.joinToString(" | ")}")
        println("$label parsed SKU entries: ${products.size}")
        val hasContainer = categories != null || catalog["products"] is JsonArray || catalog["items"] is JsonArray
        // A missing or empty array is not proof that all catalog memberships were exposed.
        val status = if (!hasContainer) "NOT_EXPOSED" else if (unknown || itemCount == 0) "UNKNOWN" else "PARSED_NOT_VERIFIED_COMPLETE"
        println("$label catalog membership completeness: $status")
        return CatalogProducts(status, products.distinctBy { listOf(it.id, it.variantId, it.sku, it.priceMinor.toString()).joinToString(":") })
    }

    private fun catalogProduct(item: JsonObject, productId: String?, sku: String?, origin: String): CatalogProduct? {
        val id = productId ?: return null
        val normalizedSku = sku ?: return null
        val priceNode = item["price"] ?: item["unitPrice"]
        val priceRoot = if (item.containsKey("price")) "\$.price" else if (item.containsKey("unitPrice")) "\$.unitPrice" else null
        val amount = when (priceNode) {
            is JsonPrimitive -> if (priceNode.isString) null else priceNode.longOrNull
            is JsonObject -> (priceNode["amount"] as? JsonPrimitive)?.let { if (it.isString) null else it.longOrNull }
            else -> null
        }
        val currency = if (priceNode is JsonObject) primitive(priceNode, "currency") else primitive(item, "currency")
        val pricePath = when (priceNode) {
            is JsonPrimitive -> priceRoot
            is JsonObject -> priceRoot?.plus(".amount")
            else -> null
        }
        val currencyPath = when {
            priceNode is JsonObject && currency != null -> priceRoot?.plus(".currency")
            currency != null -> "\$.currency"
            else -> null
        }
        return CatalogProduct(
            id = id,
            sku = normalizedSku,
            name = firstPrimitive(item, "name", "displayName"),
            priceMinor = amount,
            currency = currency,
            pricePath = pricePath,
            currencyPath = currencyPath,
            currencyFieldState = when {
                priceNode is JsonObject -> observedCurrency(priceNode, priceRoot ?: "\$.price").state
                item.containsKey("currency") -> if (item["currency"] == JsonNull) "EXPLICIT_NULL" else "PRESENT"
                else -> "ABSENT"
            },
            variantId = primitive(item, "id")?.takeIf { origin == "CATALOG_VARIANT" },
            origin = origin,
        )
    }

    private fun compareBusinessProduct(
        label: String, sku: String, item: CatalogProduct, config: ProductionConfig,
        transport: PoyntCloudHttpTransport, authorization: String,
    ) {
        // Only use IDs returned in a verified merchant catalog, never untrusted free-form paths.
        if (!item.id.matches(Regex("[A-Za-z0-9_-]{1,150}"))) {
            println("$label business price comparison $sku: UNKNOWN (invalid product ID format)")
            return
        }
        val response = transport.get(transport.productUri(config.businessId, item.id), authorization)
        println("$label business product GET $sku HTTP ${response.statusCode}")
        if (response.statusCode != 200) {
            println("$label business price comparison $sku: ${classify(response.statusCode)}")
            return
        }
        val product = parseObject(response.body, "$label business product $sku") ?: return
        if (primitive(product, "id") != item.id) {
            println("$label business price comparison $sku: UNKNOWN (product ID mismatch)")
            return
        }
        val variant = (product["variants"] as? JsonArray)?.mapNotNull { it as? JsonObject }
            ?.singleOrNull { primitive(it, "id") == item.variantId }
        val businessPrice = priceAmount(variant?.get("price") ?: product["price"])
        val catalogPrice = item.priceMinor
        println("$label $sku external product ID: ${mask(item.id)}; variant ID: ${mask(item.variantId)}")
        println("$label $sku catalog-entry price (raw minor units): ${catalogPrice ?: "NOT_EXPOSED"} ${safe(item.currency)}")
        println("$label $sku business-product price (raw minor units): ${businessPrice ?: "NOT_EXPOSED"}")
        val comparison = when {
            catalogPrice == null || businessPrice == null -> "UNKNOWN (price missing)"
            catalogPrice == businessPrice -> "EQUAL_RAW_AMOUNTS (authority unverified)"
            else -> "DIFFERENT_RAW_AMOUNTS (authority unverified)"
        }
        println("$label $sku price comparison: $comparison")
    }

    private fun priceAmount(node: kotlinx.serialization.json.JsonElement?): Long? = when (node) {
        is JsonPrimitive -> if (node.isString) null else node.longOrNull
        is JsonObject -> (node["amount"] as? JsonPrimitive)?.let { if (it.isString) null else it.longOrNull }
        else -> null
    }

    private fun primitive(objectValue: JsonObject, key: String): String? =
        (objectValue[key] as? JsonPrimitive)?.contentOrNull?.takeIf { it.isNotBlank() }

    private fun firstPrimitive(objectValue: JsonObject, vararg keys: String): String? =
        keys.firstNotNullOfOrNull { primitive(objectValue, it) }

    private fun classify(statusCode: Int): String = when (statusCode) {
        401, 403 -> "UNAUTHORIZED"
        404 -> "NOT_FOUND"
        else -> "UNKNOWN"
    }

    private fun safe(value: String?): String = value
        ?.replace(Regex("[\\r\\n\\t]"), " ")
        ?.take(120)
        ?: "NOT_EXPOSED"

    private fun mask(value: String?): String = when {
        value.isNullOrBlank() -> "NOT_EXPOSED"
        value.length <= 6 -> "***"
        else -> "${value.take(3)}…${value.takeLast(3)}"
    }

    private fun safeErrorCode(body: String): String = runCatching {
        val error = Json.parseToJsonElement(body) as? JsonObject
        firstPrimitive(error ?: JsonObject(emptyMap()), "code", "error")
    }.getOrNull()?.takeIf { it.matches(Regex("[A-Za-z0-9_-]{1,80}")) } ?: "NOT_EXPOSED"

    private data class ProductionConfig(
        val baseUrl: String,
        val applicationId: String,
        val businessId: String,
        val storeId: String,
        val secretReference: String,
        val awsRegion: String,
        val sharedSku: String?,
    )

    private data class StoreDocument(val id: String, val document: JsonObject, val statusCode: Int)
    private data class CatalogAssignment(val catalogId: String?, val status: String)
    private data class CatalogProduct(
        val id: String,
        val sku: String,
        val name: String?,
        val priceMinor: Long?,
        val currency: String?,
        val pricePath: String?,
        val currencyPath: String?,
        val currencyFieldState: String,
        val variantId: String?,
        val origin: String,
    )
    private data class CatalogProducts(val status: String, val values: List<CatalogProduct>)
    private data class CatalogInspection(
        val label: String,
        val deviceId: String?,
        val storeId: String?,
        val catalogId: String?,
        val catalogName: String?,
        val status: String,
        val productListStatus: String,
        val products: List<CatalogProduct>,
    )

    private companion object {
        const val API_VERSION = "1.2"
        const val PRODUCTION_BASE_URL = "https://services.poynt.net"
        const val MATCHA_COOKIE_SKU = "MTCH-CK"
        const val BLUEBERRY_CHEESECAKE_SKU = "BLBRRY-CHSCK"
        const val BLUEBERRY_CHEESECAKE_PRODUCT_ID = "c92c787c-8d4e-43a1-8ff3-4d868a78a062"
        const val TEST_LAB_REDEMPTION_ORDER_ID = "b875b9bd-be0d-423d-b2f1-9cfc36bf2746"
    }
}
