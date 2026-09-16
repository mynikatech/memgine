package com.mynikatech.memgine

import com.mynikatech.memgine.component.asset.BrandingAssetService
import com.mynikatech.memgine.component.asset.LocalAssetStorageService
import com.mynikatech.memgine.component.entitystatus.EntityStatusCache
import com.mynikatech.memgine.component.entitystatus.EntityStatusService
import com.mynikatech.memgine.component.entitystatus.EntityStatusSql
import com.mynikatech.memgine.component.referencedata.ReferenceDataCache
import com.mynikatech.memgine.component.referencedata.ReferenceDataService
import com.mynikatech.memgine.component.referencedata.ReferenceDataSql
import com.mynikatech.memgine.config.AppConfig
import com.mynikatech.memgine.database.DatabaseFactory
import com.mynikatech.memgine.plugins.configureCors
import com.mynikatech.memgine.plugins.configureMonitoring
import com.mynikatech.memgine.plugins.configureRouting
import com.mynikatech.memgine.plugins.configureSecurity
import com.mynikatech.memgine.plugins.configureSerialization
import com.mynikatech.memgine.plugins.configureStatusPages
import io.ktor.server.application.Application
import io.ktor.server.engine.embeddedServer
import io.ktor.server.netty.Netty
import java.nio.file.Paths

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
    configureCors()

    val referenceDataSql =
        database.jdbi.onDemand(ReferenceDataSql::class.java)

    val referenceDataCache =
        ReferenceDataCache()

    val referenceDataService =
        ReferenceDataService(
            referenceDataSql,
            referenceDataCache
        )

    val entityStatusSql =
        database.jdbi.onDemand(EntityStatusSql::class.java)

    val entityStatusCache =
        EntityStatusCache()

    val entityStatusService =
        EntityStatusService(
            entityStatusSql,
            entityStatusCache
        )

    // Populate server caches from PostgreSQL during startup.
    referenceDataService.refresh()
    entityStatusService.refresh()

    val assetStorageService =
        LocalAssetStorageService(
            rootDirectory =
                Paths.get(
                    "server-data",
                    "uploads"
                )
        )

    val brandingAssetService =
        BrandingAssetService(
            assetStorageService
        )

    configureRouting(
        database,
        referenceDataService,
        entityStatusService,
        brandingAssetService
    )
}