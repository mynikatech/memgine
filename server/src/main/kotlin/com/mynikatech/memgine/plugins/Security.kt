package com.mynikatech.memgine.plugins

import com.mynikatech.memgine.config.ServerConfig
import io.ktor.server.application.Application
import io.ktor.server.application.install
import io.ktor.server.plugins.forwardedheaders.ForwardedHeaders
import io.ktor.server.plugins.forwardedheaders.XForwardedHeaders
import io.ktor.server.plugins.hsts.HSTS
import io.ktor.server.plugins.httpsredirect.HttpsRedirect

fun Application.configureSecurity(config: ServerConfig) {

    install(ForwardedHeaders)
    install(XForwardedHeaders)

    if (config.enforceHttps) {
        install(HttpsRedirect) {
            sslPort = 443
            permanentRedirect = true
        }

        install(HSTS) {
            includeSubDomains = true
            preload = true
        }
    }
}