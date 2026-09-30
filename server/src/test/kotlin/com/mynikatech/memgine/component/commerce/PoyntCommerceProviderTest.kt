package com.mynikatech.memgine.component.commerce.provider.poynt

import com.auth0.jwt.JWT
import com.mynikatech.memgine.component.commerce.CommerceCatalogSyncRequest
import com.mynikatech.memgine.component.commerce.CommerceCheckoutProvider
import com.mynikatech.memgine.component.commerce.CommerceProviderRegistry
import com.mynikatech.memgine.net.dto.CommerceCapability
import com.mynikatech.memgine.net.dto.CommerceCheckoutRequest
import com.mynikatech.memgine.net.dto.CommerceCheckoutAdjustment
import com.mynikatech.memgine.net.dto.CommerceTransactionAdjustmentDto
import com.mynikatech.memgine.net.dto.CommerceTransactionLineDto
import com.mynikatech.memgine.config.DEFAULT_POYNT_JWT_AUDIENCE
import com.mynikatech.memgine.exception.BadRequestException
import java.net.URI
import java.security.KeyPairGenerator
import java.time.Instant
import java.util.Base64
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue
import kotlinx.serialization.json.*

class PoyntCommerceProviderTest {
    private val configuration = PoyntCatalogConfiguration("integration", "org", "urn:aid:memgine", "business", null, "secret", "USD", "2026-01-01T00:00:00Z")
    private val sql = object : PoyntCommerceSql {
        override fun catalogConfiguration(organizationId: String, integrationId: String, actorUserId: String) =
            PoyntCatalogConfigurationRow(integrationId, organizationId, "urn:aid:memgine", "business", null, "secret", "USD", null, null, "2026-01-01T00:00:00Z")
    }
    private val privateKeyPem = KeyPairGenerator.getInstance("RSA").apply { initialize(2048) }.generateKeyPair().private.encoded.let {
        "-----BEGIN PRIVATE KEY-----\n${Base64.getMimeEncoder(64, "\n".toByteArray()).encodeToString(it)}\n-----END PRIVATE KEY-----"
    }

    private class FakeTransport(private val responses: MutableList<PoyntHttpResponse>) : PoyntHttpTransport {
        var calls = 0
        var modifiedSince: String? = null
        var authorization: String? = null
        var postAuthorization: String? = null
        var postRequestId: String? = null
        var postBody: String? = null
        var postUri: URI? = null
        var getUri: URI? = null
        override fun get(uri: URI, authorization: String, modifiedSince: String?): PoyntHttpResponse {
            this.getUri = uri
            this.authorization = authorization
            this.modifiedSince = modifiedSince
            return responses[calls++]
        }
        override fun post(uri: URI, authorization: String, requestId: String, body: String): PoyntHttpResponse {
            this.postUri = uri
            this.postAuthorization = authorization
            this.postRequestId = requestId
            this.postBody = body
            return responses[calls++]
        }
        override fun productUri(businessId: String, productId: String) = URI.create("https://example.test/product")
        override fun productsUri(businessId: String, offset: Int) = URI.create("https://example.test/products/$offset")
        override fun orderUri(businessId: String, orderId: String) = URI.create("https://example.test/businesses/$businessId/orders/$orderId")
        override fun ordersUri(businessId: String) = URI.create("https://example.test/businesses/$businessId/orders")
    }

    private class FakeTokenTransport(private val expiry: Long = 3600) : PoyntTokenTransport {
        var calls = 0
        override fun requestToken(assertion: String): PoyntTokenResponse = PoyntTokenResponse("token-${++calls}", "Bearer", expiry, "ignored-refresh-token")
    }

    private class FakeOrderClient(private val response: PoyntOrder) : PoyntOrderClient {
        var configuration: PoyntCatalogConfiguration? = null
        var requestId: String? = null
        var order: PoyntOrder? = null
        var createCalls = 0

        override fun createOrder(configuration: PoyntCatalogConfiguration, requestId: String, order: PoyntOrder): PoyntOrder {
            this.configuration = configuration
            this.requestId = requestId
            this.order = order
            createCalls++
            return response
        }

        override fun getOrder(configuration: PoyntCatalogConfiguration, orderId: String): PoyntOrder = response
    }

    private fun tokens(
        transport: PoyntTokenTransport = FakeTokenTransport(),
        audience: String = DEFAULT_POYNT_JWT_AUDIENCE,
        clock: () -> Instant = { Instant.ofEpochSecond(1_000) }
    ) = PoyntTokenService(PoyntCredentialResolver { PoyntCredential(privateKeyPem) }, transport, audience, clock)

