package com.mynikatech.memgine

import com.mynikatech.memgine.config.AppConfig
import com.mynikatech.memgine.database.DatabaseFactory
import com.mynikatech.memgine.plugins.configureMonitoring
import com.mynikatech.memgine.plugins.configureRouting
import com.mynikatech.memgine.plugins.configureSecurity
import com.mynikatech.memgine.plugins.configureSerialization
import com.mynikatech.memgine.plugins.configureStatusPages
import io.ktor.server.application.Application
import io.ktor.server.engine.embeddedServer
import io.ktor.server.netty.Netty

fun main() {
    val config = AppConfig.load()

    embeddedServer(
        factory = Netty,
        host = config.server.host,
        port = config.server.port,
        module = Application::module
    ).start(wait = true)
}

fun Application.module() {
    val config = AppConfig.load(environment.config)
    val database = DatabaseFactory.create(config.database)

    monitor.subscribe(io.ktor.server.application.ApplicationStopped) {
        database.close()
    }

    configureSerialization()
    configureMonitoring()
    configureSecurity(config.server)
    configureStatusPages()
    configureRouting(database)
}
