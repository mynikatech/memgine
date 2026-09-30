package com.mynikatech.memgine.component.commerce.provider.poynt

import com.auth0.jwt.JWT
import com.auth0.jwt.algorithms.Algorithm
import com.mynikatech.memgine.exception.BadRequestException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.bouncycastle.asn1.pkcs.PrivateKeyInfo
import org.bouncycastle.openssl.PEMKeyPair
import org.bouncycastle.openssl.PEMParser
import org.bouncycastle.openssl.jcajce.JcaPEMKeyConverter
import java.io.StringReader
import java.net.URI
import java.net.URLEncoder
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.charset.StandardCharsets
import java.security.interfaces.RSAPrivateKey
import java.time.Duration
import java.time.Instant
import java.util.Date
import java.util.UUID

interface PoyntTokenTransport {
    fun requestToken(assertion: String): PoyntTokenResponse
}

data class PoyntTokenResponse(
    val accessToken: String,
    val tokenType: String,
    val expiresIn: Long,
    /** Parsed from the response for protocol compatibility; intentionally never persisted or logged. */
    val refreshToken: String? = null
)

class PoyntCloudTokenTransport(private val baseUrl: String, private val apiVersion: String) : PoyntTokenTransport {
    private val client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build()

    override fun requestToken(assertion: String): PoyntTokenResponse {
        val body = "grantType=${URLEncoder.encode(JWT_BEARER_GRANT, StandardCharsets.UTF_8)}&assertion=" +
            URLEncoder.encode(assertion, StandardCharsets.UTF_8)
        val request = HttpRequest.newBuilder(tokenUri())
            .timeout(Duration.ofSeconds(20))
            .header("Api-Version", apiVersion)
            .header("Content-Type", "application/x-www-form-urlencoded")
            .POST(HttpRequest.BodyPublishers.ofString(body))
            .build()
        val response = try {
            client.send(request, HttpResponse.BodyHandlers.ofString())
        } catch (_: Exception) {
            throw BadRequestException("Poynt authentication failed")
        }
        if (response.statusCode() !in 200..299) throw BadRequestException("Poynt authentication failed")
        val payload = try { Json.parseToJsonElement(response.body()).jsonObject } catch (_: Exception) {
            throw BadRequestException("Poynt authentication failed")
        }
        val token = payload["accessToken"]?.jsonPrimitive?.contentOrNull?.takeIf { it.isNotBlank() }
            ?: throw BadRequestException("Poynt authentication failed")
        val expiry = payload["expiresIn"]?.jsonPrimitive?.intOrNull?.toLong()?.takeIf { it > 0 }
            ?: throw BadRequestException("Poynt authentication failed")
        return PoyntTokenResponse(
            accessToken = token,
            tokenType = payload["tokenType"]?.jsonPrimitive?.contentOrNull?.ifBlank { "Bearer" } ?: "Bearer",
            expiresIn = expiry,
            refreshToken = payload["refreshToken"]?.jsonPrimitive?.contentOrNull
        )
    }

    internal fun tokenUri(): URI = URI.create("$baseUrl/token")

    private companion object {
        const val JWT_BEARER_GRANT = "urn:ietf:params:oauth:grant-type:jwt-bearer"
    }
}

/** Thread-safe in-memory Poynt token cache. No access or refresh token is persisted. */
class PoyntTokenService(
    private val credentials: PoyntCredentialResolver,
    private val transport: PoyntTokenTransport,
    private val audience: String,
    private val now: () -> Instant = { Instant.now() }
) {
    private val cached = mutableMapOf<String, PoyntAccessToken>()

    @Synchronized
    fun token(configuration: PoyntCatalogConfiguration): PoyntAccessToken {
        cached[configuration.integrationConfigurationId]?.takeIf { it.expiresAtEpochSeconds > now().epochSecond + REFRESH_SKEW_SECONDS }
            ?.let { return it }
        val credential = try { credentials.resolve(configuration.secretReference) }
        catch (_: Exception) { throw BadRequestException("Poynt authentication failed") }
        val assertion = try { assertion(configuration.applicationId, credential.privateKeyPem) }
        catch (_: Exception) { throw BadRequestException("Poynt authentication failed") }
        val response = try { transport.requestToken(assertion) }
        catch (_: BadRequestException) { throw BadRequestException("Poynt authentication failed") }
        catch (_: Exception) { throw BadRequestException("Poynt authentication failed") }
        val issued = PoyntAccessToken(response.accessToken, response.tokenType, now().epochSecond + response.expiresIn)
        cached[configuration.integrationConfigurationId] = issued
        return issued
    }

    @Synchronized
    fun invalidate(integrationConfigurationId: String) { cached.remove(integrationConfigurationId) }

    internal fun assertion(applicationId: String, privateKeyPem: String): String {
        val issuedAt = now()
        val key = PEMParser(StringReader(privateKeyPem)).use { parser ->
            when (val parsed = parser.readObject()) {
                is PEMKeyPair -> JcaPEMKeyConverter().getKeyPair(parsed).private
                is PrivateKeyInfo -> JcaPEMKeyConverter().getPrivateKey(parsed)
                else -> throw IllegalArgumentException("Unsupported Poynt private key")
            }
        } as? RSAPrivateKey ?: throw IllegalArgumentException("Poynt key is not RSA")
        return JWT.create()
            .withIssuer(applicationId)
            .withSubject(applicationId)
            .withAudience(audience)
            .withIssuedAt(Date.from(issuedAt))
            .withExpiresAt(Date.from(issuedAt.plusSeconds(JWT_LIFETIME_SECONDS)))
            .withJWTId(UUID.randomUUID().toString())
            .sign(Algorithm.RSA256(null, key))
    }

    private companion object {
        const val JWT_LIFETIME_SECONDS = 300L
        const val REFRESH_SKEW_SECONDS = 60L
    }
}