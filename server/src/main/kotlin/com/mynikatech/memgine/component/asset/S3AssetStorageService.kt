package com.mynikatech.memgine.component.asset

import software.amazon.awssdk.core.ResponseBytes
import software.amazon.awssdk.core.sync.RequestBody
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.GetObjectRequest
import software.amazon.awssdk.services.s3.model.GetObjectResponse
import software.amazon.awssdk.services.s3.model.PutObjectRequest
import software.amazon.awssdk.services.s3.model.S3Exception
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest
import java.util.UUID

class S3AssetStorageService(
    private val bucket: String,
    region: String,
    private val client: S3Client = S3Client.builder()
        .region(Region.of(region))
        .build(),
    private val publicBasePath: String = "/api/v1/assets"
) : AssetStorageService {

    init {
        require(bucket.isNotBlank()) { "S3 asset bucket is required" }
    }

    override fun store(
        relativeDirectory: String,
        fileName: String,
        contentType: String?,
        bytes: ByteArray
    ): StoredAsset {
        val safeDirectory = AssetPathMapper.sanitizeDirectory(relativeDirectory)
        val storedFileName = AssetPathMapper.newStoredFileName(fileName)
        val key = AssetPathMapper.s3Key(safeDirectory, storedFileName)

        client.putObject(
            PutObjectRequest.builder()
                .bucket(bucket)
                .key(key)
                .contentType(contentType)
                .build(),
            RequestBody.fromBytes(bytes)
        )

        return StoredAsset("$publicBasePath/$safeDirectory/$storedFileName")
    }

    override fun load(publicPath: String): StoredAssetContent? {
        val key = AssetPathMapper.s3KeyFromPublicPath(publicBasePath, publicPath)
            ?: return null

        return try {
            val response: ResponseBytes<GetObjectResponse> = client.getObjectAsBytes(
                GetObjectRequest.builder().bucket(bucket).key(key).build()
            )
            StoredAssetContent(
                bytes = response.asByteArray(),
                contentType = response.response().contentType()
            )
        } catch (error: S3Exception) {
            if (error.statusCode() == 404) null else throw error
        }
    }

    override fun delete(publicPath: String): Boolean {
        val key = AssetPathMapper.s3KeyFromPublicPath(publicBasePath, publicPath)
            ?: return false

        return try {
            client.deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(key).build())
            true
        } catch (error: S3Exception) {
            if (error.statusCode() == 404) false else throw error
        }
    }
}

internal object AssetPathMapper {
    fun sanitizeDirectory(value: String): String {
        val normalized = value.replace('\\', '/').trim('/')
        require(
            normalized.isNotBlank() && normalized.split('/').all {
                it.isNotBlank() && it != "." && it != ".." &&
                    it.matches(Regex("[A-Za-z0-9._-]+"))
            }
        ) { "Invalid asset directory" }
        return normalized
    }

    fun newStoredFileName(fileName: String): String {
        val extension = fileName.substringAfterLast('.', "").lowercase()
            .takeIf { it.matches(Regex("[a-z0-9]{1,10}")) }
        return if (extension == null) UUID.randomUUID().toString()
        else "${UUID.randomUUID()}.$extension"
    }

    fun s3Key(relativeDirectory: String, fileName: String): String {
        val parts = sanitizeDirectory(relativeDirectory).split('/')
        require(parts.size == 4 && parts[0] == "organizations" && parts[2] == "branding") {
            "Invalid branding asset directory"
        }
        require(fileName.matches(Regex("[A-Za-z0-9._-]+"))) { "Invalid asset file name" }
        return "branding/organizations/${parts[1]}/${parts[3]}/$fileName"
    }

    fun s3KeyFromPublicPath(publicBasePath: String, publicPath: String): String? {
        if (!publicPath.startsWith("$publicBasePath/")) return null
        val parts = publicPath.removePrefix(publicBasePath).trimStart('/').split('/')
        if (parts.size != 5 || parts[0] != "organizations" || parts[2] != "branding") return null
        return try {
            s3Key(parts.take(4).joinToString("/"), parts[4])
        } catch (_: IllegalArgumentException) {
            null
        }
    }
}
