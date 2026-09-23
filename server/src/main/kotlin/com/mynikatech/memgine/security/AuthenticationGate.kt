package com.mynikatech.memgine.security

import com.mynikatech.memgine.component.auth.AuthenticationService
import com.mynikatech.memgine.component.auth.authenticationToken
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

        val principal = service.resolve(call.authenticationToken(config))
        if (principal != null) call.attributes.put(AuthenticatedPrincipalKey, principal)

        if (path.startsWith("/api/v1/auth/")) {
            if (path.endsWith("/logout") || path.endsWith("/password")) {
                if (principal == null) throw UnauthorizedException("Authentication is required")
            }
            return@intercept
        }

        // Stripe authenticates this callback with its signed raw request body.
        if (path == "/api/v1/payments/providers/stripe/webhook") {
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
            path.startsWith("/api/v1/customer/") -> protectCustomerPath(
                principal, path, call.request.httpMethod
            )
            path.startsWith("/api/v1/pos/") -> {
                if (path !in setOf("/api/v1/pos/context", "/api/v1/pos/unlock")) {
                    if (principal == null) throw UnauthorizedException("Authentication is required")
                }
            }
        }
    }
}

private fun protectCustomerPath(principal: AuthenticatedPrincipal?, path: String, method: HttpMethod) {
    val publicCatalogRead = method == HttpMethod.Get && (
        path.endsWith("/membership-products") || path.endsWith("/benefits")
    )
    val publicAcquisition = method == HttpMethod.Post && path.endsWith("/purchases")
    if (!publicCatalogRead && !publicAcquisition) {
        if (principal == null) throw UnauthorizedException("Authentication is required")
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

    if (resource == "payments" && method == HttpMethod.Post && parts.getOrNull(6) == "test-result") {
        val authenticated = principal ?: throw UnauthorizedException("Authentication is required")
        if (
            authenticated.has("COUNTER_ACCESS", organizationId) ||
            authenticated.has("ORG_ADMIN_ACCESS", organizationId)
        ) {
            return
        }
        throw ForbiddenException("Access is not permitted")
    }

    if (resource == "payments" && method == HttpMethod.Get) {
        // The payment function performs the final creator/customer ownership check.
        // This permits a signed-in customer to poll only their own Checkout result.
        if (principal == null) throw UnauthorizedException("Authentication is required")
        return
    }

    if (resource == "payments" && method == HttpMethod.Post && parts.getOrNull(6) == "moneris") {
        // The confirmation service first reads through payment_get_intent, which
        // enforces creator/customer ownership before the one-time token is sent.
        if (principal == null) throw UnauthorizedException("Authentication is required")
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
