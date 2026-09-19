package com.mynikatech.memgine.security

import com.mynikatech.memgine.component.auth.AuthenticationService
import com.mynikatech.memgine.config.AuthenticationConfig
import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.exception.ForbiddenException
import com.mynikatech.memgine.exception.UnauthorizedException
import io.ktor.http.HttpMethod
import io.ktor.server.application.Application
import io.ktor.server.application.ApplicationCallPipeline
import io.ktor.server.application.call
import io.ktor.server.request.path
import io.ktor.server.request.httpMethod

fun Application.installAuthenticationGate(
    service: AuthenticationService,
    config: AuthenticationConfig
) {
    intercept(ApplicationCallPipeline.Plugins) {
        val path = call.request.path()
        if (!path.startsWith("/api/v1/")) return@intercept
        if (call.request.httpMethod == HttpMethod.Options) {
            return@intercept
        }

        val principal = service.resolve(call.request.cookies[config.cookieName])
        if (principal != null) call.attributes.put(AuthenticatedPrincipalKey, principal)

        if (path.startsWith("/api/v1/auth/")) {
            if (path.endsWith("/logout") || path.endsWith("/password")) {
                if (principal == null) throw UnauthorizedException("Authentication is required")
            }
            return@intercept
        }

        when {
            path.startsWith("/api/v1/platform/") -> require(principal, "PLATFORM_ADMIN_ACCESS")
            path.startsWith("/api/v1/dev/rbac") -> require(principal, "PLATFORM_ADMIN_ACCESS")
            path.startsWith("/api/v1/branding-assets/") ->
                require(principal, "ORG_ADMIN_ACCESS", path.substringAfterLast('/'))
            path.startsWith("/api/v1/organizations/") -> protectOrganizationPath(
                principal, path, call.request.httpMethod
            )
        }
    }
}

private fun protectOrganizationPath(
    principal: AuthenticatedPrincipal?,
    path: String,
    method: HttpMethod
) {
    val parts = path.split('/').filter(String::isNotEmpty)
    val scope = parts.getOrNull(3) ?: return

    if (scope == "update") {
        val organizationId = parts.getOrNull(4)
            ?: throw BadRequestException("Organization id is required")

        val authenticated = principal
            ?: throw UnauthorizedException("Authentication is required")

        if (
            !authenticated.has("PLATFORM_ADMIN_ACCESS") &&
            !authenticated.has("ORG_ADMIN_ACCESS", organizationId)
        ) {
            throw ForbiddenException("Access is not permitted")
        }

        return
    }

    val platformOperations = setOf(
        "create",
        "activate",
        "deactivate",
        "list"
    )

    if (scope in platformOperations) {
        require(principal, "PLATFORM_ADMIN_ACCESS")
        return
    }

    val publicReads = setOf(
        "get",
        "aggregate",
        "details",
        "branding"
    )

    if (scope in publicReads && method == HttpMethod.Get) {
        return
    }

    val organizationId = scope
    val resource = parts.getOrNull(4)

    if (resource == "counter") {
        require(principal, "COUNTER_ACCESS", organizationId)
        return
    }

    val counterReadResources = setOf(
        "stores",
        "staff",
        "staff-store-assignments",
        "users",
        "membership-products"
    )

    if (
        method == HttpMethod.Get &&
        resource in counterReadResources
    ) {
        val authenticated = principal
            ?: throw UnauthorizedException("Authentication is required")

        if (
            authenticated.has("COUNTER_ACCESS", organizationId) ||
            authenticated.has("ORG_ADMIN_ACCESS", organizationId)
        ) {
            return
        }

        throw ForbiddenException("Access is not permitted")
    }

    require(principal, "ORG_ADMIN_ACCESS", organizationId)
}

private fun require(
    principal: AuthenticatedPrincipal?, capability: String, organizationId: String? = null
) {
    val authenticated = principal ?: throw UnauthorizedException("Authentication is required")
    if (organizationId != null && organizationId.isBlank()) {
        throw BadRequestException("Organization id is required")
    }
    authenticated.require(capability, organizationId)
}
