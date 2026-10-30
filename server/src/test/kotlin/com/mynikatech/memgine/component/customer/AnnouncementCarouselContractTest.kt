package com.mynikatech.memgine.component.customer

import com.mynikatech.memgine.net.dto.SaveBrandingDraftRequestDto
import com.mynikatech.memgine.net.dto.OrganizationBrandingDto
import java.nio.file.Files
import java.nio.file.Path
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** Source and DTO contracts; PostgreSQL constraints require an isolated database test. */
class AnnouncementCarouselContractTest {
    private val sql = Files.readString(Path.of("..", "DB", "liquibase", "sql", "250-announcement-carousel.sql"))

    @Test
    fun `draft DTO round trip retains every announcement and order`() {
        val configuration = Json.parseToJsonElement("""{"displayMode":"CAROUSEL","rotationIntervalSeconds":7,"items":[{"id":"a","enabled":true,"message":"First","style":"TICKER","displayOrder":1},{"id":"b","enabled":true,"message":"Second","style":"TYPEWRITER","displayOrder":0}]}""").jsonObject
        val request = SaveBrandingDraftRequestDto(
            id = "branding-1", organizationId = "org-1", versionNo = 3,
            announcementConfiguration = configuration,
        )
        val restored = Json.decodeFromString<SaveBrandingDraftRequestDto>(Json.encodeToString(request))
        assertEquals(configuration, restored.announcementConfiguration)
        assertEquals("a", restored.announcementConfiguration!!["items"]!!.jsonArray[0].jsonObject["id"]!!.jsonPrimitive.content)
        assertEquals(3, restored.versionNo)
    }

    @Test
    fun `published branding DTO retains carousel and accepts older snapshots`() {
        val brandingJson = """{"id":"branding-1","organizationId":"org-1","brandingName":"Bakery","themeTemplateId":"classic","brandingStatusId":"active","announcementConfiguration":{"displayMode":"CAROUSEL","rotationIntervalSeconds":5,"items":[{"id":"first","enabled":true,"message":"Hello","style":"FADE","displayOrder":0}]}}"""
        val published = Json.decodeFromJsonElement<OrganizationBrandingDto>(Json.parseToJsonElement(brandingJson))
        assertEquals("CAROUSEL", published.announcementConfiguration!!["displayMode"]!!.jsonPrimitive.content)
        assertEquals("first", published.announcementConfiguration!!["items"]!!.jsonArray[0].jsonObject["id"]!!.jsonPrimitive.content)
        val older = Json.decodeFromJsonElement<OrganizationBrandingDto>(Json.parseToJsonElement("""{"id":"branding-1","organizationId":"org-1","brandingName":"Bakery","themeTemplateId":"classic","brandingStatusId":"active","announcementEnabled":true,"announcementMessage":"Legacy"}"""))
        assertEquals(null, older.announcementConfiguration)
        assertEquals("Legacy", older.announcementMessage)
    }

    @Test
    fun `migration projects only released announcements for discovery`() {
        assertTrue(sql.contains("'announcementConfiguration', c.snapshot_data #> '{organizationBranding,announcementConfiguration}'"))
        assertTrue(sql.contains("cer.customer_experience_release_id = o.published_customer_experience_release_id"))
        assertTrue(sql.contains("cs.status_code = 'PUBLISHED'"))
        assertFalse(sql.contains("FROM \"\${schemaName}\".organization_branding ob"))
        assertTrue(sql.contains("'announcementConfiguration',b.announcement_configuration"))
        val previous = Files.readString(Path.of("..", "DB", "liquibase", "sql", "247-customer-discovery-published-announcements.sql"))
            .substringAfter("WITH candidate AS (")
        val current = sql.substringAfter("WITH candidate AS (")
        val expected = previous.replace(
            "'announcementEndsAt', c.snapshot_data #> '{organizationBranding,announcementEndsAt}'",
            "'announcementEndsAt', c.snapshot_data #> '{organizationBranding,announcementEndsAt}',\n" +
                "                    'announcementConfiguration', c.snapshot_data #> '{organizationBranding,announcementConfiguration}'"
        )
        val withoutTrailingWhitespace: (String) -> String = { text ->
            text.lineSequence().map(String::trimEnd).joinToString("\n").trim()
        }
        assertEquals(withoutTrailingWhitespace(expected), withoutTrailingWhitespace(current))
    }

    @Test
    fun `migration retains one legacy message and validates new configuration`() {
        assertTrue(sql.contains("'id', 'legacy-' || b.organization_branding_id"))
        assertTrue(sql.contains("'displayMode', 'SINGLE'"))
        assertTrue(sql.contains("jsonb_array_length(p_config -> 'items') > 20"))
        assertTrue(sql.contains("ck_organization_branding_announcement_configuration"))
        assertTrue(sql.contains("announcement_configuration=COALESCE(p_branding->'announcementConfiguration',announcement_configuration)"))
    }
}
