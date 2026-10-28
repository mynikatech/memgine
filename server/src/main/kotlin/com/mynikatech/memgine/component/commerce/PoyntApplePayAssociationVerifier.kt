package com.mynikatech.memgine.component.commerce

import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.file.Files
import java.nio.file.Path
import java.security.MessageDigest
import java.time.Duration

data class ApplePayAssociationEvidence(
    val status: String,
    val installedSha256: String? = null,
    val publicSha256: String? = null
)

/** Verifies configured association bytes without accepting a path or URL from an API caller. */
interface ApplePayAssociationVerifier {
    fun verify(checkoutUrl: String, installedArtifactPath: String): ApplePayAssociationEvidence
}

class HttpApplePayAssociationVerifier(
    private val client: HttpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(10))
        .followRedirects(HttpClient.Redirect.NEVER)
        .build()
) : ApplePayAssociationVerifier {
    override fun verify(checkoutUrl: String, installedArtifactPath: String): ApplePayAssociationEvidence {
        val installedBytes = try {
            val path = Path.of(installedArtifactPath)
            if (installedArtifactPath.isBlank() || !Files.isRegularFile(path) || !Files.isReadable(path)) {
                return ApplePayAssociationEvidence("ASSOCIATION_ARTIFACT_UNAVAILABLE")
            }
            Files.readAllBytes(path)
        } catch (_: Exception) {
            return ApplePayAssociationEvidence("ASSOCIATION_ARTIFACT_UNAVAILABLE")
        }

        if (installedBytes.isEmpty() || isObviousErrorDocument(installedBytes)) {
            return ApplePayAssociationEvidence("ASSOCIATION_ARTIFACT_INVALID")
        }

        val installedHash = sha256(installedBytes)
        val publicUri = try {
            val base = URI(checkoutUrl)
            if (!base.scheme.equals("https", ignoreCase = true) || base.host.isNullOrBlank()) {
                return ApplePayAssociationEvidence("CHECKOUT_URL_INVALID", installedHash)
            }
            URI("https", null, base.host, base.port, "/.well-known/apple-developer-merchantid-domain-association", null, null)
        } catch (_: Exception) {
            return ApplePayAssociationEvidence("CHECKOUT_URL_INVALID", installedHash)
        }

        val response = try {
            client.send(
                HttpRequest.newBuilder(publicUri).timeout(Duration.ofSeconds(30)).GET().build(),
                HttpResponse.BodyHandlers.ofByteArray()
            )
        } catch (_: Exception) {
            return ApplePayAssociationEvidence("ASSOCIATION_PUBLIC_UNAVAILABLE", installedHash)
        }

        if (response.statusCode() != 200) {
            return ApplePayAssociationEvidence("ASSOCIATION_PUBLIC_HTTP_${response.statusCode()}", installedHash)
        }
        if (response.body().isEmpty() || isObviousErrorDocument(response.body())) {
            return ApplePayAssociationEvidence("ASSOCIATION_PUBLIC_INVALID", installedHash)
        }

        val publicHash = sha256(response.body())
        return ApplePayAssociationEvidence(
            if (installedHash == publicHash) "ASSOCIATION_PUBLIC_VERIFIED" else "ASSOCIATION_PUBLIC_HASH_MISMATCH",
            installedHash,
            publicHash
        )
    }

    private fun isObviousErrorDocument(bytes: ByteArray): Boolean {
        val prefix = String(bytes.take(1024).toByteArray(), Charsets.US_ASCII)
            .lowercase()
            .filterNot(Char::isWhitespace)
        return prefix.startsWith("<!doctypehtml") || prefix.startsWith("<html") ||
            prefix.startsWith('{') || prefix.startsWith('[')
    }

    private fun sha256(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256")
        .digest(bytes)
        .joinToString("") { "%02x".format(it) }
}