    private fun order() = PoyntOrder(
        items = listOf(
            PoyntOrderItem(
                productId = "product-1",
                externalProductId = "external-product-1",
                selectedVariants = listOf(PoyntVariant(id = "variant-1", sku = "SKU-1", name = "Large")),
                sku = "SKU-1",
                name = "Coffee",
                details = "Freshly brewed",
                unitPrice = 500,
                quantity = 2.0,
                unitOfMeasure = "EACH",
                status = "ORDERED",
                taxes = listOf(PoyntOrderItemTax(id = "tax-1", amount = 65, taxRatePercentage = 13.0)),
                discounts = listOf(PoyntDiscount(id = "discount-1", customName = "Launch", amount = 50))
            )
        ),
        amounts = PoyntOrderAmounts(subTotal = 1000, taxTotal = 130, discountTotal = 50, netTotal = 1080, currency = "CAD"),
        context = PoyntOrderContext(source = "WEB", businessId = "business", storeId = "store"),
        statuses = PoyntOrderStatuses("OPENED"),
        externalId = "memgine-transaction"
    )

    private fun externalLine(
        externalProductId: String? = "product-1",
        externalVariantId: String? = "variant-1",
        lineType: String = "EXTERNAL_PRODUCT"
    ) = CommerceTransactionLineDto(
        lineId = "line-1",
        transactionId = "transaction-1",
        lineType = lineType,
        externalProductId = externalProductId,
        externalVariantId = externalVariantId,
        description = "Coffee",
        quantity = 2,
        unitPriceMinorAuthoritative = 500,
        lineSubtotalMinor = 1000,
        currencyCode = "CAD",
        priceSource = "AUTHORITATIVE_PROVIDER_PRICE",
        versionNo = 1
    )

    private fun checkoutRequest(
        lines: List<CommerceTransactionLineDto> = listOf(externalLine()),
        adjustments: List<CommerceTransactionAdjustmentDto> = emptyList()
    ) = CommerceCheckoutRequest(
        organizationId = "org",
        transactionId = "transaction-1",
        storeId = "memgine-store",
        customerUserId = "customer",
        sourceChannel = "COUNTER",
        idempotencyKey = "stable-provider-request-id",
        lines = lines,
        adjustments = adjustments,
        currencyCode = "CAD",
        integrationConfigurationId = "integration",
        actorUserId = "admin"
    )

    private fun checkoutProvider(orderClient: FakeOrderClient): PoyntCommerceProvider =
        PoyntCommerceProvider(
            sql,
            PoyntAuthenticatedCatalogClient(FakeTransport(mutableListOf()), tokens()),
            orderClient,
            PoyntCheckoutConfigurationResolver { configuration.copy(providerStoreId = "poynt-store") }
        )

    @Test fun `JWT has Poynt application claims and RS256 lifetime`() {
        val jwt = tokens().assertion(configuration.applicationId, privateKeyPem)
        val decoded = JWT.decode(jwt)
        assertEquals("urn:aid:memgine", decoded.issuer)
        assertEquals("urn:aid:memgine", decoded.subject)
        assertEquals("https://services.poynt.net", decoded.audience.single())
        assertTrue(decoded.id.isNotBlank())
        assertEquals(300, decoded.expiresAt.time / 1000 - decoded.issuedAt.time / 1000)
        assertEquals("RS256", decoded.algorithm)
    }

    @Test fun `JWT audience is configured independently from HTTP API base URL`() {
        val jwt = tokens(audience = "https://services.poynt.net").assertion(configuration.applicationId, privateKeyPem)
        assertEquals("https://services.poynt.net", JWT.decode(jwt).audience.single())
        assertEquals("https://poynt-ote.example/token", PoyntCloudTokenTransport("https://poynt-ote.example", "1.2").tokenUri().toString())
        assertEquals("https://poynt-ote.example/businesses/business/products?limit=100&startOffset=0", PoyntCloudHttpTransport("https://poynt-ote.example", "1.2").productsUri("business", 0).toString())
    }

    @Test fun `default JWT audience is the official Poynt services audience`() {
        assertEquals("https://services.poynt.net", DEFAULT_POYNT_JWT_AUDIENCE)
        assertEquals(DEFAULT_POYNT_JWT_AUDIENCE, JWT.decode(tokens().assertion(configuration.applicationId, privateKeyPem)).audience.single())
    }

    @Test fun `token acquisition caches until refresh window`() {
        val transport = FakeTokenTransport()
        val service = tokens(transport)
        assertEquals("token-1", service.token(configuration).value)
        assertEquals("token-1", service.token(configuration).value)
        assertEquals(1, transport.calls)
    }

