package com.mynikatech.memgine.component.asset

import java.nio.file.Files
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class AssetStorageServiceTest {
    @Test
    fun `local storage preserves the API public path and serves stored bytes`() {
        val root = Files.createTempDirectory("memgine-assets-")

        try {
            val storage = LocalAssetStorageService(root)
            val stored = storage.store(
                relativeDirectory = "organizations/org-1/branding/logo",
                fileName = "logo.png",
                contentType = "image/png",
                bytes = byteArrayOf(1, 2, 3)
            )

            assertTrue(stored.path.startsWith("/api/v1/assets/organizations/org-1/branding/logo/"))
            assertTrue(stored.path.endsWith(".png"))

            val loaded = storage.load(stored.path)
            assertContentEquals(byteArrayOf(1, 2, 3), loaded?.bytes)
            assertTrue(storage.delete(stored.path))
            assertEquals(null, storage.load(stored.path))
        } finally {
            root.toFile().deleteRecursively()
        }
    }

    @Test
    fun `S3 key maps from the stable public branding path`() {
        val publicPath = "/api/v1/assets/organizations/org-1/branding/logo/image.png"

        assertEquals(
            "branding/organizations/org-1/logo/image.png",
            AssetPathMapper.s3KeyFromPublicPath("/api/v1/assets", publicPath)
        )
        assertFalse(AssetPathMapper.s3KeyFromPublicPath("/api/v1/assets", "/api/v1/assets/uploads/image.png") != null)
    }
}
