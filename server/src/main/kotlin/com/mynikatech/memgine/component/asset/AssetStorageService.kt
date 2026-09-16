package com.mynikatech.memgine.component.asset

import java.nio.file.Path

data class StoredAsset(
    val path: String
)

interface AssetStorageService {

    fun store(
        relativeDirectory: String,
        fileName: String,
        bytes: ByteArray
    ): StoredAsset

    fun resolve(
        publicPath: String
    ): Path?

    fun delete(
        publicPath: String
    ): Boolean
}