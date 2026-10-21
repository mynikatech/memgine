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
            if (
                path.endsWith("/logout") ||
                path.endsWith("/password") ||
                path.endsWith("/customer/account/deletion-preview") ||
                (path.endsWith("/customer/account") && call.request.httpMethod == HttpMethod.Delete)
            ) {
                if (principal == null) throw UnauthorizedException("Authentication is required")
            }
            return@intercept
        }

        // Stripe authenticates this callback with its signed raw request body.
        if (path == "/api/v1/payments/providers/stripe/webhook") {
            return@intercept
        }
        if (path == "/api/v1/webhooks/whatsapp/meta" || path == "/api/v1/webhooks/whatsapp/delivery-ack") {
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
    val publicDiscoveryRead = method == HttpMethod.Get && isPublicCustomerDiscoveryPath(path)
    val publicCatalogRead = method == HttpMethod.Get && (
        path.endsWith("/membership-products") || path.endsWith("/benefits")
    )
    val publicAcquisition = method == HttpMethod.Post && path.endsWith("/purchases")
    if (!publicDiscoveryRead && !publicCatalogRead && !publicAcquisition) {
        if (principal == null) throw UnauthorizedException("Authentication is required")
    }
}

private fun isPublicCustomerDiscoveryPath(path: String): Boolean {
    val organizationsPath = "/api/v1/customer/discover/organizations"

    if (path == organizationsPath) return true

    val organizationId = path.removePrefix("$organizationsPath/")
    return path.startsWith("$organizationsPath/") &&
        organizationId.isNotBlank() &&
        '/' !in organizationId
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
        // PaymentService and the payment SQL functions verify that this principal owns
        // the requested intent. CUSTOMER_SESSION purchases have no organization role
        // until successful finalization creates the customer relationship.
        if (principal == null) throw UnauthorizedException("Authentication is required")
        return
    }

    if (
        resource == "payments" &&
        method == HttpMethod.Post &&
        parts.size == 7 &&
        parts[6] == "cancel"
    ) {
        // Customer-owned payment cancellation remains authenticated here; the
        // payment service and payment_cancel_intent enforce exact ownership.
        if (principal == null) {
            throw UnauthorizedException("Authentication is required")
        }
        return
    }
    if (resource == "payments" &&
        method == HttpMethod.Post &&
        parts.getOrNull(6) in setOf("reconcile", "recover-fulfillment")) {
        // Allow an authenticated customer to request reconciliation.
        // PaymentService.get() enforces ownership of the payment intent.
        if (principal == null) {
            throw UnauthorizedException("Authentication is required")
        }
        return
    }
    
    if (resource == "payments" &&
        method == HttpMethod.Get &&
        parts.size == 6) {
        // PaymentService and the SQL functions enforce payment ownership.
        // This also permits customer-scoped financial-exception lookup
        // only through the separately authorized path below.
        if (principal == null) {
            throw UnauthorizedException("Authentication is required")
        }
        return
    }

    if (resource == "payments" &&
        method == HttpMethod.Get &&
        parts.size == 7 &&
        parts[6] == "financial-exception") {
        // Stage B: the service and SQL must verify ownership of this
        // payment intent before returning financial exception details.
        if (principal == null) {
            throw UnauthorizedException("Authentication is required")
        }
        return
    }

    if (resource == "payments" && method == HttpMethod.Post &&
        parts.getOrNull(6) in setOf("moneris", "poynt-collect")) {
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

    if (
        resource == "payments" &&
        method == HttpMethod.Get &&
        parts.size == 8 &&
        parts[6] == "poynt-collect" &&
        parts[7] == "config"
    ) {
        // The payment service and configuration function verify that the
        // authenticated customer owns this exact CUSTOMER_SESSION intent.
        if (principal == null) {
            throw UnauthorizedException("Authentication is required")
        }
        return
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
