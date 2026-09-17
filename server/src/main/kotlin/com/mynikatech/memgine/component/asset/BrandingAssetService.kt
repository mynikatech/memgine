package com.mynikatech.memgine.component.asset

import com.mynikatech.memgine.exception.BadRequestException
import java.nio.file.Path

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

        if (bytes.isEmpty()) {
            throw BadRequestException(
                "Branding asset is empty"
            )
        }

        if (
            bytes.size >
            MAX_ASSET_SIZE_BYTES
        ) {
            throw BadRequestException(
                "Branding asset must not exceed 10 MB"
            )
        }

        return storage.store(
            relativeDirectory =
                "organizations/" +
                    "$organizationId/" +
                    "branding/" +
                    assetType,
            fileName =
                fileName,
            bytes =
                bytes
        )
    }

    fun resolve(
        publicPath: String
    ): Path? =
        storage.resolve(
            publicPath
        )

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

    private companion object {

        const val MAX_ASSET_SIZE_BYTES =
            10 * 1024 * 1024

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
