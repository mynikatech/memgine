package com.mynikatech.memgine.component.asset

import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardOpenOption
import java.util.UUID

class LocalAssetStorageService(
    rootDirectory: Path,
    private val publicBasePath: String =
        "/api/v1/assets"
) : AssetStorageService {

    private val rootDirectory =
        rootDirectory
            .toAbsolutePath()
            .normalize()

    override fun store(
        relativeDirectory: String,
        fileName: String,
        bytes: ByteArray
    ): StoredAsset {

        val safeDirectory =
            sanitizeDirectory(
                relativeDirectory
            )

        val extension =
            fileName
                .substringAfterLast(
                    '.',
                    ""
                )
                .lowercase()
                .takeIf {
                    it.matches(
                        Regex(
                            "[a-z0-9]{1,10}"
                        )
                    )
                }

        val storedFileName =
            if (extension != null) {
                "${UUID.randomUUID()}.$extension"
            } else {
                UUID.randomUUID()
                    .toString()
            }

        val directory =
            rootDirectory
                .resolve(
                    safeDirectory
                )
                .normalize()

        require(
            directory.startsWith(
                rootDirectory
            )
        ) {
            "Invalid asset directory"
        }

        Files.createDirectories(
            directory
        )

        val destination =
            directory
                .resolve(
                    storedFileName
                )
                .normalize()

        require(
            destination.startsWith(
                rootDirectory
            )
        ) {
            "Invalid asset path"
        }

        Files.write(
            destination,
            bytes,
            StandardOpenOption.CREATE_NEW
        )

        val normalizedDirectory =
            safeDirectory.replace(
                '\\',
                '/'
            )

        return StoredAsset(
            path =
                "$publicBasePath/" +
                    "$normalizedDirectory/" +
                    storedFileName
        )
    }

    override fun resolve(
        publicPath: String
    ): Path? {

        if (
            !publicPath.startsWith(
                "$publicBasePath/"
            )
        ) {
            return null
        }

        val relativePath =
            publicPath
                .removePrefix(
                    publicBasePath
                )
                .trimStart('/')

        if (relativePath.isBlank()) {
            return null
        }

        val resolved =
            rootDirectory
                .resolve(
                    relativePath
                )
                .normalize()

        if (
            !resolved.startsWith(
                rootDirectory
            )
        ) {
            return null
        }

        return resolved
    }

    override fun delete(
        publicPath: String
    ): Boolean {

        val resolved =
            resolve(
                publicPath
            )
                ?: return false

        return Files.deleteIfExists(
            resolved
        )
    }

    private fun sanitizeDirectory(
        value: String
    ): String {

        val normalized =
            value
                .replace(
                    '\\',
                    '/'
                )
                .trim('/')

        require(
            normalized.isNotBlank() &&
                normalized
                    .split('/')
                    .all {
                        it.isNotBlank() &&
                            it != "." &&
                            it != ".." &&
                            it.matches(
                                Regex(
                                    "[A-Za-z0-9._-]+"
                                )
                            )
                    }
        ) {
            "Invalid asset directory"
        }

        return normalized
    }
}