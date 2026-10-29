package com.mynikatech.memgine.component.branding

import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.model.common.ApiResponse
import com.mynikatech.memgine.net.dto.PlatformBrandingThemeActivationDto
import com.mynikatech.memgine.net.dto.PlatformBrandingThemeWriteDto
import com.mynikatech.memgine.security.authenticatedPrincipal
import io.ktor.http.HttpStatusCode
import io.ktor.server.plugins.callid.callId
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.put
import io.ktor.server.routing.route

fun Route.platformBrandingThemeRoutes(service: PlatformBrandingThemeService) {
    route("/branding-themes") {
        get { call.respond(ApiResponse.success(service.listPublished(), call.callId)) }
        get("/{themeIdOrCode}") { call.respond(ApiResponse.success(service.getPublished(requiredThemeId(call.parameters["themeIdOrCode"])), call.callId)) }
    }
    route("/platform/branding-themes") {
        get { call.respond(ApiResponse.success(service.listAll(call.authenticatedPrincipal().userId), call.callId)) }
        get("/{themeId}") { call.respond(ApiResponse.success(service.get(requiredThemeId(call.parameters["themeId"]), call.authenticatedPrincipal().userId), call.callId)) }
        post { val request = call.receive<PlatformBrandingThemeWriteDto>(); call.respond(HttpStatusCode.Created, ApiResponse.success(service.saveDraft(null, request, call.authenticatedPrincipal().userId), call.callId)) }
        put("/{themeId}/draft") { val request = call.receive<PlatformBrandingThemeWriteDto>(); call.respond(ApiResponse.success(service.saveDraft(requiredThemeId(call.parameters["themeId"]), request, call.authenticatedPrincipal().userId), call.callId)) }
        post("/{themeId}/publish") { val request = call.receive<PlatformBrandingThemeActivationDto>(); call.respond(ApiResponse.success(service.publish(requiredThemeId(call.parameters["themeId"]), request.versionNo, call.authenticatedPrincipal().userId), call.callId)) }
        put("/{themeId}/active") { val request = call.receive<PlatformBrandingThemeActivationDto>(); call.respond(ApiResponse.success(service.setActive(requiredThemeId(call.parameters["themeId"]), request.versionNo, request.active, call.authenticatedPrincipal().userId), call.callId)) }
    }
}

private fun requiredThemeId(value: String?): String = value?.trim()?.takeIf { it.isNotEmpty() } ?: throw BadRequestException("Theme id is required")
