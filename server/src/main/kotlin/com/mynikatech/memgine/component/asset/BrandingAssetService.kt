package com.mynikatech.memgine.component.asset

import com.mynikatech.memgine.exception.BadRequestException
import java.io.ByteArrayInputStream
import javax.imageio.ImageIO

class BrandingAssetService(
    private val storage:
        AssetStorageService
) {

    fun upload(
        organizationId: String,
        assetType: String,
        fileName: String,
        contentType: String?,
        bytes: ByteArray
    ): StoredAsset {

        validateOrganizationId(
            organizationId
        )

        if (
            assetType !in
            ALLOWED_ASSET_TYPES
        ) {
            throw BadRequestException(
                "Unsupported branding asset type"
            )
        }

        if (
            contentType !in
            ALLOWED_CONTENT_TYPES
        ) {
            throw BadRequestException(
                "Unsupported branding asset format"
            )
        }

        validateImage(contentType, bytes)

        return storage.store(
            relativeDirectory =
                "organizations/" +
                    "$organizationId/" +
                    "branding/" +
                    assetType,
            fileName =
                fileName,
            contentType =
                contentType,
            bytes =
                bytes
        )
    }

    fun load(
        publicPath: String
    ): StoredAssetContent? =
        storage.load(
            publicPath
        )

    fun uploadPlatformThemeBackground(
        themeCode: String,
        fileName: String,
        contentType: String?,
        bytes: ByteArray
    ): StoredAsset {
        if (!themeCode.matches(Regex("[a-z0-9]+(?:-[a-z0-9]+)*"))) {
            throw BadRequestException("Invalid platform theme code")
        }
        validateImage(contentType, bytes)
        return storage.store(
            relativeDirectory = "branding/platform-themes/$themeCode/${java.util.UUID.randomUUID()}",
            fileName = fileName,
            contentType = contentType,
            bytes = bytes
        )
    }

    private fun validateOrganizationId(
        organizationId: String
    ) {

        if (
            organizationId.isBlank() ||
            organizationId.length > 64 ||
            !organizationId.matches(
                Regex(
                    "[A-Za-z0-9._-]+"
                )
            )
        ) {
            throw BadRequestException(
                "Invalid organization id"
            )
        }
    }

    private fun validateImage(contentType: String?, bytes: ByteArray) {
        if (contentType !in ALLOWED_CONTENT_TYPES) throw BadRequestException("Unsupported branding asset format")
        if (bytes.isEmpty()) throw BadRequestException("Branding asset is empty")
        if (bytes.size > MAX_ASSET_SIZE_BYTES) throw BadRequestException("Branding asset must not exceed 10 MB")
        val detected = detectImage(bytes) ?: throw BadRequestException("Branding asset is malformed or unsupported")
        if (detected.contentType != contentType) throw BadRequestException("Branding asset content does not match its declared format")
        if (detected.width !in 1..MAX_IMAGE_DIMENSION || detected.height !in 1..MAX_IMAGE_DIMENSION) {
            throw BadRequestException("Branding asset dimensions must not exceed ${MAX_IMAGE_DIMENSION}px")
        }
    }

    private fun detectImage(bytes: ByteArray): ImageInfo? = when {
        bytes.size >= 24 && bytes.copyOfRange(0, 8).contentEquals(PNG_SIGNATURE) ->
            ImageInfo("image/png", readInt(bytes, 16), readInt(bytes, 20))
        bytes.size >= 12 && bytes[0] == 'R'.code.toByte() && bytes[1] == 'I'.code.toByte() && bytes[2] == 'F'.code.toByte() && bytes[3] == 'F'.code.toByte() && bytes.copyOfRange(8, 12).decodeToString() == "WEBP" -> webpInfo(bytes)
        bytes.size >= 3 && bytes[0] == 0xFF.toByte() && bytes[1] == 0xD8.toByte() && bytes[2] == 0xFF.toByte() ->
            ImageIO.read(ByteArrayInputStream(bytes))?.let { ImageInfo("image/jpeg", it.width, it.height) }
        else -> null
    }

    private fun webpInfo(bytes: ByteArray): ImageInfo? {
        if (bytes.size < 30) return null
        return when (bytes.copyOfRange(12, 16).decodeToString()) {
            "VP8X" -> ImageInfo("image/webp", 1 + little24(bytes, 24), 1 + little24(bytes, 27))
            "VP8L" -> if (bytes.size >= 25 && bytes[20] == 0x2F.toByte()) {
                val value = (bytes[21].toInt() and 0xFF) or ((bytes[22].toInt() and 0xFF) shl 8) or ((bytes[23].toInt() and 0xFF) shl 16) or ((bytes[24].toInt() and 0xFF) shl 24)
                ImageInfo("image/webp", (value and 0x3FFF) + 1, ((value shr 14) and 0x3FFF) + 1)
            } else null
            "VP8 " -> if (bytes.size >= 30 && bytes[23] == 0x9D.toByte() && bytes[24] == 0x01.toByte() && bytes[25] == 0x2A.toByte()) {
                ImageInfo("image/webp", little16(bytes, 26) and 0x3FFF, little16(bytes, 28) and 0x3FFF)
            } else null
            else -> null
        }
    }

    private fun readInt(bytes: ByteArray, offset: Int): Int =
        ((bytes[offset].toInt() and 0xFF) shl 24) or ((bytes[offset + 1].toInt() and 0xFF) shl 16) or ((bytes[offset + 2].toInt() and 0xFF) shl 8) or (bytes[offset + 3].toInt() and 0xFF)

    private fun little24(bytes: ByteArray, offset: Int): Int =
        (bytes[offset].toInt() and 0xFF) or ((bytes[offset + 1].toInt() and 0xFF) shl 8) or ((bytes[offset + 2].toInt() and 0xFF) shl 16)

    private fun little16(bytes: ByteArray, offset: Int): Int =
        (bytes[offset].toInt() and 0xFF) or ((bytes[offset + 1].toInt() and 0xFF) shl 8)

    private data class ImageInfo(val contentType: String, val width: Int, val height: Int)

    private companion object {

        const val MAX_ASSET_SIZE_BYTES =
            10 * 1024 * 1024
        const val MAX_IMAGE_DIMENSION = 8192
        val PNG_SIGNATURE = byteArrayOf(137.toByte(), 80, 78, 71, 13, 10, 26, 10)

        val ALLOWED_ASSET_TYPES =
            setOf(
                "logo",
                "darkThemeLogo",
                "favicon",
                "splashScreen",
                "heroImage",
                "offerPromotion"
            )

        val ALLOWED_CONTENT_TYPES =
            setOf(
                "image/jpeg",
                "image/png",
                "image/webp"
            )
    }
}
