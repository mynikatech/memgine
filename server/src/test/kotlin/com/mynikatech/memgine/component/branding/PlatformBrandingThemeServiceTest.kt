package com.mynikatech.memgine.component.branding

import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertNotNull

class PlatformBrandingThemeServiceTest {
    @Test
    fun `published catalog retains each preset's own palette for organization galleries`() {
        val service = PlatformBrandingThemeService(
            ThemeSqlFake(
                listOf(
                    row("classic", "{\"primaryColor\":\"#0F766E\",\"secondaryColor\":\"#115E59\",\"accentColor\":\"#F59E0B\",\"backgroundColor\":\"#FFFFFF\",\"textColor\":\"#1F2937\",\"backgroundImageUrl\":null}"),
                    row("christmas", "{\"primaryColor\":\"#166534\",\"secondaryColor\":\"#14532D\",\"accentColor\":\"#DC2626\",\"backgroundColor\":\"#F0FDF4\",\"textColor\":\"#1F2937\",\"backgroundImageUrl\":\"/api/v1/assets/branding/platform-themes/christmas/background.webp\"}")
                )
            )
        )

        val published = service.listPublished().associateBy { it.code }
        val classic = assertNotNull(published["classic"]?.publishedTheme)
        val christmas = assertNotNull(published["christmas"]?.publishedTheme)

        assertEquals("#0F766E", classic["primaryColor"]?.jsonPrimitive?.content)
        assertEquals("#166534", christmas["primaryColor"]?.jsonPrimitive?.content)
        assertNotEquals(classic, christmas)
        assertEquals(
            "/api/v1/assets/branding/platform-themes/christmas/background.webp",
            christmas["backgroundImageUrl"]?.jsonPrimitive?.content
        )
    }

    private fun row(code: String, publishedTheme: String) = PlatformBrandingThemeRow(
        id = "PTH_${code.uppercase().replace('-', '_')}",
        code = code,
        displayName = code,
        publishedTheme = publishedTheme,
        publicationStatus = "PUBLISHED",
        versionNo = 1
    )

    private class ThemeSqlFake(private val publishedRows: List<PlatformBrandingThemeRow>) : PlatformBrandingThemeSql {
        override fun listPublished(): List<PlatformBrandingThemeRow> = publishedRows

        override fun getPublished(idOrCode: String): PlatformBrandingThemeRow? =
            publishedRows.firstOrNull { it.id == idOrCode || it.code == idOrCode }

        override fun listAll(actorUserId: String): List<PlatformBrandingThemeRow> = publishedRows

        override fun get(idOrCode: String, actorUserId: String): PlatformBrandingThemeRow? =
            getPublished(idOrCode)

        override fun saveDraft(
            id: String?,
            name: String,
            description: String?,
            themeJson: String,
            versionNo: Int?,
            actorUserId: String
        ): String = error("Not used by this test")

        override fun publish(id: String, versionNo: Int, actorUserId: String): Boolean =
            error("Not used by this test")

        override fun setActive(id: String, versionNo: Int, active: Boolean, actorUserId: String): Boolean =
            error("Not used by this test")
    }
}
