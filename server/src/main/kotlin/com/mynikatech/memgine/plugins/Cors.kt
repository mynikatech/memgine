package com.mynikatech.memgine.plugins

import com.mynikatech.memgine.config.ServerConfig
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.server.application.Application
import io.ktor.server.application.install
import io.ktor.server.plugins.cors.routing.CORS
import java.net.URI

fun Application.configureCors(config: ServerConfig) {
    install(CORS) {
        allowCredentials = true

        config.corsAllowedHosts.forEach { configuredOrigin ->
            val origin = configuredOrigin.trim()
            if (origin.contains("://")) {
                val uri = try {
                    URI(origin)
                } catch (_: Exception) {
                    error("Invalid CORS origin: $origin")
                }
                require(uri.scheme in setOf("http", "https") && !uri.host.isNullOrBlank()) {
                    "Invalid CORS origin: $origin"
                }
                val host = if (uri.port == -1) uri.host else "${uri.host}:${uri.port}"
                allowHost(host, schemes = listOf(uri.scheme))
            } else {
                // Compatibility for existing local properties. New environment
                // templates use complete, scheme-qualified origins.
                allowHost(origin)
            }
        }

        allowMethod(HttpMethod.Options)
        allowMethod(HttpMethod.Post)
        allowMethod(HttpMethod.Get)
        allowMethod(HttpMethod.Put)
        allowMethod(HttpMethod.Delete)

        allowHeader(HttpHeaders.ContentType)
        allowHeader(HttpHeaders.Authorization)
    }
}