    @Test fun `tokens expiring within refresh window are reacquired`() {
        val transport = FakeTokenTransport(60)
        val service = tokens(transport)
        service.token(configuration)
        service.token(configuration)
        assertEquals(2, transport.calls)
    }

    @Test fun `one 401 invalidates cached token then retries catalog GET once`() {
        val tokenTransport = FakeTokenTransport()
        val http = FakeTransport(mutableListOf(PoyntHttpResponse(401, ""), PoyntHttpResponse(200, "{\"products\":[]}")))
        val provider = PoyntCommerceProvider(sql, PoyntAuthenticatedCatalogClient(http, tokens(tokenTransport)))
        assertEquals(emptyList(), provider.syncCatalog(CommerceCatalogSyncRequest("org", "integration", actorUserId = "admin")))
        assertEquals(2, http.calls)
        assertEquals(2, tokenTransport.calls)
        assertEquals("Bearer token-2", http.authorization)
    }

    @Test fun `a second 401 fails after exactly one refresh retry`() {
        val tokenTransport = FakeTokenTransport()
        val http = FakeTransport(mutableListOf(PoyntHttpResponse(401, ""), PoyntHttpResponse(401, "")))
        val client = PoyntAuthenticatedCatalogClient(http, tokens(tokenTransport))
        assertFailsWith<BadRequestException> { client.get(configuration, URI.create("https://example.test/products")) }
        assertEquals(2, http.calls)
        assertEquals(2, tokenTransport.calls)
    }

    @Test fun `authentication errors are sanitized`() {
        val service = PoyntTokenService(PoyntCredentialResolver { throw IllegalStateException("secret-value") }, FakeTokenTransport(), "https://services.poynt.net")
        val error = assertFailsWith<BadRequestException> { service.token(configuration) }
        assertEquals("Poynt authentication failed", error.message)
    }

    @Test fun `catalog configuration DTO cannot expose Poynt private material`() {
        val names = com.mynikatech.memgine.net.dto.CommerceCatalogConfigurationWriteDto::class.java.declaredFields.map { it.name }
        assertTrue("accessToken" !in names && "refreshToken" !in names && "privateKeyPem" !in names)
    }

    @Test fun `maps variants as distinct generic snapshots and uses merchant currency fallback`() {
        val http = FakeTransport(mutableListOf(PoyntHttpResponse(200, """{"products":[{"id":"coffee","name":"Coffee","variants":[{"id":"small","name":"Small","price":{"amount":300}},{"id":"large","name":"Large","price":{"amount":500}}]}]}""")))
        val provider = PoyntCommerceProvider(sql, PoyntAuthenticatedCatalogClient(http, tokens()))
        val snapshots = provider.syncCatalog(CommerceCatalogSyncRequest("org", "integration", actorUserId = "admin"))
        assertEquals(2, snapshots.size)
        assertEquals("small", snapshots[0].externalVariantId)
        assertEquals(500, snapshots[1].unitPriceMinorSnapshot)
        assertEquals("USD", snapshots[0].currencyCode)
    }

    @Test fun `incremental request sends last successful cursor as modified since`() {
        val http = FakeTransport(mutableListOf(PoyntHttpResponse(200, "{\"products\":[]}")))
        val provider = PoyntCommerceProvider(sql, PoyntAuthenticatedCatalogClient(http, tokens()))
        provider.syncCatalog(CommerceCatalogSyncRequest("org", "integration", incremental = true, actorUserId = "admin"))
        assertEquals("2026-01-01T00:00:00Z", http.modifiedSince)
        assertTrue(provider.capabilities == setOf(
            CommerceCapability.CATALOG,
            CommerceCapability.PRODUCT_LOOKUP,
            CommerceCapability.ORDER,
            CommerceCapability.DISCOUNT
        ))
    }

