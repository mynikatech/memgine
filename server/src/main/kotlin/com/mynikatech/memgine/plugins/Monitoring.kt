package com.mynikatech.memgine.plugins

import io.ktor.server.application.Application
import io.ktor.server.application.install
import io.ktor.server.plugins.callid.CallId
import io.ktor.server.plugins.calllogging.CallLogging
import io.ktor.server.request.path
import org.slf4j.event.Level
import java.util.UUID

fun Application.configureMonitoring() {
    install(CallId) {
        header("X-Request-Id")
        generate { UUID.randomUUID().toString() }
        verify { it.length in 1..100 }
        replyToHeader("X-Request-Id")
    }

    install(CallLogging) {
        level = Level.INFO
        filter { call ->
            !call.request.path().startsWith("/health")
        }
    }
}