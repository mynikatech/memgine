package com.mynikatech.memgine.component.branding

import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.net.dto.PlatformBrandingThemeDto
import com.mynikatech.memgine.net.dto.PlatformBrandingThemeWriteDto
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.jdbi.v3.sqlobject.config.RegisterBeanMapper
import org.jdbi.v3.sqlobject.customizer.Bind
import org.jdbi.v3.sqlobject.statement.SqlQuery

@RegisterBeanMapper(PlatformBrandingThemeRow::class)
interface PlatformBrandingThemeSql {
    @SqlQuery(
        """
        SELECT
            "id",
            "code",
            "displayName",
            description,
            theme::text AS "publishedTheme",
            'PUBLISHED'::varchar AS "publicationStatus",
            true AS "isActive",
            NULL::timestamptz AS "publishedAt",
            "versionNo"
        FROM platform_branding_theme_list_published()
        """
    )
    fun listPublished(): List<PlatformBrandingThemeRow>

    @SqlQuery(
        """
        SELECT
            "id",
            "code",
            "displayName",
            description,
            theme::text AS "publishedTheme",
            'PUBLISHED'::varchar AS "publicationStatus",
            true AS "isActive",
            NULL::timestamptz AS "publishedAt",
            "versionNo"
        FROM platform_branding_theme_get_published(:idOrCode)
        """
    )
    fun getPublished(@Bind("idOrCode") idOrCode: String): PlatformBrandingThemeRow?

    @SqlQuery("SELECT * FROM platform_branding_theme_list_all(:actorUserId)")
    fun listAll(@Bind("actorUserId") actorUserId: String): List<PlatformBrandingThemeRow>

    @SqlQuery("SELECT * FROM platform_branding_theme_get(:idOrCode, :actorUserId)")
    fun get(@Bind("idOrCode") idOrCode: String, @Bind("actorUserId") actorUserId: String): PlatformBrandingThemeRow?

    @SqlQuery("SELECT platform_branding_theme_save_draft(:id, :name, :description, CAST(:themeJson AS jsonb), :versionNo, :actorUserId)")
    fun saveDraft(@Bind("id") id: String?, @Bind("name") name: String, @Bind("description") description: String?, @Bind("themeJson") themeJson: String, @Bind("versionNo") versionNo: Int?, @Bind("actorUserId") actorUserId: String): String

    @SqlQuery("SELECT platform_branding_theme_publish(:id, :versionNo, :actorUserId)")
    fun publish(@Bind("id") id: String, @Bind("versionNo") versionNo: Int, @Bind("actorUserId") actorUserId: String): Boolean

    @SqlQuery("SELECT platform_branding_theme_set_active(:id, :versionNo, :active, :actorUserId)")
    fun setActive(@Bind("id") id: String, @Bind("versionNo") versionNo: Int, @Bind("active") active: Boolean, @Bind("actorUserId") actorUserId: String): Boolean
}

data class PlatformBrandingThemeRow(
    var id: String = "",
    var code: String = "",
    var displayName: String = "",
    var description: String? = null,
    var draftTheme: String? = null,
    var publishedTheme: String? = null,
    var publicationStatus: String = "DRAFT",
    var isActive: Boolean = true,
    var publishedAt: String? = null,
    var versionNo: Int = 1
)

class PlatformBrandingThemeService(private val sql: PlatformBrandingThemeSql) {
    private val json = Json { ignoreUnknownKeys = true }

    fun listPublished() = sql.listPublished().map(::toDto)
    fun getPublished(idOrCode: String) = sql.getPublished(idOrCode)?.let(::toDto)
    fun listAll(actorUserId: String) = sql.listAll(actorUserId).map(::toDto)
    fun get(idOrCode: String, actorUserId: String) = sql.get(idOrCode, actorUserId)?.let(::toDto)

    fun saveDraft(id: String?, request: PlatformBrandingThemeWriteDto, actorUserId: String): PlatformBrandingThemeDto {
        val savedId = sql.saveDraft(id, request.displayName, request.description, json.encodeToString(kotlinx.serialization.json.JsonObject.serializer(), request.theme), request.versionNo, actorUserId)
        return get(savedId, actorUserId) ?: throw BadRequestException("Theme was not saved")
    }

    fun publish(id: String, versionNo: Int, actorUserId: String): PlatformBrandingThemeDto {
        sql.publish(id, versionNo, actorUserId)
        return get(id, actorUserId) ?: throw BadRequestException("Theme was not found")
    }

    fun setActive(id: String, versionNo: Int, active: Boolean, actorUserId: String): PlatformBrandingThemeDto {
        sql.setActive(id, versionNo, active, actorUserId)
        return get(id, actorUserId) ?: throw BadRequestException("Theme was not found")
    }

    private fun toDto(row: PlatformBrandingThemeRow) = PlatformBrandingThemeDto(
        id = row.id, code = row.code, displayName = row.displayName, description = row.description,
        draftTheme = row.draftTheme?.let(json::parseToJsonElement)?.jsonObject,
        publishedTheme = row.publishedTheme?.let(json::parseToJsonElement)?.jsonObject,
        publicationStatus = row.publicationStatus, isActive = row.isActive,
        publishedAt = row.publishedAt, versionNo = row.versionNo
    )
}