    @Test fun `create order posts documented URI headers request id and representative JSON`() {
        val transport = FakeTransport(mutableListOf(PoyntHttpResponse(201, """{"id":"order-1","items":[],"amounts":{"currency":"CAD"}}""")))
        val client = PoyntAuthenticatedOrderClient(transport, tokens())

        val created = client.createOrder(configuration, "request-123", order())

        assertEquals("order-1", created.id)
        assertEquals("https://example.test/businesses/business/orders", transport.postUri.toString())
        assertEquals("Bearer token-1", transport.postAuthorization)
        assertEquals("request-123", transport.postRequestId)
        val serialized = Json.parseToJsonElement(transport.postBody!!).jsonObject
        assertEquals("product-1", serialized["items"]!!.jsonArray[0].jsonObject["productId"]!!.jsonPrimitive.content)
        assertEquals("variant-1", serialized["items"]!!.jsonArray[0].jsonObject["selectedVariants"]!!.jsonArray[0].jsonObject["id"]!!.jsonPrimitive.content)
        assertEquals(500, serialized["items"]!!.jsonArray[0].jsonObject["unitPrice"]!!.jsonPrimitive.long)
        assertEquals(50, serialized["items"]!!.jsonArray[0].jsonObject["discounts"]!!.jsonArray[0].jsonObject["amount"]!!.jsonPrimitive.long)
        assertEquals(65, serialized["items"]!!.jsonArray[0].jsonObject["taxes"]!!.jsonArray[0].jsonObject["amount"]!!.jsonPrimitive.long)

        val request = PoyntCloudHttpTransport("https://poynt.example", "1.2")
            .buildPostRequest(URI.create("https://poynt.example/businesses/business/orders"), "Bearer token", "request-123", "{}")
        assertEquals("Bearer token", request.headers().firstValue("Authorization").orElse(null))
        assertEquals("1.2", request.headers().firstValue("Api-Version").orElse(null))
        assertEquals("application/json", request.headers().firstValue("Content-Type").orElse(null))
        assertEquals("request-123", request.headers().firstValue("Poynt-Request-Id").orElse(null))
    }

    @Test fun `get order uses documented URI and deserializes provider order`() {
        val transport = FakeTransport(mutableListOf(PoyntHttpResponse(200, """{"id":"order-1","businessId":"business","storeId":"store","items":[{"productId":"product-1","selectedVariants":[{"id":"variant-1"}],"unitPrice":500,"quantity":2.0,"discounts":[{"amount":50}],"taxes":[{"amount":65}]}],"amounts":{"subTotal":1000,"currency":"CAD"},"statuses":{"status":"OPENED"}}""")))
        val client = PoyntAuthenticatedOrderClient(transport, tokens())

        val found = client.getOrder(configuration, "order-1")

        assertEquals("order-1", found.id)
        assertEquals("https://example.test/businesses/business/orders/order-1", transport.getUri.toString())
        assertEquals("product-1", found.items.single().productId)
        assertEquals("variant-1", found.items.single().selectedVariants.single().id)
        assertEquals(500, found.items.single().unitPrice)
        assertEquals(50, found.items.single().discounts.single().amount)
        assertEquals(65, found.items.single().taxes.single().amount)
    }

    @Test fun `create order invalidates token and retries exactly once after one 401`() {
        val tokenTransport = FakeTokenTransport()
        val transport = FakeTransport(mutableListOf(PoyntHttpResponse(401, "token-1"), PoyntHttpResponse(201, """{"id":"order-1"}""")))
        val client = PoyntAuthenticatedOrderClient(transport, tokens(tokenTransport))

        assertEquals("order-1", client.createOrder(configuration, "request-123", order()).id)
        assertEquals(2, transport.calls)
        assertEquals(2, tokenTransport.calls)
        assertEquals("Bearer token-2", transport.postAuthorization)
    }

    @Test fun `second 401 and non 401 create failures are sanitized and not blindly retried`() {
        val second401 = FakeTransport(mutableListOf(PoyntHttpResponse(401, "token-1"), PoyntHttpResponse(401, "token-2")))
        val tokenTransport = FakeTokenTransport()
        val client = PoyntAuthenticatedOrderClient(second401, tokens(tokenTransport))
        val unauthorized = assertFailsWith<BadRequestException> { client.createOrder(configuration, "request-123", order()) }
        assertEquals("Poynt order request failed (HTTP 401)", unauthorized.message)
        assertEquals(2, second401.calls)
        assertEquals(2, tokenTransport.calls)

        val conflict = FakeTransport(mutableListOf(PoyntHttpResponse(409, "Bearer secret-token")))
        val conflictClient = PoyntAuthenticatedOrderClient(conflict, tokens())
        val error = assertFailsWith<BadRequestException> { conflictClient.createOrder(configuration, "request-123", order()) }
        assertEquals("Poynt order request failed (HTTP 409)", error.message)
        assertEquals(1, conflict.calls)
        assertTrue(error.message!!.contains("secret-token").not())
    }

    @Test fun `Poynt provider is one catalog and checkout provider with order and discount capabilities`() {
        val provider = checkoutProvider(FakeOrderClient(PoyntOrder(id = "order-1")))
        val registry = CommerceProviderRegistry(listOf(provider))

        assertTrue(provider is CommerceCheckoutProvider)
        assertEquals(setOf(CommerceCapability.CATALOG, CommerceCapability.PRODUCT_LOOKUP, CommerceCapability.ORDER, CommerceCapability.DISCOUNT, CommerceCapability.TERMINAL_PAYMENT), provider.capabilities)
        assertEquals(provider, registry.catalogProvider("poynt"))
        assertEquals(provider, registry.checkoutProvider("POYNT"))
        assertFalse(CommerceCapability.PAYMENT in provider.capabilities)
        assertFalse(CommerceCapability.REMOTE_PAYMENT in provider.capabilities)
    }

