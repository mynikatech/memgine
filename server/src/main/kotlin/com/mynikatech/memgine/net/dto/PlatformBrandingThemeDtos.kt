package com.mynikatech.memgine.net.dto

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

@Serializable data class PlatformBrandingThemeDto(val id: String, val code: String, val displayName: String, val description: String? = null, val draftTheme: JsonObject? = null, val publishedTheme: JsonObject? = null, val publicationStatus: String, val isActive: Boolean, val publishedAt: String? = null, val versionNo: Int)
@Serializable data class PlatformBrandingThemeWriteDto(val displayName: String, val description: String? = null, val theme: JsonObject, val versionNo: Int? = null)
@Serializable data class PlatformBrandingThemeActivationDto(val versionNo: Int, val active: Boolean = true)
