package com.mynikatech.memgine.component.asset

data class StoredAsset(
    val path: String
)

data class StoredAssetContent(
    val bytes: ByteArray,
    val contentType: String?
)

interface AssetStorageService {

    fun store(
        relativeDirectory: String,
        fileName: String,
        contentType: String?,
        bytes: ByteArray
    ): StoredAsset

    fun load(
        publicPath: String
    ): StoredAssetContent?

    fun delete(
        publicPath: String
    ): Boolean
}
