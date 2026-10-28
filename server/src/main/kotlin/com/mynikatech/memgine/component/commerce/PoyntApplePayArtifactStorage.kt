package com.mynikatech.memgine.component.commerce

import software.amazon.awssdk.core.ResponseBytes
import software.amazon.awssdk.core.sync.RequestBody
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.GetObjectRequest
import software.amazon.awssdk.services.s3.model.GetObjectResponse
import software.amazon.awssdk.services.s3.model.HeadObjectRequest
import software.amazon.awssdk.services.s3.model.NoSuchKeyException
import software.amazon.awssdk.services.s3.model.PutObjectRequest
import software.amazon.awssdk.services.s3.model.S3Exception
import java.security.MessageDigest

/**
 * Private, immutable storage for provider-issued Apple Pay association files.
 * This deliberately does not use branding paths, public URLs, or UUID names.
 */
interface PoyntApplePayArtifactStorage {
    fun read(key: String): ByteArray?
    fun writeImmutable(key: String, bytes: ByteArray)
    fun publish(approvedKey: String, bytes: ByteArray)
    fun sha256(bytes: ByteArray): String
}

class S3PoyntApplePayArtifactStorage(
    private val bucket: String,
    region: String,
    private val client: S3Client = S3Client.builder().region(Region.of(region)).build()
) : PoyntApplePayArtifactStorage {
    init {
        require(bucket.isNotBlank()) { "Apple Pay association S3 bucket is required" }
    }

    override fun read(key: String): ByteArray? = try {
        val response: ResponseBytes<GetObjectResponse> = client.getObjectAsBytes(
            GetObjectRequest.builder().bucket(bucket).key(safeKey(key)).build()
        )
        response.asByteArray()
    } catch (error: S3Exception) {
        if (error.statusCode() == 404) null else throw error
    } catch (_: NoSuchKeyException) {
        null
    }

    override fun writeImmutable(key: String, bytes: ByteArray) {
        val safeKey = safeKey(key)
        try {
            client.headObject(HeadObjectRequest.builder().bucket(bucket).key(safeKey).build())
            return
        } catch (error: S3Exception) {
            if (error.statusCode() != 404) throw error
        }
        client.putObject(
            PutObjectRequest.builder()
                .bucket(bucket)
                .key(safeKey)
                .contentType("text/plain")
                .build(),
            RequestBody.fromBytes(bytes)
        )
    }

    override fun publish(approvedKey: String, bytes: ByteArray) {
        client.putObject(
            PutObjectRequest.builder()
                .bucket(bucket)
                .key(safeKey(approvedKey))
                .contentType("text/plain")
                .build(),
            RequestBody.fromBytes(bytes)
        )
    }

    override fun sha256(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256")
        .digest(bytes)
        .joinToString("") { "%02x".format(it) }

    private fun safeKey(value: String): String = value.trim().also { key ->
        require(key.isNotBlank() && !key.startsWith('/') && !key.contains("..") && !key.contains('\\')) {
            "Invalid Apple Pay association object key"
        }
    }
}
