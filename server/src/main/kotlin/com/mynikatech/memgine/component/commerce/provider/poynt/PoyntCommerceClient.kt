package com.mynikatech.memgine.component.commerce.provider.poynt

import com.mynikatech.memgine.exception.BadRequestException
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

interface PoyntHttpTransport {
    fun get(uri: URI, authorization: String, modifiedSince: String? = null): PoyntHttpResponse
    fun post(uri: URI, authorization: String, requestId: String, body: String): PoyntHttpResponse
    fun productUri(businessId: String, productId: String): URI
    fun productsUri(businessId: String, offset: Int): URI
    fun orderUri(businessId: String, orderId: String): URI
    fun ordersUri(businessId: String): URI
    /** Operational diagnostic endpoint; provider configuration supplies the business ID. */
    fun storesUri(businessId: String): URI = throw UnsupportedOperationException("Poynt stores URI is unavailable")
    fun cloudMessagesUri(): URI = URI.create("https://services.poynt.net/cloudMessages")
}

interface PoyntOrderClient {
    fun createOrder(configuration: PoyntCatalogConfiguration, requestId: String, order: PoyntOrder): PoyntOrder
    fun getOrder(configuration: PoyntCatalogConfiguration, orderId: String): PoyntOrder
}

class PoyntCloudHttpTransport(private val baseUrl: String, private val apiVersion: String) : PoyntHttpTransport {
    private val client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build()

    override fun get(uri: URI, authorization: String, modifiedSince: String?): PoyntHttpResponse {
        repeat(2) { attempt ->
            val builder = HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(20))
                .header("Authorization", authorization).header("Api-Version", apiVersion).GET()
            if (!modifiedSince.isNullOrBlank()) builder.header("If-Modified-Since", modifiedSince)
            try {
                val response = client.send(builder.build(), HttpResponse.BodyHandlers.ofString())
                if (response.statusCode() !in 500..599 || attempt == 1) {
                    return PoyntHttpResponse(response.statusCode(), response.body())
                }
            } catch (error: Exception) {
                if (attempt == 1) throw BadRequestException("Poynt catalog request failed")
            }
        }
        throw BadRequestException("Poynt catalog request failed")
    }

    override fun post(uri: URI, authorization: String, requestId: String, body: String): PoyntHttpResponse {
        val request = buildPostRequest(uri, authorization, requestId, body)
        return try {
            val response = client.send(request, HttpResponse.BodyHandlers.ofString())
            PoyntHttpResponse(response.statusCode(), response.body())
        } catch (_: Exception) {
            throw BadRequestException("Poynt order request failed")
        }
    }

    internal fun buildPostRequest(uri: URI, authorization: String, requestId: String, body: String): HttpRequest =
        HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(20))
            .header("Authorization", authorization)
            .header("Api-Version", apiVersion)
            .header("Content-Type", "application/json")
            .header("Poynt-Request-Id", requestId)
            .POST(HttpRequest.BodyPublishers.ofString(body))
            .build()

    override fun productUri(businessId: String, productId: String) = URI.create("$baseUrl/businesses/$businessId/products/$productId")
    override fun productsUri(businessId: String, offset: Int) = URI.create("$baseUrl/businesses/$businessId/products?limit=100&startOffset=$offset")
    override fun orderUri(businessId: String, orderId: String) = URI.create("$baseUrl/businesses/$businessId/orders/$orderId")
    override fun ordersUri(businessId: String) = URI.create("$baseUrl/businesses/$businessId/orders")
    override fun storesUri(businessId: String) = URI.create("$baseUrl/businesses/$businessId/stores")
    override fun cloudMessagesUri() = URI.create("$baseUrl/cloudMessages")
}

/** Adds a cached Poynt bearer token to each safe catalog GET and retries exactly once after 401. */
class PoyntAuthenticatedCatalogClient(
    private val transport: PoyntHttpTransport,
    private val tokens: PoyntTokenService
) {
    fun get(configuration: PoyntCatalogConfiguration, uri: URI, modifiedSince: String? = null): String {
        repeat(2) { attempt ->
            val token = tokens.token(configuration)
            val response = transport.get(uri, "${token.tokenType} ${token.value}", modifiedSince)
            if (response.statusCode in 200..299) return response.body
            if (response.statusCode == 401 && attempt == 0) {
                tokens.invalidate(configuration.integrationConfigurationId)
                return@repeat
            }
            throw BadRequestException("Poynt catalog request was not authorized")
        }
        throw BadRequestException("Poynt catalog request was not authorized")
    }

    fun productUri(businessId: String, productId: String): URI = transport.productUri(businessId, productId)
    fun productsUri(businessId: String, offset: Int): URI = transport.productsUri(businessId, offset)
}

/** Authenticated Poynt Cloud Order boundary. It does not perform Commerce orchestration or persistence. */
class PoyntAuthenticatedOrderClient(
    private val transport: PoyntHttpTransport,
    private val tokens: PoyntTokenService,
    private val json: Json = Json { ignoreUnknownKeys = true }
) : PoyntOrderClient {
    override fun createOrder(configuration: PoyntCatalogConfiguration, requestId: String, order: PoyntOrder): PoyntOrder {
        require(requestId.isNotBlank()) { "Poynt request ID is required" }
        val body = json.encodeToString(order)
        repeat(2) { attempt ->
            val token = tokens.token(configuration)
            val response = transport.post(
                transport.ordersUri(configuration.businessId),
                "${token.tokenType} ${token.value}",
                requestId,
                body
            )
            if (response.statusCode in 200..299) return parseOrder(response.body)
            if (response.statusCode == 401 && attempt == 0) {
                tokens.invalidate(configuration.integrationConfigurationId)
                return@repeat
            }
            throw BadRequestException(
                "Poynt order request failed (HTTP ${response.statusCode}): ${response.body.take(1500)}"
            )
        }
        throw BadRequestException("Poynt order request was not authorized")
    }

    override fun getOrder(configuration: PoyntCatalogConfiguration, orderId: String): PoyntOrder {
        require(orderId.isNotBlank()) { "Poynt order ID is required" }
        repeat(2) { attempt ->
            val token = tokens.token(configuration)
            val response = transport.get(
                transport.orderUri(configuration.businessId, orderId),
                "${token.tokenType} ${token.value}"
            )
            if (response.statusCode in 200..299) return parseOrder(response.body)
            if (response.statusCode == 401 && attempt == 0) {
                tokens.invalidate(configuration.integrationConfigurationId)
                return@repeat
            }
            throw providerFailure(response.statusCode)
        }
        throw BadRequestException("Poynt order request was not authorized")
    }

    private fun parseOrder(body: String): PoyntOrder = try {
        json.decodeFromString<PoyntOrder>(body)
    } catch (_: Exception) {
        throw BadRequestException("Poynt order response was invalid")
    }

    private fun providerFailure(statusCode: Int): BadRequestException =
        BadRequestException("Poynt order request failed (HTTP $statusCode)")
}