    @Test fun `checkout maps external products variants context request id and provider totals`() {
        val orderClient = FakeOrderClient(
            PoyntOrder(
                id = "poynt-order-1",
                amounts = PoyntOrderAmounts(subTotal = 1500, discountTotal = 0, taxTotal = 195, netTotal = 1695, currency = "CAD"),
                statuses = PoyntOrderStatuses(status = "OPENED")
            )
        )
        val provider = checkoutProvider(orderClient)
        val second = externalLine("product-2", null).copy(lineId = "line-2", description = "Tea", quantity = 1)

        val result = provider.startCheckout(checkoutRequest(lines = listOf(externalLine(), second)))

        assertEquals("stable-provider-request-id", orderClient.requestId)
        assertEquals("business", orderClient.configuration!!.businessId)
        assertEquals("poynt-store", orderClient.order!!.context!!.storeId)
        assertEquals("business", orderClient.order!!.context!!.businessId)
        assertEquals("EXTERNALLY_PROCESSED", orderClient.order!!.context!!.transactionInstruction)
        assertEquals(2, orderClient.order!!.items.size)
        assertEquals("product-1", orderClient.order!!.items[0].productId)
        assertEquals("variant-1", orderClient.order!!.items[0].selectedVariants.single().id)
        assertEquals(2.0, orderClient.order!!.items[0].quantity)
        assertEquals(500, orderClient.order!!.items[0].unitPrice)
        assertEquals("product-2", orderClient.order!!.items[1].productId)
        assertTrue(orderClient.order!!.items[1].selectedVariants.isEmpty())
        assertEquals(1500, orderClient.order!!.amounts!!.subTotal)
        assertEquals(0, orderClient.order!!.amounts!!.taxTotal)
        assertEquals("poynt-order-1", result.providerOrderId)
        assertEquals("OPENED", result.providerStatus)
        assertEquals(1500, result.subtotalMinor)
        assertEquals(195, result.taxTotalMinor)
        assertEquals(1695, result.totalMinor)
        assertEquals("CAD", result.currencyCode)
        assertEquals(null, result.providerTransactionId)
    }

    @Test fun `checkout maps membership custom items and materialized discounts`() {
        val orderClient = FakeOrderClient(PoyntOrder(id = "poynt-order-1", amounts = PoyntOrderAmounts(subTotal = 1000, discountTotal = 1000, taxTotal = 0, netTotal = 0, currency = "CAD"), statuses = PoyntOrderStatuses("OPENED")))
        val provider = checkoutProvider(orderClient)
        val membership = externalLine(lineType = "MEMBERSHIP").copy(
            lineId = "membership-line", subscriptionPlanId = "plan", externalProductId = null,
            externalVariantId = null, description = "Gold Membership", quantity = 1,
            unitPriceMinorAuthoritative = 1000, lineSubtotalMinor = 1000,
            priceSource = "MEMGINE_MEMBERSHIP"
        )
        val request = checkoutRequest(lines = listOf(membership)).copy(
            materializedAdjustments = listOf(CommerceCheckoutAdjustment("adjustment", "membership-line", "BENEFIT", "benefit", "PRODUCT_FREE", 1000))
        )

        provider.startCheckout(request)

        assertEquals(null, orderClient.order!!.items.single().productId)
        assertEquals("plan", orderClient.order!!.items.single().sku)
        assertEquals("membership-line", orderClient.order!!.items.single().externalId)
        assertEquals(1000, orderClient.order!!.items.single().discounts.single().amount)
        assertEquals(0, orderClient.order!!.amounts!!.netTotal)
    }

    @Test fun `checkout rejects unsupported lines and missing product identity without creating an order`() {
        val orderClient = FakeOrderClient(PoyntOrder(id = "poynt-order-1"))
        val provider = checkoutProvider(orderClient)
        assertFailsWith<BadRequestException> { provider.startCheckout(checkoutRequest(lines = listOf(externalLine(lineType = "CUSTOM_ITEM")))) }
        assertFailsWith<BadRequestException> { provider.startCheckout(checkoutRequest(lines = listOf(externalLine(externalProductId = null)))) }
        assertEquals(0, orderClient.createCalls)
    }
}
